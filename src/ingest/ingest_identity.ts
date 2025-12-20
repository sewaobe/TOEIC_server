import { getUserProfileCollection } from "../core/collections/identity";
import { User } from "../models/user.model";
import { UserProgress } from "../models/user_progress.model";

function formatUserToChromaDoc(user: any, progress: any) {
  const summaryParts: string[] = [];

  summaryParts.push(`USER: ${user.profile?.fullname || user.username || "Unknown"}`);
  summaryParts.push(`EMAIL: ${user.email || "n/a"}`);

  if (progress) {
    summaryParts.push(
      `PROGRESS: completed ${progress.completed_lessons}/${progress.total_lessons} lessons; completion_rate=${Math.round(
        (progress.completion_rate || 0) * 100
      ) / 100}`
    );
    summaryParts.push(`SCORE: ${progress.current_score || 0} (target: ${progress.target_score || 0})`);
    if (progress.notes && progress.notes.length) {
      summaryParts.push(`NOTES: ${progress.notes.slice(0, 3).join("; ")}`);
    }
    if (progress.last_study_date) {
      summaryParts.push(`LAST_STUDY: ${progress.last_study_date.toISOString()}`);
    }
  } else {
    summaryParts.push("PROGRESS: no progress record");
  }

  // Include IRT-based thetas from user profile if present
  if (user.latest_theta_overall !== undefined && user.latest_theta_overall !== null) {
    summaryParts.push(`THETA_OVERALL: ${user.latest_theta_overall}`);
  }
  if (user.latest_theta_parts) {
    const parts = Object.entries(user.latest_theta_parts)
      .map(([k, v]) => `${k}:${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(", ");
    summaryParts.push(`THETA_PARTS: ${parts}`);
    summaryParts.push(`WEAK_PARTS: ${Object.entries(user.latest_theta_parts)
      .sort((a: any, b: any) => a[1] - b[1])
      .slice(0, 2)
      .map((x: any) => `Part ${x[0]}`)
      .join(", ")}`);
  } else {
    summaryParts.push("WEAK_PARTS: see user_progress details");
  }

  const document = summaryParts.join("\n").substring(0, 4000);

  return {
    id: `user_profile_${user._id}`,
    document,
    metadata: {
      source: "user_profile",
      user_id: user._id.toString(),
      isActive: user.isActive || false,
      updated_at: (progress && progress.updated_at) ? progress.updated_at.toISOString() : (user.updated_at ? user.updated_at.toISOString() : new Date().toISOString()),
      latest_theta_overall: typeof user.latest_theta_overall === 'number' ? user.latest_theta_overall : null,
      latest_theta_parts_json: user.latest_theta_parts ? JSON.stringify(user.latest_theta_parts) : null,
    },
  };
}

export async function ingestUserProfiles(userIds?: string[]) {
  const collection = await getUserProfileCollection();

  const users = userIds && userIds.length
    ? await User.find({ _id: { $in: userIds } }).lean().exec()
    : await User.find({}).lean().exec();

  const docs: { id: string; document: string; metadata: any }[] = [];

  for (const u of users) {
    const progress = await UserProgress.findOne({ user_id: u._id }).lean().exec();
    const doc = formatUserToChromaDoc(u, progress);
    docs.push(doc);
  }

  if (docs.length === 0) {
    console.log("⚠ No user profiles to ingest.");
    return;
  }

  console.log(`📥 Upserting ${docs.length} user profiles to Chroma`);

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

  console.log("✔ User profiles ingested.");
}
