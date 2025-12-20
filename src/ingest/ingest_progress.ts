import { getUserProgressCollection } from "../core/collections/progress";
import { UserProgress } from "../models/user_progress.model";
import { User } from "../models/user.model";

function topWeakPartsFromTheta(thetaParts: Record<string, number> | undefined) {
  if (!thetaParts) return [];
  const entries = Object.entries(thetaParts).map(([k, v]) => ({ part: k, theta: Number(v) }));
  entries.sort((a, b) => (Number(a.theta) || 0) - (Number(b.theta) || 0)); // ascending -> weakest first
  return entries.slice(0, 2).map((e) => `Part ${e.part}`);
}

function formatProgressToChromaDoc(user: any, progress: any) {
  const parts: string[] = [];

  parts.push(`USER: ${user.profile?.fullname || user.username || "Unknown"}`);
  parts.push(`USER_ID: ${user._id}`);

  if (progress) {
    parts.push(`COMPLETED_LESSONS: ${progress.completed_lessons}/${progress.total_lessons}`);
    parts.push(`COMPLETION_RATE: ${progress.completion_rate}`);
    parts.push(`CURRENT_SCORE: ${progress.current_score}`);
    parts.push(`TARGET_SCORE: ${progress.target_score}`);
    parts.push(`STREAK_DAYS: ${progress.streak_days}`);
    const weakParts = topWeakPartsFromTheta(user.latest_theta_parts as any);
    if (weakParts.length) parts.push(`WEAK_PARTS: ${weakParts.join(", ")}`);
    // include IRT theta overall and parts summary for richer context
    parts.push(`THETA_OVERALL: ${typeof user.latest_theta_overall === 'number' ? user.latest_theta_overall : 'N/A'}`);
    if (user.latest_theta_parts) {
      const partEntries = Object.entries(user.latest_theta_parts as Record<string, any>)
        .map(([k, v]) => {
          const num = Number(v);
          return `${k}:${Number.isFinite(num) ? num.toFixed(2) : String(v ?? "N/A")}`;
        })
        .join(", ");
      parts.push(`THETA_PARTS: ${partEntries}`);
    }
    if (progress.last_study_date) parts.push(`LAST_STUDY: ${progress.last_study_date.toISOString()}`);
  } else {
    parts.push("NO_PROGRESS_RECORD");
  }

  const document = parts.join("\n").substring(0, 4000);

  return {
    id: `user_progress_${user._id}`,
    document,
    metadata: {
      source: "user_progress",
      user_id: user._id.toString(),
      learningPath_id: progress?.learningPath_id ? progress.learningPath_id.toString() : null,
      completion_rate: progress?.completion_rate || 0,
      current_score: progress?.current_score || 0,
      updated_at: progress?.updated_at ? progress.updated_at.toISOString() : new Date().toISOString(),
      latest_theta_overall: typeof user.latest_theta_overall === 'number' ? user.latest_theta_overall : null,
      latest_theta_parts_json: user.latest_theta_parts ? JSON.stringify(user.latest_theta_parts) : null,
    },
  };
}

export async function ingestUserProgress(userIds?: string[]) {
  const collection = await getUserProgressCollection();

  const progresses = userIds && userIds.length
    ? await UserProgress.find({ user_id: { $in: userIds } }).lean().exec()
    : await UserProgress.find({}).lean().exec();

  // Map by user_id for quick lookup
  const mapByUser = new Map<string, any>();
  for (const p of progresses) mapByUser.set(p.user_id.toString(), p);

  const users = userIds && userIds.length
    ? await User.find({ _id: { $in: userIds } }).lean().exec()
    : await User.find({}).lean().exec();

  const docs: { id: string; document: string; metadata: any }[] = [];

  for (const u of users) {
    const prog = mapByUser.get(u._id.toString()) || null;
    const doc = formatProgressToChromaDoc(u, prog);
    docs.push(doc);
  }

  if (docs.length === 0) {
    console.log("⚠ No progress docs to ingest.");
    return;
  }

  console.log(`📥 Upserting ${docs.length} user progress docs to Chroma`);

  const batchSize = 50;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    await collection.upsert({
      ids: batch.map((d) => d.id),
      documents: batch.map((d) => d.document),
      metadatas: batch.map((d) => d.metadata),
    });
    console.log(`  - upserted batch ${i / batchSize + 1} (${batch.length})`);
  }

  console.log("✔ User progress ingested.");
}
