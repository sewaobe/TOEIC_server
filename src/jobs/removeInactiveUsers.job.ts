import cron from "node-cron";
import { UserProgress, GroupUser } from "../models";

async function removeInactiveUsersOnce() {
  try {
    const inactive = await UserProgress.find({ status: "inactive" }).lean();
    if (!inactive || inactive.length === 0) {
      console.log("removeInactiveUsers job: no inactive users found");
      return;
    }

    const userIds = inactive.map((p) => p.user_id);

    // Remove these users from any GroupUser.students arrays
    const res = await GroupUser.updateMany(
      { students: { $in: userIds } },
      { $pull: { students: { $in: userIds } } }
    );

    console.log(
      `removeInactiveUsers job: removed ${userIds.length} users from groups`,
      {
        matched: (res as any).matchedCount ?? (res as any).n ?? null,
        modified: (res as any).modifiedCount ?? (res as any).nModified ?? null,
      }
    );
  } catch (err) {
    console.error("removeInactiveUsers job error:", err);
  }
}

export function startRemoveInactiveUsersJob() {
  // Schedule to run every 10 seconds (for testing)
  // Cron expression with seconds field: second minute hour day-of-month month day-of-week
  cron.schedule(
    "*/10 * * * * *",
    () => {
      console.log("removeInactiveUsers job triggered");
      removeInactiveUsersOnce();
    },
    {
      // Use server timezone if provided, otherwise local
      timezone: process.env.TIMEZONE || undefined,
    }
  );

  console.log(
    `removeInactiveUsers job scheduled: cron="*/10 * * * * *", timezone=${
      process.env.TIMEZONE || "local"
    }`
  );

  // Also expose a manual trigger (useful for testing)
  return { runNow: removeInactiveUsersOnce };
}

export default startRemoveInactiveUsersJob;

// Allow running this file directly for manual tests (with ts-node)
if (require.main === module) {
  removeInactiveUsersOnce()
    .then(() => {
      console.log("removeInactiveUsers manual run completed");
      process.exit(0);
    })
    .catch((err) => {
      console.error("removeInactiveUsers manual run failed:", err);
      process.exit(1);
    });
}
