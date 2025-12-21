import { User } from "../models/user.model";
import { UserProgress } from "../models/user_progress.model";
import { retrieveRelevantContentFromChroma, constructSearchQuery } from "./learningPath.retriever";

type Recommendation = {
  id: string;
  title: string;
  type: string;
  part: number | null;
  description?: string;
  estimated_time?: number;
  source: string;
  score: number;
  reason: string;
  action?: {
    kind: "start_practice" | "open_lesson" | "add_to_plan";
    route?: string; // frontend route hint
    payload?: any;
  };
};

/**
 * Recommend skill practice items based on user's IRT theta.
 * Focuses only on practice item types (no lessons): quiz, dictation, shadowing, vocab
 */
export async function recommendSkillPracticeService(userId: string, opts?: { topK?: number; perPart?: number }) {
  const topK = opts?.topK ?? 3;
  const perPart = opts?.perPart ?? 3;

  const user = await User.findById(userId).lean();
  if (!user) return [] as Recommendation[];

  // try to get user's progress (contains target_score/current_score)
  const progress = await UserProgress.findOne({ user_id: userId }).lean().exec();
  const targetScoreFromProgress = progress?.target_score ?? undefined;

  const thetaPartsRaw: Record<string, any> = user.latest_theta_parts || {};
  const entries = Object.entries(thetaPartsRaw).map(([k, v]) => ({ part: Number(k), theta: Number(v) }));
  if (entries.length === 0) return [] as Recommendation[];

  // sort ascending -> weakest first
  entries.sort((a, b) => a.theta - b.theta);
  const weakParts = entries.slice(0, Math.min(3, entries.length));

  const candidates: Recommendation[] = [];

  // For each weak part, query Chroma (using constructSearchQuery) and collect practice items
  for (const wp of weakParts) {
    const part = Number(wp.part);
    let query = "";
    try {
      query = constructSearchQuery({ part: part, target_score: Number(targetScoreFromProgress ?? 0), weak_skill: `Part ${part}` });
    } catch (err) {
      console.warn("recommendSkillPracticeService: constructSearchQuery failed, falling back to simple query", err);
      query = `TOEIC practice items for Part ${part}, focus on improvement and drill`;
    }

    // Retrieve from Chroma (global search, metadataFilter optional)
    try {
      const { results } = await retrieveRelevantContentFromChroma(null, query, { part_type: part }, 40);

      for (const r of results) {
        const meta = r.metadata || {};
        const itemType = (meta.item_type || meta.type || "").toString().toLowerCase();

        // Skip lessons and vocab — focus on practice drills (quiz/dictation/shadowing)
        if (itemType === "lesson" || itemType === "vocab") continue;

        const weight = Number(meta.weight ?? 0.5);
        const estTime = Number(meta.duration ?? meta.planned_completion_time ?? 10);

        // theta-normalized score (weaker -> higher)
        const thetaMax = Math.max(...entries.map((e) => e.theta));
        const thetaMin = Math.min(...entries.map((e) => e.theta));
        const thetaRange = thetaMax - thetaMin || 1;
        const thetaScore = (thetaMax - (wp.theta ?? 0)) / thetaRange; // 0..1

        // weight normalized roughly 0..1 (assuming 0..1 stored)
        const weightScore = Math.min(1, Math.max(0, weight));
        const timePenalty = Math.min(1, estTime / 60);

        const finalScore = 0.6 * thetaScore + 0.3 * weightScore + 0.1 * (1 - timePenalty);

        // Build a cleaner title/description and action hint
        const cleanTitle = meta.title || (r.description ? String(r.description).split("\n")[0].slice(0, 80) : "Practice item");
        const cleanDesc = String(r.description || "").replace(/\s+/g, " ").trim().slice(0, 400);

        candidates.push({
          id: r._id || meta.original_id || meta.item_id || String(Math.random()),
          title: cleanTitle,
          type: itemType || "practice",
          part: Number(meta.part_type ?? part),
          description: cleanDesc,
          estimated_time: estTime,
          source: "chroma",
          score: finalScore,
          reason: `Weak in Part ${part} (theta=${(wp.theta ?? 0).toFixed(2)})`,
          action: {
            kind: "start_practice",
            route: `/practice-skill/${itemType}`,
            payload: { itemId: meta.original_id || meta.item_id || r._id },
          },
        });
      }
    } catch (err) {
      console.warn("recommendSkillPracticeService: chroma query failed", err);
    }
  }

  // de-duplicate by id
  const seen = new Map<string, Recommendation>();
  for (const c of candidates) {
    if (!seen.has(c.id) || (seen.get(c.id)!.score < c.score)) seen.set(c.id, c);
  }

  const deduped = Array.from(seen.values());
  deduped.sort((a, b) => b.score - a.score);

  // Build final friendly suggestions: try to present 3 types: drill (short), focused, mixed
  const suggestions: Recommendation[] = [];

  // 1) Drill — shortest high-score item
  const drill = deduped.find((d) => d.estimated_time && d.estimated_time <= 15) || deduped[0];
  if (drill) {
    suggestions.push({
      ...drill,
      reason: drill.reason + ". Gợi ý: làm 1 bài ngắn (drill) trong 10-15 phút mỗi ngày để tăng phản xạ.",
    });
  }

  // 2) Focused — item that best matches weakest part
  const focused = deduped.find((d) => d.part === weakParts[0].part) || deduped[1] || deduped[0];
  if (focused && (!drill || focused.id !== drill.id)) {
    suggestions.push({
      ...focused,
      reason: focused.reason + ". Gợi ý: tập trung 2-3 lần tuần này, làm kèm giải thích và review lỗi.",
    });
  }

  // 3) Mixed — slightly longer session mixing 2 items
  const mixedCandidates = deduped.filter((d) => d.id !== drill?.id && d.id !== focused?.id);
  if (mixedCandidates.length > 0) {
    const m = mixedCandidates[0];
    suggestions.push({
      ...m,
      reason: m.reason + ". Gợi ý: session mix 25-30 phút (quiz + shadowing) để luyện kỹ năng toàn diện.",
    });
  }

  return suggestions.slice(0, topK);
}
