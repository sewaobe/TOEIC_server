import mongoose, { Types } from "mongoose";

import { LearningPath } from "../models/learning_path.model";
import { LearningPathStrategyOption } from "../models/learning_path_strategy_option.model";
import { SchedulerDecisionLog } from "../models/scheduler_decision_log.model";
import { UserProgress } from "../models/user_progress.model";
import { UserSkill } from "../models/user_skill.model";
import { UserSkillHistory } from "../models/user_skill_history.model";
import { UserTest } from "../models/user_test.model";
import { Test } from "../models/test.model";
import { TestStatus } from "../models/enums/TestStatus";
import { GroupUser } from "../models/group_user.model";
import { WeekStudy } from "../models/week_study.model";
import { DayStudy } from "../models/day_study.model";

/**
 * =========================
 * CONFIG
 * =========================
 */

// Dán userId cần cleanup vào đây.
const USER_ID = "69cbf1331525116705402331";

// false = chỉ preview số lượng dữ liệu sẽ xóa.
// true = xóa thật.
const COMMIT = true;

// Nếu muốn chỉ xóa một vài LearningPath cụ thể thì điền vào đây.
// Để [] nghĩa là xóa toàn bộ LearningPath của USER_ID, trừ các id trong KEEP_LEARNING_PATH_IDS.
const ONLY_LEARNING_PATH_IDS: string[] = [
    // "learningPathId1",
    // "learningPathId2",
];

// Nếu muốn giữ lại một vài LearningPath tốt thì điền vào đây.
const KEEP_LEARNING_PATH_IDS: string[] = [
    // "goodLearningPathId1",
    // "goodLearningPathId2",
];

/**
 * Nếu true:
 * - Xóa GroupUser có learningPath_id thuộc các LearningPath bị cleanup.
 * - Với GroupUser khác có user trong students[], chỉ pull user ra khỏi students.
 */
const CLEAN_GROUP_USER = true;

/**
 * Nếu true:
 * - Xóa GroupUser rỗng students sau khi pull user.
 */
const DELETE_EMPTY_GROUPS = true;

const MONGO_URI = "mongodb://127.0.0.1:27017/toeic-db-v2"

/**
 * =========================
 * HELPERS
 * =========================
 */

type CleanupResult = {
    deletedCount?: number;
    modifiedCount?: number;
};

const toObjectId = (value: unknown): Types.ObjectId | null => {
    if (!value) return null;

    const raw = String(value);

    if (!Types.ObjectId.isValid(raw)) {
        return null;
    }

    return new Types.ObjectId(raw);
};

const uniqObjectIds = (values: unknown[]): Types.ObjectId[] => {
    const map = new Map<string, Types.ObjectId>();

    for (const value of values) {
        const objectId = toObjectId(value);
        if (!objectId) continue;

        map.set(String(objectId), objectId);
    }

    return [...map.values()];
};

const parseObjectIds = (values: string[]): Types.ObjectId[] => {
    return values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
            if (!Types.ObjectId.isValid(value)) {
                throw new Error(`ObjectId không hợp lệ: ${value}`);
            }

            return new Types.ObjectId(value);
        });
};

const assertConfig = () => {
    if (!USER_ID) {
        throw new Error("Bạn chưa cấu hình USER_ID ở đầu file.");
    }

    if (!Types.ObjectId.isValid(USER_ID)) {
        throw new Error(`USER_ID không hợp lệ: ${USER_ID}`);
    }
};

const getAffectedCount = (result: CleanupResult): number => {
    return result.deletedCount ?? result.modifiedCount ?? 0;
};

/**
 * =========================
 * MAIN
 * =========================
 */

async function main() {
    assertConfig();

    const userObjectId = new Types.ObjectId(USER_ID);
    const onlyLearningPathIds = parseObjectIds(ONLY_LEARNING_PATH_IDS);
    const keepLearningPathIds = parseObjectIds(KEEP_LEARNING_PATH_IDS);

    await mongoose.connect(MONGO_URI);

    const learningPathQuery: Record<string, unknown> = {
        user_id: userObjectId,
    };

    if (onlyLearningPathIds.length > 0) {
        learningPathQuery._id = { $in: onlyLearningPathIds };
    }

    if (keepLearningPathIds.length > 0) {
        const currentIdQuery =
            typeof learningPathQuery._id === "object" && learningPathQuery._id !== null
                ? (learningPathQuery._id as Record<string, unknown>)
                : {};

        learningPathQuery._id = {
            ...currentIdQuery,
            $nin: keepLearningPathIds,
        };
    }

    const learningPaths = await LearningPath.find(learningPathQuery)
        .select(
            "_id week_study_ids additional_week_studies feedbacks last_full_test_user_test_id"
        )
        .lean();

    const learningPathIds = uniqObjectIds(learningPaths.map((lp) => lp._id));

    if (learningPathIds.length === 0) {
        console.log("Không tìm thấy LearningPath nào để cleanup.");
        await mongoose.disconnect();
        return;
    }

    const strategyOptions = await LearningPathStrategyOption.find({
        user_id: userObjectId,
        learning_path_id: { $in: learningPathIds },
    })
        .select("_id source_user_test_id source_week_study_id")
        .lean();

    const schedulerLogs = await SchedulerDecisionLog.find({
        user_id: userObjectId,
        learning_path_id: { $in: learningPathIds },
    })
        .select("_id source_week_id generated_week_id")
        .lean();

    const userSkillHistories = await UserSkillHistory.find({
        user_id: userObjectId,
        context_type: "learning_path",
        learning_path_id: { $in: learningPathIds },
    })
        .select("_id source_user_test_id")
        .lean();

    const userSkills = await UserSkill.find({
        user_id: userObjectId,
        context_type: "learning_path",
        learning_path_id: { $in: learningPathIds },
    })
        .select("_id latest_source_user_test_id")
        .lean();

    const weekIdsFromLearningPaths = learningPaths.flatMap((lp: any) => [
        ...(lp.week_study_ids ?? []),
        ...(lp.additional_week_studies ?? []),
    ]);

    const weekIdsFromStrategyOptions = strategyOptions.flatMap((option: any) => [
        option.source_week_study_id,
    ]);

    const weekIdsFromSchedulerLogs = schedulerLogs.flatMap((log: any) => [
        log.source_week_id,
        log.generated_week_id,
    ]);

    let weekStudyIds = uniqObjectIds([
        ...weekIdsFromLearningPaths,
        ...weekIdsFromStrategyOptions,
        ...weekIdsFromSchedulerLogs,
    ]);

    const weekStudies =
        weekStudyIds.length > 0
            ? await WeekStudy.find({ _id: { $in: weekStudyIds } })
                .select("_id days")
                .lean()
            : [];

    weekStudyIds = uniqObjectIds([
        ...weekStudyIds,
        ...weekStudies.map((week) => week._id),
    ]);

    const dayIdsFromLearningPathFeedbacks = learningPaths.flatMap((lp: any) =>
        (lp.feedbacks ?? []).map((feedback: any) => feedback.day_study_id)
    );

    const dayIdsFromWeekStudies = weekStudies.flatMap((week: any) => week.days ?? []);

    let dayStudyIds = uniqObjectIds([
        ...dayIdsFromLearningPathFeedbacks,
        ...dayIdsFromWeekStudies,
    ]);

    const dayStudyOrConditions: Record<string, unknown>[] = [];

    if (dayStudyIds.length > 0) {
        dayStudyOrConditions.push({ _id: { $in: dayStudyIds } });
    }

    if (weekStudyIds.length > 0) {
        dayStudyOrConditions.push({ week_id: { $in: weekStudyIds } });
    }

    const dayStudies =
        dayStudyOrConditions.length > 0
            ? await DayStudy.find({ $or: dayStudyOrConditions })
                .select("_id")
                .lean()
            : [];

    dayStudyIds = uniqObjectIds([
        ...dayStudyIds,
        ...dayStudies.map((day) => day._id),
    ]);

    const userTestIds = uniqObjectIds([
        ...learningPaths.map((lp: any) => lp.last_full_test_user_test_id),
        ...strategyOptions.map((option: any) => option.source_user_test_id),
        ...userSkillHistories.map((history: any) => history.source_user_test_id),
        ...userSkills.map((skill: any) => skill.latest_source_user_test_id),
    ]);

    const groupUsersByLearningPath =
        CLEAN_GROUP_USER && learningPathIds.length > 0
            ? await GroupUser.find({
                learningPath_id: { $in: learningPathIds },
            })
                .select("_id")
                .lean()
            : [];

    const groupUserIds = uniqObjectIds(groupUsersByLearningPath.map((g) => g._id));

    const deletePlan: {
        name: string;
        count: number;
        run: () => Promise<CleanupResult>;
    }[] = [
            {
                name: "DayStudy",
                count:
                    dayStudyIds.length > 0
                        ? await DayStudy.countDocuments({ _id: { $in: dayStudyIds } })
                        : 0,
                run: () =>
                    dayStudyIds.length > 0
                        ? DayStudy.deleteMany({ _id: { $in: dayStudyIds } })
                        : Promise.resolve({ deletedCount: 0 }),
            },
            {
                name: "WeekStudy",
                count:
                    weekStudyIds.length > 0
                        ? await WeekStudy.countDocuments({ _id: { $in: weekStudyIds } })
                        : 0,
                run: () =>
                    weekStudyIds.length > 0
                        ? WeekStudy.deleteMany({ _id: { $in: weekStudyIds } })
                        : Promise.resolve({ deletedCount: 0 }),
            },
            {
                name: "SchedulerDecisionLog",
                count: await SchedulerDecisionLog.countDocuments({
                    user_id: userObjectId,
                    learning_path_id: { $in: learningPathIds },
                }),
                run: () =>
                    SchedulerDecisionLog.deleteMany({
                        user_id: userObjectId,
                        learning_path_id: { $in: learningPathIds },
                    }),
            },
            {
                name: "LearningPathStrategyOption",
                count: await LearningPathStrategyOption.countDocuments({
                    user_id: userObjectId,
                    learning_path_id: { $in: learningPathIds },
                }),
                run: () =>
                    LearningPathStrategyOption.deleteMany({
                        user_id: userObjectId,
                        learning_path_id: { $in: learningPathIds },
                    }),
            },
            {
                name: "UserSkill",
                count: await UserSkill.countDocuments({
                    user_id: userObjectId,
                    context_type: "learning_path",
                    learning_path_id: { $in: learningPathIds },
                }),
                run: () =>
                    UserSkill.deleteMany({
                        user_id: userObjectId,
                        context_type: "learning_path",
                        learning_path_id: { $in: learningPathIds },
                    }),
            },
            {
                name: "UserSkillHistory",
                count: await UserSkillHistory.countDocuments({
                    user_id: userObjectId,
                    context_type: "learning_path",
                    learning_path_id: { $in: learningPathIds },
                }),
                run: () =>
                    UserSkillHistory.deleteMany({
                        user_id: userObjectId,
                        context_type: "learning_path",
                        learning_path_id: { $in: learningPathIds },
                    }),
            },
            {
                name: "UserProgress",
                count: await UserProgress.countDocuments({
                    user_id: userObjectId,
                    learningPath_id: { $in: learningPathIds },
                }),
                run: () =>
                    UserProgress.deleteMany({
                        user_id: userObjectId,
                        learningPath_id: { $in: learningPathIds },
                    }),
            },
            {
                name: "GroupUser - delete groups linked to LearningPath",
                count:
                    CLEAN_GROUP_USER && groupUserIds.length > 0
                        ? await GroupUser.countDocuments({ _id: { $in: groupUserIds } })
                        : 0,
                run: () =>
                    CLEAN_GROUP_USER && groupUserIds.length > 0
                        ? GroupUser.deleteMany({ _id: { $in: groupUserIds } })
                        : Promise.resolve({ deletedCount: 0 }),
            },
            {
                name: "GroupUser - pull user from remaining groups",
                count: CLEAN_GROUP_USER
                    ? await GroupUser.countDocuments({
                        students: userObjectId,
                        $or: [
                            { learningPath_id: { $exists: false } },
                            { learningPath_id: null },
                            { learningPath_id: { $nin: learningPathIds } },
                        ],
                    })
                    : 0,
                run: () =>
                    CLEAN_GROUP_USER
                        ? GroupUser.updateMany(
                            {
                                students: userObjectId,
                                $or: [
                                    { learningPath_id: { $exists: false } },
                                    { learningPath_id: null },
                                    { learningPath_id: { $nin: learningPathIds } },
                                ],
                            },
                            {
                                $pull: { students: userObjectId },
                            }
                        )
                        : Promise.resolve({ modifiedCount: 0 }),
            },
            {
                name: "GroupUser - delete empty groups",
                count:
                    CLEAN_GROUP_USER && DELETE_EMPTY_GROUPS
                        ? await GroupUser.countDocuments({
                            students: { $size: 0 },
                        })
                        : 0,
                run: () =>
                    CLEAN_GROUP_USER && DELETE_EMPTY_GROUPS
                        ? GroupUser.deleteMany({
                            students: { $size: 0 },
                        })
                        : Promise.resolve({ deletedCount: 0 }),
            },
            {
                name: "UserTest",
                count:
                    userTestIds.length > 0
                        ? await UserTest.countDocuments({
                            _id: { $in: userTestIds },
                            user_id: USER_ID,
                        })
                        : 0,
                run: () =>
                    userTestIds.length > 0
                        ? UserTest.deleteMany({
                            _id: { $in: userTestIds },
                            user_id: USER_ID,
                        })
                        : Promise.resolve({ deletedCount: 0 }),
            },
            {
                name: "Test - approved tests created by user",
                count: await Test.countDocuments({
                    created_by: userObjectId,
                    status: TestStatus.APPROVED,
                }),
                run: () =>
                    Test.deleteMany({
                        created_by: userObjectId,
                        status: TestStatus.APPROVED,
                    }),
            },
            {
                name: "LearningPath",
                count: await LearningPath.countDocuments({
                    _id: { $in: learningPathIds },
                    user_id: userObjectId,
                }),
                run: () =>
                    LearningPath.deleteMany({
                        _id: { $in: learningPathIds },
                        user_id: userObjectId,
                    }),
            },
        ];

    console.log("\n=== Learning Path Cleanup Plan ===");
    console.log("USER_ID:", USER_ID);
    console.log("COMMIT:", COMMIT);
    console.log("CLEAN_GROUP_USER:", CLEAN_GROUP_USER);
    console.log(
        "learningPathIds:",
        learningPathIds.map((id) => String(id))
    );
    console.log(
        "weekStudyIds:",
        weekStudyIds.map((id) => String(id))
    );
    console.log(
        "dayStudyIds:",
        dayStudyIds.map((id) => String(id))
    );
    console.log(
        "userTestIds:",
        userTestIds.map((id) => String(id))
    );
    console.log(
        "groupUserIds linked to learning paths:",
        groupUserIds.map((id) => String(id))
    );

    console.table(
        deletePlan.map((item) => ({
            collection: item.name,
            count: item.count,
        }))
    );

    if (!COMMIT) {
        console.log("\nDRY RUN: chưa xóa gì cả.");
        console.log("Muốn xóa thật, đổi COMMIT = true ở đầu file.");
        await mongoose.disconnect();
        return;
    }

    console.log("\nĐang xóa dữ liệu...");

    for (const item of deletePlan) {
        const result = await item.run();
        console.log(`${item.name}: affected ${getAffectedCount(result)}`);
    }

    console.log("\nXóa xong.");
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error("Cleanup failed:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
