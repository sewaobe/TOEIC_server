import { Types } from "mongoose";
import {
    LearningPath,
    LearningPathStrategyOption,
    LessonManager,
    WeekStudy,
} from "../../models";
import type { IDayStudy } from "../../models/day_study.model";
import type { ILearningPath } from "../../models/learning_path.model";
import type {
    ILearningPathStrategyOption,
    LearningPathStrategyOptionTrigger,
} from "../../models/learning_path_strategy_option.model";
import type { ILessonManager } from "../../models/lesson_manager.model";
import type { IWeekStudy } from "../../models/week_study.model";
import { WeekStudyStatus } from "../../models/enums/WeekStudyStatus";
import type {
    LearningCyclePlanV2,
    LearningPathScenarioV2,
    PlannedRouteUnitV2,
    SkillRoiDecisionV3,
    SkillRoiUnitResultV3,
} from "../../types/learning_path_v2";
import { getToeicSkillLabelVi } from "../../utils/toeic_skill.util";
import {
    buildSkillRoiPlanningContext,
    selectBestSkillRoiOpportunity,
} from "./skill_roi_optimizer.service";
import {
    generateAssessmentTestFromPlan,
    type GenerateAssessmentTestResult,
    type LearningPathAssessmentPlanV3,
} from "./learning_path_assessment.service";
import { logLearningPathV2DebugSafe } from "./learning_path_v2_debug_logger";
import { createSchedulerDecisionLog } from "./scheduler_decision_log.service";
import {
    createDayStudiesForSkillFocusedCycle,
} from "../day_study.service";

const MINI_TEST_ESTIMATED_MINUTES = 60;
const FULL_TEST_ESTIMATED_MINUTES = 120;
const FULL_TEST_AFTER_MINI_TEST_COUNT = 3;

export type SkillFocusedCycleTriggerV3 = Extract<
    LearningPathStrategyOptionTrigger,
    "initial_generation" | "mini_test_completion" | "full_test_review"
>;

type SelectedSkillRoiDecisionV3 = Extract<
    SkillRoiDecisionV3,
    { status: "selected" }
>;

export type CreateSkillFocusedCycleInput = {
    user_id: string;
    learning_path_id: string;
    trigger_type: SkillFocusedCycleTriggerV3;
    scenario: LearningPathScenarioV2;
    source_user_test_id: string | Types.ObjectId;
    source_week_study_id?: string | Types.ObjectId | null;
    current_score?: number;
    now?: Date;
};

export type CreateSkillFocusedCycleResult = {
    status: "cycle_created";
    decision: SelectedSkillRoiDecisionV3;
    plan: LearningCyclePlanV2;
    strategy_option: ILearningPathStrategyOption | null;
    week_study: IWeekStudy;
    day_studies: IDayStudy[];
    assessment_result: GenerateAssessmentTestResult;
};

export class NoEligibleSkillPackageError extends Error {
    statusCode = 422;
    code = "NO_ELIGIBLE_SKILL_PACKAGE";
    decision: SkillRoiDecisionV3;

    constructor(decision: SkillRoiDecisionV3) {
        super(
            decision.status === "no_eligible_skill"
                ? decision.reason
                : "Không có package Skill ROI hợp lệ."
        );
        this.name = "NoEligibleSkillPackageError";
        this.decision = decision;
    }
}

const toObjectId = (
    value: string | Types.ObjectId,
    fieldName: string
): Types.ObjectId => {
    if (value instanceof Types.ObjectId) return value;
    if (!Types.ObjectId.isValid(value)) {
        throw new Error(`${fieldName} không phải ObjectId hợp lệ.`);
    }
    return new Types.ObjectId(value);
};

const calculateExpectedCompletionAt = (input: {
    now: Date;
    estimated_learning_minutes: number;
    assessment_estimated_minutes: number;
    time_per_day?: number;
}): Date => {
    const totalMinutes =
        input.estimated_learning_minutes +
        input.assessment_estimated_minutes;
    const estimatedDays =
        input.time_per_day && input.time_per_day > 0
            ? Math.max(1, Math.ceil(totalMinutes / input.time_per_day))
            : Math.max(1, Math.ceil(totalMinutes / 60));

    return new Date(
        input.now.getTime() + estimatedDays * 24 * 60 * 60 * 1000
    );
};

const getNextCycleNo = (learningPath: ILearningPath): number =>
    (learningPath.week_study_ids?.length ?? 0) + 1;

const resolveAssessmentPlan = (input: {
    trigger_type: SkillFocusedCycleTriggerV3;
    mini_tests_completed_since_last_full_test: number;
}): {
    assessment: LearningPathAssessmentPlanV3;
    next_mini_test_count: number;
} => {
    // Full test vừa hoàn tất sẽ mở một chu kỳ đo cục bộ mới từ đầu.
    if (input.trigger_type === "full_test_review") {
        return {
            assessment: {
                type: "mini_test",
                estimated_minutes: MINI_TEST_ESTIMATED_MINUTES,
            },
            next_mini_test_count: 0,
        };
    }

    const nextMiniTestCount =
        input.trigger_type === "mini_test_completion"
            ? input.mini_tests_completed_since_last_full_test + 1
            : input.mini_tests_completed_since_last_full_test;

    // Sau khi user đã hoàn thành đủ ba mini test, cycle kế tiếp kết thúc bằng full test.
    if (nextMiniTestCount >= FULL_TEST_AFTER_MINI_TEST_COUNT) {
        return {
            assessment: {
                type: "full_test",
                estimated_minutes: FULL_TEST_ESTIMATED_MINUTES,
            },
            next_mini_test_count: nextMiniTestCount,
        };
    }

    return {
        assessment: {
            type: "mini_test",
            estimated_minutes: MINI_TEST_ESTIMATED_MINUTES,
        },
        next_mini_test_count: nextMiniTestCount,
    };
};

const loadSelectedLessonManagers = async (
    selectedUnits: SkillRoiUnitResultV3[]
): Promise<Map<string, ILessonManager>> => {
    const ids = selectedUnits.map((unit) =>
        toObjectId(unit.lesson_manager_id, "lesson_manager_id")
    );
    const lessonManagers = (await LessonManager.find({
        _id: { $in: ids },
    })) as ILessonManager[];
    const byId = new Map(
        lessonManagers.map((lessonManager) => [
            String(lessonManager._id),
            lessonManager,
        ])
    );

    for (const unit of selectedUnits) {
        if (!byId.has(unit.lesson_manager_id)) {
            throw new Error(
                `Không tìm thấy LessonManager đã được ROI engine chọn: ${unit.lesson_manager_id}`
            );
        }
    }

    return byId;
};

const mapDecisionUnitsToPlanUnits = (input: {
    decision: SelectedSkillRoiDecisionV3;
    lessonManagerById: Map<string, ILessonManager>;
}): PlannedRouteUnitV2[] =>
    input.decision.selected_units.map((unit, index) => {
        const lessonManager = input.lessonManagerById.get(
            unit.lesson_manager_id
        )!;

        return {
            lesson_manager_id: unit.lesson_manager_id,
            title: lessonManager.title,
            part_type: lessonManager.part_type,
            score_band: lessonManager.score_band,
            unit_type: lessonManager.unit_type,
            node_role: lessonManager.node_role,
            target_tags: lessonManager.target_tags ?? [],
            order: index,
            planned_minutes: unit.planned_minutes,
            estimated_gain: unit.expected_skill_gain,
            reason: unit.reason,
            unit_source: "strategy",
            source_reason: "Skill ROI package",
        };
    });

const buildCyclePlan = (input: {
    decision: SelectedSkillRoiDecisionV3;
    assessment: LearningPathAssessmentPlanV3;
    lessonManagerById: Map<string, ILessonManager>;
}): LearningCyclePlanV2 => {
    const selectedUnits = mapDecisionUnitsToPlanUnits({
        decision: input.decision,
        lessonManagerById: input.lessonManagerById,
    });

    return {
        plan_type: "learning_cycle",
        selected_roadmap_units: selectedUnits,
        selected_roadmap_positions: [
            {
                part_type: input.decision.focus_part_type,
                from_cursor_index: 0,
                to_cursor_index: selectedUnits.length - 1,
                selected_count: selectedUnits.length,
            },
        ],
        focus_skill_keys: [
            input.decision.primary_focus_skill_key,
            ...input.decision.covered_skill_keys,
        ],
        focus_part_types: [input.decision.focus_part_type],
        estimated_learning_minutes:
            input.decision.estimated_learning_minutes,
        assessment:
            input.assessment.type === "mini_test"
                ? {
                    type: "mini_test",
                    estimated_minutes: input.assessment.estimated_minutes,
                    focus_skill_keys: [
                        input.decision.primary_focus_skill_key,
                        ...input.decision.covered_skill_keys,
                    ],
                    focus_part_types: [input.decision.focus_part_type],
                }
                : {
                    type: "full_test",
                    estimated_minutes: input.assessment.estimated_minutes,
                },
    };
};

const createSelectedStrategyOption = async (input: {
    user_id: Types.ObjectId;
    learning_path_id: Types.ObjectId;
    trigger_type: SkillFocusedCycleTriggerV3;
    scenario: LearningPathScenarioV2;
    source_user_test_id: Types.ObjectId;
    source_week_study_id?: Types.ObjectId;
    decision: SelectedSkillRoiDecisionV3;
    lessonManagerById: Map<string, ILessonManager>;
    now: Date;
}): Promise<ILearningPathStrategyOption> => {
    const primaryLabel =
        getToeicSkillLabelVi(
            input.decision.primary_focus_skill_key,
            input.decision.focus_part_type
        ) ?? input.decision.primary_focus_skill_key;

    return LearningPathStrategyOption.create({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        trigger_type: input.trigger_type,
        source_user_test_id: input.source_user_test_id,
        source_week_study_id: input.source_week_study_id ?? null,
        strategy: "maximize_skill_roi",
        scenario: input.scenario,
        status: "selected",
        title: `Tập trung ${primaryLabel}`,
        description:
            "Cycle được chọn tự động từ package LessonManager có ROI dự kiến cao nhất.",
        focus_part_types: [input.decision.focus_part_type],
        focus_skill_keys: [
            input.decision.primary_focus_skill_key,
            ...input.decision.covered_skill_keys,
        ],
        estimated_total_minutes:
            input.decision.estimated_learning_minutes,
        estimated_gain: input.decision.expected_skill_gain,
        reaches_target: false,
        part_roadmaps: [
            {
                part_type: input.decision.focus_part_type,
                cursor_index: 0,
                target_minutes: input.decision.estimated_learning_minutes,
                estimated_gain: input.decision.expected_skill_gain,
                reaches_target: false,
                units: input.decision.selected_units.map((unit, index) => {
                    const lessonManager = input.lessonManagerById.get(
                        unit.lesson_manager_id
                    )!;

                    return {
                        lesson_manager_id: lessonManager._id,
                        title: lessonManager.title,
                        part_type: lessonManager.part_type,
                        score_band: lessonManager.score_band,
                        unit_type: lessonManager.unit_type,
                        node_role: lessonManager.node_role,
                        target_tags: lessonManager.target_tags ?? [],
                        order: index,
                        planned_minutes: unit.planned_minutes,
                        estimated_gain: unit.expected_skill_gain,
                        reason: unit.reason,
                        unit_source: "strategy",
                        source_reason: "Skill ROI package",
                    };
                }),
            },
        ],
        summary_reasons: [
            `Skill ${input.decision.primary_focus_skill_key} có package ROI cao nhất.`,
            `Expected gain: ${input.decision.expected_skill_gain}.`,
            `Expected ROI/giờ: ${input.decision.expected_roi_per_hour}.`,
        ],
        selected_at: input.now,
    });
};

const countCycleActivities = (dayStudies: IDayStudy[]) => ({
    generated_day_count: dayStudies.length,
    generated_session_count: dayStudies.reduce(
        (sum, day) => sum + (day.sessions?.length ?? 0),
        0
    ),
    generated_activity_count: dayStudies.reduce(
        (sum, day) =>
            sum +
            (day.sessions ?? []).reduce(
                (sessionSum, session) =>
                    sessionSum + (session.items?.length ?? 0),
                0
            ),
        0
    ),
});

/**
 * Chuyển Skill ROI decision thành cycle thật trong database.
 * ROI engine đã chọn sẵn skill và package; service này không duyệt graph lại.
 */
export const createSkillFocusedCycle = async (
    input: CreateSkillFocusedCycleInput
): Promise<CreateSkillFocusedCycleResult> => {
    const now = input.now ?? new Date();
    const userObjectId = toObjectId(input.user_id, "user_id");
    const learningPathObjectId = toObjectId(
        input.learning_path_id,
        "learning_path_id"
    );
    const sourceUserTestId = toObjectId(
        input.source_user_test_id,
        "source_user_test_id"
    );
    const sourceWeekStudyId = input.source_week_study_id
        ? toObjectId(input.source_week_study_id, "source_week_study_id")
        : undefined;

    const learningPath = await LearningPath.findOne({
        _id: learningPathObjectId,
        user_id: userObjectId,
        isActive: true,
    });
    if (!learningPath) {
        throw new Error("Không tìm thấy LearningPath đang hoạt động.");
    }

    const planningContext = await buildSkillRoiPlanningContext({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
    });
    const decision = selectBestSkillRoiOpportunity(planningContext);
    if (decision.status !== "selected") {
        throw new NoEligibleSkillPackageError(decision);
    }

    const lessonManagerById = await loadSelectedLessonManagers(
        decision.selected_units
    );
    const cycleNo = getNextCycleNo(learningPath);
    const assessmentState = resolveAssessmentPlan({
        trigger_type: input.trigger_type,
        mini_tests_completed_since_last_full_test:
            learningPath.mini_tests_completed_since_last_full_test ?? 0,
    });
    const plan = buildCyclePlan({
        decision,
        assessment: assessmentState.assessment,
        lessonManagerById,
    });

    // Tạo đề trước mutation scheduler để lỗi generate test không để lại cycle dở dang.
    const assessmentResult = await generateAssessmentTestFromPlan({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        cycle_no: cycleNo,
        assessment: assessmentState.assessment,
        primary_focus_skill_key: decision.primary_focus_skill_key,
        covered_skill_keys: decision.covered_skill_keys,
        focus_part_type: decision.focus_part_type,
    });

    let strategyOption: ILearningPathStrategyOption | null = null;

    // StrategyOption chỉ được tạo sau full test.
    // Initial test và mini test vẫn tạo cycle trực tiếp từ Skill ROI decision.
    if (input.trigger_type === "full_test_review") {
        await LearningPathStrategyOption.updateMany(
            {
                learning_path_id: learningPathObjectId,
                user_id: userObjectId,
                status: { $in: ["selected", "pending_selection"] },
            },
            { $set: { status: "expired" } }
        );

        strategyOption = await createSelectedStrategyOption({
            user_id: userObjectId,
            learning_path_id: learningPathObjectId,
            trigger_type: input.trigger_type,
            scenario: input.scenario,
            source_user_test_id: sourceUserTestId,
            source_week_study_id: sourceWeekStudyId,
            decision,
            lessonManagerById,
            now,
        });
    }

    const weekStudy = await WeekStudy.create({
        no: cycleNo,
        description: `Cycle ${cycleNo}: tập trung ${decision.primary_focus_skill_key}`,
        status: WeekStudyStatus.IN_PROGRESS,
        accuracy_overall: 0,
        days: [],
        expected_completion_at: calculateExpectedCompletionAt({
            now,
            estimated_learning_minutes:
                decision.estimated_learning_minutes,
            assessment_estimated_minutes:
                assessmentState.assessment.estimated_minutes,
            time_per_day: learningPath.time_per_day,
        }),
        primary_focus_skill_key:
            decision.primary_focus_skill_key,
        covered_skill_keys: decision.covered_skill_keys,
        focus_part_type: decision.focus_part_type,
        cycle_mode: "main_learning",
        expected_skill_gain: decision.expected_skill_gain,
        expected_roi_per_hour: decision.expected_roi_per_hour,
        learning_path_strategy_option_id: strategyOption?._id ?? null,
        assessment_type: assessmentState.assessment.type,
        assessment_estimated_minutes:
            assessmentState.assessment.estimated_minutes,
    });

    const dayStudyResult = await createDayStudiesForSkillFocusedCycle({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        week_study_id: String(weekStudy._id),
        assessment_test_id: assessmentResult.test_id,
        selected_units: decision.selected_units,
    });

    learningPath.week_study_ids = learningPath.week_study_ids ?? [];
    learningPath.week_study_ids.push(weekStudy._id);
    learningPath.current_week = cycleNo;
    learningPath.mini_tests_completed_since_last_full_test =
        assessmentState.next_mini_test_count;

    if (input.trigger_type === "full_test_review") {
        learningPath.last_full_test_user_test_id = sourceUserTestId;
        learningPath.last_full_test_submitted_at = now;
    }

    await learningPath.save();

    // SchedulerDecisionLog được tạo sau mọi test, không phụ thuộc vào việc có StrategyOption hay không.
    const decisionReasons = [
        `Skill ${decision.primary_focus_skill_key} có package ROI cao nhất.`,
        `Expected gain: ${decision.expected_skill_gain}.`,
        `Expected ROI/giờ: ${decision.expected_roi_per_hour}.`,
    ];

    await createSchedulerDecisionLog({
        user_id: userObjectId,
        learning_path_id: learningPathObjectId,
        learning_path_strategy_option_id: strategyOption?._id ?? null,
        source_week_id: sourceWeekStudyId,
        generated_week_id: weekStudy._id,
        trigger_type: input.trigger_type,
        scheduler_version: "learning-path-v3-skill-roi",
        strategy: "maximize_skill_roi",
        scenario: input.scenario,
        status: "applied",
        reasons: decisionReasons,
        warnings: [],
        input_snapshot: {
            current_score: input.current_score,
            target_score: learningPath.target_score,
            weekly_available_minutes:
                decision.estimated_learning_minutes,
            test_type:
                input.trigger_type === "initial_generation"
                    ? "entry"
                    : input.trigger_type === "full_test_review"
                        ? "full"
                        : "mini",
            part_abilities: planningContext.part_abilities,
            skill_abilities: planningContext.skill_abilities,
            extra: {
                policy: planningContext.policy,
                evaluated_skill_count: decision.evaluated_skill_count,
                eligible_skill_count: decision.eligible_skill_count,
                candidates: decision.candidates,
                assessment_type: assessmentState.assessment.type,
            },
        },
        selected_lesson_manager_ids: decision.selected_units.map(
            (unit) => unit.lesson_manager_id
        ),
        output_summary: {
            planned_minutes: decision.estimated_learning_minutes,
            selected_unit_count: decision.selected_units.length,
            ...countCycleActivities(dayStudyResult.day_studies),
        },
        created_by: userObjectId,
    });

    logLearningPathV2DebugSafe("skill_focused_cycle.created", {
        stage: "skill_focused_cycle",
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        trigger_type: input.trigger_type,
        week_study_id: weekStudy._id,
        primary_focus_skill_key:
            decision.primary_focus_skill_key,
        covered_skill_keys: decision.covered_skill_keys,
        selected_lesson_manager_ids: decision.selected_units.map(
            (unit) => unit.lesson_manager_id
        ),
        assessment_type: assessmentState.assessment.type,
    });

    return {
        status: "cycle_created",
        decision,
        plan,
        strategy_option: strategyOption,
        week_study: dayStudyResult.week_study,
        day_studies: dayStudyResult.day_studies,
        assessment_result: assessmentResult,
    };
};
