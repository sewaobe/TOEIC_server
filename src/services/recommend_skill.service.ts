import { User } from "../models/user.model";
import { UserProgress } from "../models/user_progress.model";
import { getCandidateLearningItems } from "./irt.service";

type Recommendation = {
  id: string;
  title: string;
  type: string;
  part: number | null;
  description?: string;
  estimated_time?: number;
  level?: string;
  source: string;
  score: number;
  reason: string;
  abilityPercent?: number;
  levelInfo?: string;
  action?: {
    kind: "start_practice" | "open_lesson" | "add_to_plan";
    route?: string; // frontend route hint
    payload?: any;
  };
};

/**
 * Recommend skill practice items based on user's IRT theta.
 * Uses getCandidateLearningItems to get items matching user's ability level.
 */
export async function recommendSkillPracticeService(userId: string, opts?: { topK?: number; perPart?: number }) {
  const topK = opts?.topK ?? 10;
  const perPart = opts?.perPart ?? 5;

  const user = await User.findById(userId).lean();
  if (!user) return [] as Recommendation[];

  // try to get user's progress (contains target_score/current_score)
  const progress = await UserProgress.findOne({ user_id: userId }).lean().exec();

  const thetaPartsRaw: Record<string, any> = user.latest_theta_parts || {};
  const entries = Object.entries(thetaPartsRaw).map(([k, v]) => ({ part: Number(k), theta: Number(v) }));
  if (entries.length === 0) return [] as Recommendation[];

  // Convert to Record<number, number> for getCandidateLearningItems
  const thetaByPart: Record<number, number> = {};
  for (const e of entries) {
    thetaByPart[e.part] = e.theta;
  }

  // sort ascending -> weakest first
  entries.sort((a, b) => a.theta - b.theta);
  const weakParts = entries.slice(0, Math.min(3, entries.length));

  const candidates: Recommendation[] = [];

  // Get candidate items using IRT-based filtering (theta -> CEFR + weight range)
  try {
    const candidateItems = await getCandidateLearningItems(thetaByPart);

    // Process each weak part's candidates
    for (const wp of weakParts) {
      const part = Number(wp.part);
      const partItems = candidateItems[part];
      
      if (!partItems) continue;

      // theta-normalized score (weaker -> higher priority)
      const thetaMax = Math.max(...entries.map((e) => e.theta));
      const thetaMin = Math.min(...entries.map((e) => e.theta));
      const thetaRange = thetaMax - thetaMin || 1;
      const thetaScore = (thetaMax - (wp.theta ?? 0)) / thetaRange; // 0..1

      // Process lessons
      for (const lesson of partItems.lessons.slice(0, perPart)) {
        const estTime = lesson.planned_completion_time || 20;
        const weight = lesson.weight || 0.5;
        const weightScore = Math.min(1, Math.max(0, weight));
        const timePenalty = Math.min(1, estTime / 60);
        const finalScore = 0.6 * thetaScore + 0.3 * weightScore + 0.1 * (1 - timePenalty);

        candidates.push({
          id: lesson._id.toString(),
          title: lesson.title || "Bài học",
          type: "lesson",
          part: part,
          description: lesson.summary || "",
          estimated_time: estTime,
          level: lesson.level,
          source: "irt_candidate",
          score: finalScore,
          reason: `Yếu Part ${part} (theta=${(wp.theta ?? 0).toFixed(2)})`,
          action: {
            kind: "open_lesson",
            route: `/lessons/${lesson._id}`,
            payload: { itemId: lesson._id.toString() },
          },
        });
      }

      // Process dictations
      for (const dictation of partItems.dictations.slice(0, perPart)) {
        const estTime = dictation.duration || 10;
        const weight = dictation.weight || 0.5;
        const weightScore = Math.min(1, Math.max(0, weight));
        const timePenalty = Math.min(1, estTime / 60);
        const finalScore = 0.6 * thetaScore + 0.3 * weightScore + 0.1 * (1 - timePenalty);

        candidates.push({
          id: dictation._id.toString(),
          title: dictation.title || "Dictation",
          type: "dictation",
          part: part,
          description: dictation.transcript ? dictation.transcript.slice(0, 100) + "..." : "",
          estimated_time: estTime,
          level: dictation.level,
          source: "irt_candidate",
          score: finalScore,
          reason: `Yếu Part ${part} (theta=${(wp.theta ?? 0).toFixed(2)})`,
          action: {
            kind: "start_practice",
            route: `/practice-skill/dictation/${dictation._id}`,
            payload: { itemId: dictation._id.toString() },
          },
        });
      }

      // Process shadowings
      for (const shadowing of partItems.shadowings.slice(0, perPart)) {
        const estTime = shadowing.duration || 15;
        const weight = shadowing.weight || 0.5;
        const weightScore = Math.min(1, Math.max(0, weight));
        const timePenalty = Math.min(1, estTime / 60);
        const finalScore = 0.6 * thetaScore + 0.3 * weightScore + 0.1 * (1 - timePenalty);

        candidates.push({
          id: shadowing._id.toString(),
          title: shadowing.title || "Shadowing",
          type: "shadowing",
          part: part,
          description: shadowing.transcript ? shadowing.transcript.slice(0, 100) + "..." : "",
          estimated_time: estTime,
          level: shadowing.level,
          source: "irt_candidate",
          score: finalScore,
          reason: `Yếu Part ${part} (theta=${(wp.theta ?? 0).toFixed(2)})`,
          action: {
            kind: "start_practice",
            route: `/practice-skill/shadowing/${shadowing._id}`,
            payload: { itemId: shadowing._id.toString() },
          },
        });
      }

      // Process quizzes
      for (const quiz of partItems.quizzes.slice(0, perPart)) {
        const estTime = quiz.planned_completion_time || 10;
        const weight = quiz.weight || 0.5;
        const weightScore = Math.min(1, Math.max(0, weight));
        const timePenalty = Math.min(1, estTime / 60);
        const finalScore = 0.6 * thetaScore + 0.3 * weightScore + 0.1 * (1 - timePenalty);

        candidates.push({
          id: quiz._id.toString(),
          title: quiz.title || "Quiz",
          type: "quiz",
          part: part,
          description: `${quiz.question_ids?.length || 0} câu hỏi`,
          estimated_time: estTime,
          level: quiz.level,
          source: "irt_candidate",
          score: finalScore,
          reason: `Yếu Part ${part} (theta=${(wp.theta ?? 0).toFixed(2)})`,
          action: {
            kind: "start_practice",
            route: `/practice-skill/quiz/${quiz._id}`,
            payload: { itemId: quiz._id.toString() },
          },
        });
      }

      // Process vocab
      for (const vocab of partItems.vocab.slice(0, perPart)) {
        candidates.push({
          id: vocab._id.toString(),
          title: vocab.title || "Từ vựng",
          type: "vocab",
          part: part,
          description: vocab.description || "",
          estimated_time: 30,
          level: vocab.level,
          source: "irt_candidate",
          score: 0.5 * thetaScore + 0.3, // vocab always useful
          reason: `Yếu Part ${part} (theta=${(wp.theta ?? 0).toFixed(2)})`,
          action: {
            kind: "start_practice",
            route: `/flash-cards/${vocab._id}/practice`,
            payload: { itemId: vocab._id.toString() },
          },
        });
      }
    }
  } catch (err) {
    console.warn("recommendSkillPracticeService: getCandidateLearningItems failed", err);
    return [] as Recommendation[];
  }

  // de-duplicate by id
  const seen = new Map<string, Recommendation>();
  for (const c of candidates) {
    if (!seen.has(c.id) || (seen.get(c.id)!.score < c.score)) seen.set(c.id, c);
  }

  const deduped = Array.from(seen.values());
  deduped.sort((a, b) => b.score - a.score);

  // Helper: convert theta (-5 to 5) to percentage (0-100%)
  function thetaToPercent(theta: number): number {
    // theta ranges from -5 to 5, map to 0-100%
    const percent = ((theta + 5) / 10) * 100;
    return Math.round(Math.max(0, Math.min(100, percent)));
  }

  // Build final suggestions with enhanced reasons based on item type
  const suggestions: Recommendation[] = deduped.slice(0, topK).map((item, idx) => {
    // Extract theta from reason and convert to percentage
    const thetaMatch = item.reason.match(/theta=([\-\d.]+)/);
    const thetaValue = thetaMatch ? parseFloat(thetaMatch[1]) : 0;
    const abilityPercent = thetaToPercent(thetaValue);
    
    const levelInfo = item.level ? `${item.level}` : "";
    
    // Build cleaner reason
    let tip = "";
    switch (item.type) {
      case "lesson":
        tip = "Nắm vững kiến thức nền tảng";
        break;
      case "quiz":
        tip = "Kiểm tra và củng cố kiến thức";
        break;
      case "dictation":
        tip = "Cải thiện kỹ năng nghe và viết";
        break;
      case "shadowing":
        tip = "Cải thiện phát âm và phản xạ nghe-nói";
        break;
      case "vocab":
        tip = "Mở rộng vốn từ vựng";
        break;
      default:
        tip = "Nâng cao kỹ năng";
    }
    
    return {
      ...item,
      reason: tip,
      abilityPercent,
      levelInfo,
    };
  });

  return suggestions;
}

/**
 * Get lessons for a specific part (without IRT-based filtering).
 * Used when user explicitly requests lessons for a specific part.
 */
export async function getPartLessonsService(
  userId: string, 
  part: number, 
  count: number = 5,
  itemType?: string
) {
  const user = await User.findById(userId).lean();
  if (!user) return [] as Recommendation[];

  const thetaPartsRaw: Record<string, any> = user.latest_theta_parts || {};
  const theta = Number(thetaPartsRaw[part] ?? 0);

  // Helper: convert theta to percentage
  function thetaToPercent(t: number): number {
    const percent = ((t + 5) / 10) * 100;
    return Math.round(Math.max(0, Math.min(100, percent)));
  }

  const abilityPercent = thetaToPercent(theta);

  // Build thetaByPart for getCandidateLearningItems
  const thetaByPart: Record<number, number> = {};
  for (const [k, v] of Object.entries(thetaPartsRaw)) {
    thetaByPart[Number(k)] = Number(v);
  }
  // Ensure requested part has a theta value
  if (!thetaByPart[part]) {
    thetaByPart[part] = 0;
  }

  const candidates: Recommendation[] = [];

  try {
    const candidateItems = await getCandidateLearningItems(thetaByPart);
    const partItems = candidateItems[part];

    if (!partItems) return [] as Recommendation[];

    // Helper to create recommendation
    const createRec = (item: any, type: string, estTime: number, route: string, desc?: string): Recommendation => ({
      id: item._id.toString(),
      title: item.title || type,
      type,
      part,
      description: desc || "",
      estimated_time: estTime,
      level: item.level,
      source: "part_request",
      score: 1,
      reason: getReasonByType(type),
      abilityPercent,
      levelInfo: item.level || "",
      action: {
        kind: type === "lesson" ? "open_lesson" : "start_practice",
        route,
        payload: { itemId: item._id.toString() },
      },
    });

    const getReasonByType = (type: string): string => {
      switch (type) {
        case "lesson": return "Nắm vững kiến thức nền tảng";
        case "quiz": return "Kiểm tra và củng cố kiến thức";
        case "dictation": return "Cải thiện kỹ năng nghe và viết";
        case "shadowing": return "Cải thiện phát âm và phản xạ nghe-nói";
        case "vocab": return "Mở rộng vốn từ vựng";
        default: return "Nâng cao kỹ năng";
      }
    };

    // If specific type requested, only get that type
    if (itemType) {
      switch (itemType) {
        case "lesson":
          for (const lesson of partItems.lessons.slice(0, count)) {
            candidates.push(createRec(lesson, "lesson", lesson.planned_completion_time || 20, `/lessons/${lesson._id}`, lesson.summary));
          }
          break;
        case "dictation":
          for (const d of partItems.dictations.slice(0, count)) {
            candidates.push(createRec(d, "dictation", d.duration || 10, `/practice-skill/dictation/${d._id}`, d.transcript?.slice(0, 100)));
          }
          break;
        case "shadowing":
          for (const s of partItems.shadowings.slice(0, count)) {
            candidates.push(createRec(s, "shadowing", s.duration || 15, `/practice-skill/shadowing/${s._id}`, s.transcript?.slice(0, 100)));
          }
          break;
        case "quiz":
          for (const q of partItems.quizzes.slice(0, count)) {
            candidates.push(createRec(q, "quiz", q.planned_completion_time || 10, `/practice-skill/quiz/${q._id}`, `${q.question_ids?.length || 0} câu hỏi`));
          }
          break;
        case "vocab":
          for (const v of partItems.vocab.slice(0, count)) {
            candidates.push(createRec(v, "vocab", 30, `/flash-cards/${v._id}/practice`, v.description));
          }
          break;
      }
    } else {
      // Get mixed types
      const perType = Math.ceil(count / 5);
      
      for (const lesson of partItems.lessons.slice(0, perType)) {
        candidates.push(createRec(lesson, "lesson", lesson.planned_completion_time || 20, `/lessons/${lesson._id}`, lesson.summary));
      }
      for (const d of partItems.dictations.slice(0, perType)) {
        candidates.push(createRec(d, "dictation", d.duration || 10, `/practice-skill/dictation/${d._id}`, d.transcript?.slice(0, 100)));
      }
      for (const s of partItems.shadowings.slice(0, perType)) {
        candidates.push(createRec(s, "shadowing", s.duration || 15, `/practice-skill/shadowing/${s._id}`, s.transcript?.slice(0, 100)));
      }
      for (const q of partItems.quizzes.slice(0, perType)) {
        candidates.push(createRec(q, "quiz", q.planned_completion_time || 10, `/practice-skill/quiz/${q._id}`, `${q.question_ids?.length || 0} câu hỏi`));
      }
      for (const v of partItems.vocab.slice(0, perType)) {
        candidates.push(createRec(v, "vocab", 30, `/flash-cards/${v._id}/practice`, v.description));
      }
    }
  } catch (err) {
    console.warn("getPartLessonsService: getCandidateLearningItems failed", err);
    return [] as Recommendation[];
  }

  return candidates.slice(0, count);
}
