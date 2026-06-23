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
    SimulatedSkillRoiRoadmapV3,
    SkillRoiDecisionV3,
    SkillRoiUnitResultV3,
} from "../../types/learning_path_v2";
import { getToeicSkillLabelVi } from "../../utils/toeic_skill.util";
import {
    buildSkillRoiPlanningContext,
    DEFAULT_SKILL_ROI_POLICY_V3,
    selectBestSkillRoiOpportunity,
} from "./skill_roi_optimizer.service";
import {
    simulateIdealSkillRoiRoadmap,
} from "./skill_roi_roadmap_simulator.service";
import {
    generateAssessmentTestFromPlan,
    type GenerateAssessmentTestResult,
    type LearningPathAssessmentPlanV3,
} from "./learning_path_assessment.service";
import {
    logLearningPathV2Debug,
    logLearningPathV2DebugSafe,
} from "./learning_path_v2_debug_logger";
import { createSchedulerDecisionLog } from "./scheduler_decision_log.service";
import {
    createDayStudiesForSkillFocusedCycle,
} from "../day_study.service";

const MINI_TEST_ESTIMATED_MINUTES = 60;
const FULL_TEST_ESTIMATED_MINUTES = 120;
const FULL_TEST_AFTER_MINI_TEST_COUNT = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CONSECUTIVE_REMEDIATION_CYCLES = 2;

const REMEDIATION_SKILL_ROI_POLICY_V3 = {
    ...DEFAULT_SKILL_ROI_POLICY_V3,
    min_lesson_manager_count: 1,
    max_lesson_manager_count: 2,
    max_learning_minutes: 120,
};

/**
 * StrategyOption chỉ có hiệu lực đến Full test kế tiếp.
 *
 * Ba mini test của main learning sẽ dẫn đến full test tiếp theo.
 * Mini test của remediation chỉ dùng để đo lại focus skill, không tính cadence.
 * từ kết quả ability thực tế.
 */

export type SkillFocusedCycleTriggerV3 = Extract<
    LearningPathStrategyOptionTrigger,
    "initial_generation" | "mini_test_completion" | "full_test_review"
>;

type SelectedSkillRoiDecisionV3 = Extract<
    SkillRoiDecisionV3,
    { status: "selected" }
>;

type SkillFocusedCycleIntent = {
    cycle_mode: IWeekStudy["cycle_mode"];
    forced_skill_key?: string;
    forced_part_type?: number;
    excluded_skill_key?: string;
    excluded_part_type?: number;
    remediation_attempt?: 1 | 2;
    consecutive_remediation_count: number;
    remediation_limit_reached: boolean;
    source_cycle_mode?: IWeekStudy["cycle_mode"];
};

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
    roadmap_simulation: SimulatedSkillRoiRoadmapV3 | null;
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

const calculateRoadmapAvailableMinutes = (input: {
    now: Date;
    target_completion_date?: Date | null;
    time_per_day?: number;
    days_per_week?: number;
}): number => {
    if (!input.time_per_day || input.time_per_day <= 0) {
        throw new Error("LearningPath chưa có time_per_day.");
    }

    if (input.target_completion_date && input.target_completion_date > input.now) {
        const daysRemaining = Math.ceil(
            (input.target_completion_date.getTime() - input.now.getTime()) /
            ONE_DAY_MS
        );
        const daysPerWeek = Math.min(Math.max(input.days_per_week ?? 7, 1), 7);
        return Math.max(
            1,
            Math.round((daysRemaining * daysPerWeek / 7) * input.time_per_day)
        );
    }

    return Math.max(1, Math.round(30 * input.time_per_day));
};

const resolveAssessmentPlan = (input: {
    trigger_type: SkillFocusedCycleTriggerV3;
    mini_tests_completed_since_last_full_test: number;
    cycle_mode: IWeekStudy["cycle_mode"];
    completed_cycle_mode?: IWeekStudy["cycle_mode"];
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

    // Only assessments from main learning advance the 3-mini-test cadence.
    // Remediation mini tests are diagnostic and must not bring a full test closer.
    const completedMainLearningMiniTest =
        input.trigger_type === "mini_test_completion" &&
        input.completed_cycle_mode === "main_learning";
    const nextMiniTestCount =
        completedMainLearningMiniTest
            ? input.mini_tests_completed_since_last_full_test + 1
            : input.mini_tests_completed_since_last_full_test;

    // A remediation cycle must always end in a focused mini test.
    if (input.cycle_mode === "remediation") {
        return {
            assessment: {
                type: "mini_test",
                estimated_minutes: MINI_TEST_ESTIMATED_MINUTES,
            },
            next_mini_test_count: nextMiniTestCount,
        };
    }

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

const resolveSkillFocusedCycleIntent = async (input: {
    trigger_type: SkillFocusedCycleTriggerV3;
    scenario: LearningPathScenarioV2;
    source_week_study_id?: Types.ObjectId;
    learning_path_week_ids: Types.ObjectId[];
}): Promise<SkillFocusedCycleIntent> => {
    const defaultIntent: SkillFocusedCycleIntent = {
        cycle_mode: "main_learning",
        consecutive_remediation_count: 0,
        remediation_limit_reached: false,
    };

    if (
        input.trigger_type !== "mini_test_completion" ||
        input.scenario !== "PLATEAU" ||
        !input.source_week_study_id
    ) {
        return defaultIntent;
    }

    const sourceWeek = await WeekStudy.findById(input.source_week_study_id)
        .select("no cycle_mode primary_focus_skill_key focus_part_type")
        .lean();
    if (!sourceWeek) {
        throw new Error("Không tìm thấy source WeekStudy để xử lý remediation.");
    }

    const recentWeeks = await WeekStudy.find({
        _id: { $in: input.learning_path_week_ids },
        no: { $lte: sourceWeek.no },
    })
        .select("no cycle_mode primary_focus_skill_key focus_part_type")
        .sort({ no: -1 })
        .limit(MAX_CONSECUTIVE_REMEDIATION_CYCLES + 1)
        .lean();

    let consecutiveRemediationCount = 0;
    for (const week of recentWeeks) {
        const isSameRemediationChain =
            week.cycle_mode === "remediation" &&
            week.primary_focus_skill_key === sourceWeek.primary_focus_skill_key &&
            week.focus_part_type === sourceWeek.focus_part_type;
        if (!isSameRemediationChain) break;
        consecutiveRemediationCount += 1;
    }

    if (consecutiveRemediationCount >= MAX_CONSECUTIVE_REMEDIATION_CYCLES) {
        return {
            cycle_mode: "main_learning",
            excluded_skill_key: sourceWeek.primary_focus_skill_key,
            excluded_part_type: sourceWeek.focus_part_type,
            consecutive_remediation_count: consecutiveRemediationCount,
            remediation_limit_reached: true,
            source_cycle_mode: sourceWeek.cycle_mode,
        };
    }

    return {
        cycle_mode: "remediation",
        forced_skill_key: sourceWeek.primary_focus_skill_key,
        forced_part_type: sourceWeek.focus_part_type,
        remediation_attempt: (consecutiveRemediationCount + 1) as 1 | 2,
        consecutive_remediation_count: consecutiveRemediationCount,
        remediation_limit_reached: false,
        source_cycle_mode: sourceWeek.cycle_mode,
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
    roadmapSimulation: SimulatedSkillRoiRoadmapV3;
    lessonManagerById: Map<string, ILessonManager>;
    now: Date;
}): Promise<ILearningPathStrategyOption> => {
    const primaryLabel =
        getToeicSkillLabelVi(
            input.decision.primary_focus_skill_key,
            input.decision.focus_part_type
        ) ?? input.decision.primary_focus_skill_key;

    const toRoadmapUnit = (
        unit: SkillRoiUnitResultV3,
        order: number,
        sourceReason: string
    ) => {
        const lessonManager = input.lessonManagerById.get(unit.lesson_manager_id);
        if (!lessonManager) {
            throw new Error(`Không tìm thấy LessonManager ${unit.lesson_manager_id} của simulated roadmap.`);
        }

        return {
            lesson_manager_id: lessonManager._id,
            title: lessonManager.title,
            part_type: lessonManager.part_type,
            score_band: lessonManager.score_band,
            unit_type: lessonManager.unit_type,
            node_role: lessonManager.node_role,
            target_tags: lessonManager.target_tags ?? [],
            order,
            planned_minutes: unit.planned_minutes,
            estimated_gain: unit.expected_skill_gain,
            reason: unit.reason,
            unit_source: "strategy" as const,
            source_reason: sourceReason,
        };
    };

    const cyclesByPart = new Map<
        number,
        SimulatedSkillRoiRoadmapV3["cycles"]
    >();
    for (const cycle of input.roadmapSimulation.cycles) {
        const partCycles = cyclesByPart.get(cycle.focus_part_type) ?? [];
        partCycles.push(cycle);
        cyclesByPart.set(cycle.focus_part_type, partCycles);
    }
    const roadmapFocusPartTypes = Array.from(cyclesByPart.keys()).sort(
        (left, right) => left - right
    );
    const roadmapFocusSkillKeys = Array.from(
        new Set(
            input.roadmapSimulation.cycles.flatMap((cycle) => [
                cycle.primary_focus_skill_key,
                ...cycle.covered_skill_keys,
            ])
        )
    ).sort();
    const firstCycle = input.roadmapSimulation.cycles[0];

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
            "Lộ trình dự kiến được mô phỏng bằng cách liên tục chọn package LessonManager có Skill ROI cao nhất trên trạng thái năng lực dự kiến.",
        focus_part_types: roadmapFocusPartTypes,
        focus_skill_keys: roadmapFocusSkillKeys,
        estimated_total_minutes: input.roadmapSimulation.total_used_minutes,
        estimated_gain:
            input.roadmapSimulation.planned_final_score -
            input.roadmapSimulation.anchor_score,
        reaches_target: input.roadmapSimulation.reaches_target,
        // Compatibility projection only; roadmap_simulation.cycles is the V3 source of truth.
        part_roadmaps: Array.from(cyclesByPart.entries())
            .sort(([left], [right]) => left - right)
            .map(([partType, partCycles]) => {
                const units = partCycles.flatMap((cycle) => cycle.selected_units);

                return {
                    part_type: partType,
                    cursor_index:
                        partType === firstCycle?.focus_part_type
                            ? firstCycle.selected_units.length
                            : 0,
                    target_minutes: partCycles.reduce(
                        (total, cycle) => total + cycle.estimated_learning_minutes,
                        0
                    ),
                    estimated_gain: partCycles.reduce(
                        (total, cycle) => total + cycle.planned_score_gain,
                        0
                    ),
                    reaches_target: input.roadmapSimulation.reaches_target,
                    units: units.map((unit, index) =>
                        toRoadmapUnit(unit, index, "Ideal Skill ROI roadmap")
                    ),
                };
            }),
        roadmap_simulation: {
            anchor_score: input.roadmapSimulation.anchor_score,
            target_score: input.roadmapSimulation.target_score,
            required_score_gain_per_hour: input.roadmapSimulation.required_score_gain_per_hour,
            planned_final_score: input.roadmapSimulation.planned_final_score,
            reaches_target: input.roadmapSimulation.reaches_target,
            total_learning_minutes: input.roadmapSimulation.total_learning_minutes,
            total_assessment_minutes: input.roadmapSimulation.total_assessment_minutes,
            total_used_minutes: input.roadmapSimulation.total_used_minutes,
            remaining_minutes: input.roadmapSimulation.remaining_minutes,
            cycle_count: input.roadmapSimulation.cycle_count,
            stop_reason: input.roadmapSimulation.stop_reason,
            cycles: input.roadmapSimulation.cycles.map((cycle) => ({
                ...cycle,
                selected_units: cycle.selected_units.map((unit, index) =>
                    toRoadmapUnit(unit, index, `Simulated cycle ${cycle.cycle_no}`)
                ),
            })),
        },
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

    const cycleIntent = await resolveSkillFocusedCycleIntent({
        trigger_type: input.trigger_type,
        scenario: input.scenario,
        source_week_study_id: sourceWeekStudyId,
        learning_path_week_ids: learningPath.week_study_ids ?? [],
    });
    const sourceWeekForCadence = !cycleIntent.source_cycle_mode && sourceWeekStudyId
        ? await WeekStudy.findById(sourceWeekStudyId).select("cycle_mode").lean()
        : null;

    const planningContext = await buildSkillRoiPlanningContext({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        policy:
            cycleIntent.cycle_mode === "remediation"
                ? REMEDIATION_SKILL_ROI_POLICY_V3
                : undefined,
    });
    const decisionContext = {
        ...planningContext,
        skill_abilities:
            cycleIntent.cycle_mode === "remediation"
                ? planningContext.skill_abilities.filter(
                    (skill) =>
                        skill.skill_key === cycleIntent.forced_skill_key &&
                        skill.part_type === cycleIntent.forced_part_type
                )
                : cycleIntent.remediation_limit_reached
                    ? planningContext.skill_abilities.filter(
                        (skill) =>
                            !(
                                skill.skill_key === cycleIntent.excluded_skill_key &&
                                skill.part_type === cycleIntent.excluded_part_type
                            )
                    )
                    : planningContext.skill_abilities,
    };
    const shouldSimulateRoadmap =
        input.trigger_type === "initial_generation" ||
        input.trigger_type === "full_test_review";
    let roadmapSimulation: SimulatedSkillRoiRoadmapV3 | null = null;
    let decision: SkillRoiDecisionV3;

    if (shouldSimulateRoadmap) {
        if (typeof input.current_score !== "number" || !Number.isFinite(input.current_score)) {
            throw new Error("Entry/Full test cần current_score để mô phỏng lộ trình.");
        }

        if (input.current_score >= (learningPath.target_score ?? 0)) {
            learningPath.status = "completed";
            learningPath.reason = "target_score_reached";
            learningPath.isActive = false;
            learningPath.updated_at = now;
            await learningPath.save();
            throw new Error("Người học đã đạt target score, không cần tạo cycle mới.");
        }

        const completedIds = new Set(
            planningContext.completed_lesson_manager_ids
        );
        const remainingLessonManagerCount =
            planningContext.lesson_managers.filter(
                (lessonManager) => !completedIds.has(lessonManager.id)
            ).length;
        const minLessonManagerCount = Math.max(
            1,
            planningContext.policy.min_lesson_manager_count
        );
        const maxCycleCount = Math.max(
            1,
            Math.floor(
                remainingLessonManagerCount / minLessonManagerCount
            )
        );
        const simulationStartedAt =
            Date.now();

        await logLearningPathV2Debug(
            "skill_roi.roadmap_simulation_start",
            {
                stage: "skill_roi_simulation",
                user_id: input.user_id,
                learning_path_id:
                    input.learning_path_id,
                trigger_type:
                    input.trigger_type,
                lesson_manager_count:
                    planningContext
                        .lesson_managers.length,
                skill_count:
                    planningContext
                        .skill_abilities.length,
                max_cycle_count:
                    maxCycleCount,
            }
        );
        roadmapSimulation = await simulateIdealSkillRoiRoadmap({
            anchor_score: input.current_score,
            target_score: learningPath.target_score ?? 0,
            available_total_minutes: calculateRoadmapAvailableMinutes({
                now,
                target_completion_date: learningPath.target_completion_date,
                time_per_day: learningPath.time_per_day,
                days_per_week: learningPath.days_per_week,
            }),
            planning_context: planningContext,
            max_cycle_count: maxCycleCount,
            on_progress: (progress) => {
                logLearningPathV2DebugSafe(
                    "skill_roi.roadmap_simulation_progress",
                    {
                        stage: "skill_roi_simulation",
                        user_id: input.user_id,
                        learning_path_id: input.learning_path_id,
                        trigger_type: input.trigger_type,
                        ...progress,
                    }
                );
            },
        });

        await logLearningPathV2Debug(
            "skill_roi.roadmap_simulation_complete",
            {
                stage: "skill_roi_simulation",
                user_id: input.user_id,
                learning_path_id:
                    input.learning_path_id,
                trigger_type:
                    input.trigger_type,
                elapsed_ms:
                    Date.now() -
                    simulationStartedAt,
                simulated_cycle_count:
                    roadmapSimulation.cycle_count,
                stop_reason:
                    roadmapSimulation.stop_reason,
                planned_final_score:
                    roadmapSimulation
                        .planned_final_score,
            }
        );

        if (!roadmapSimulation.first_decision) {
            throw new Error(
                `Không thể tạo cycle đầu từ simulation: ${roadmapSimulation.stop_reason}.`
            );
        }
        decision = roadmapSimulation.first_decision;
    } else {
        decision = selectBestSkillRoiOpportunity(decisionContext);
    }

    if (decision.status !== "selected") {
        const rejectionSummary = decision.candidates.reduce<
            Record<string, number>
        >((summary, candidate) => {
            const reason = candidate.rejection_reason ?? "eligible";
            summary[reason] = (summary[reason] ?? 0) + 1;
            return summary;
        }, {});

        logLearningPathV2DebugSafe("skill_roi.no_eligible_skill", {
            stage: "skill_roi",
            user_id: input.user_id,
            learning_path_id: input.learning_path_id,
            trigger_type: input.trigger_type,

            evaluated_skill_count: decision.evaluated_skill_count,
            rejection_summary: rejectionSummary,

            candidate_samples: decision.candidates
                .filter((candidate) => candidate.selected_units.length > 0)
                .slice(0, 10)
                .map((candidate) => ({
                    skill_key: candidate.skill_key,
                    part_type: candidate.part_type,
                    part_ability: candidate.part_ability,
                    current_ability: candidate.current_ability,
                    available_unit_count: candidate.available_unit_count,
                    selected_unit_ids: candidate.selected_units.map(
                        (unit) => unit.lesson_manager_id
                    ),
                    selected_unit_count: candidate.selected_units.length,
                    rejection_reason: candidate.rejection_reason,
                })),
        });

        await createSchedulerDecisionLog({
            user_id: userObjectId,
            learning_path_id: learningPathObjectId,
            source_week_id: sourceWeekStudyId,
            trigger_type: input.trigger_type,
            scheduler_version: "learning-path-v3-skill-roi",
            strategy: "maximize_skill_roi",
            scenario: input.scenario,
            status: "failed",
            reasons: ["Không còn package Skill ROI hợp lệ sau khi áp dụng cycle intent."],
            warnings: cycleIntent.remediation_limit_reached
                ? [`REMEDIATION_LIMIT_REACHED:${cycleIntent.excluded_skill_key}`]
                : [],
            input_snapshot: {
                part_abilities: planningContext.part_abilities,
                skill_abilities: decisionContext.skill_abilities,
                extra: {
                    cycle_mode: cycleIntent.cycle_mode,
                    remediation_limit_reached: cycleIntent.remediation_limit_reached,
                    excluded_skill_key: cycleIntent.excluded_skill_key ?? null,
                },
            },
            error_message: decision.reason,
            created_by: userObjectId,
        });
        throw new NoEligibleSkillPackageError(decision);
    }

    const unitsToLoad = roadmapSimulation
        ? roadmapSimulation.cycles.flatMap((cycle) => cycle.selected_units)
        : decision.selected_units;
    const lessonManagerById = await loadSelectedLessonManagers(unitsToLoad);
    const cycleNo = getNextCycleNo(learningPath);
    const assessmentState = resolveAssessmentPlan({
        trigger_type: input.trigger_type,
        mini_tests_completed_since_last_full_test:
            learningPath.mini_tests_completed_since_last_full_test ?? 0,
        cycle_mode: cycleIntent.cycle_mode,
        completed_cycle_mode:
            cycleIntent.source_cycle_mode ?? sourceWeekForCadence?.cycle_mode,
    });
    const firstSimulatedCycle = roadmapSimulation?.cycles[0];
    if (
        firstSimulatedCycle &&
        firstSimulatedCycle.assessment_type !== assessmentState.assessment.type
    ) {
        throw new Error("Assessment của simulated cycle đầu không khớp runtime cadence.");
    }
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

    let createdStrategyOption: ILearningPathStrategyOption | null = null;
    let activeStrategyOption: ILearningPathStrategyOption | null = null;

    // Entry và Full test tạo StrategyOption từ roadmap simulation.
    // Mini test chỉ tạo cycle thích nghi và tiếp tục liên kết với baseline đang selected.
    if (input.trigger_type === "initial_generation" ||
        input.trigger_type === "full_test_review"
    ) {
        await LearningPathStrategyOption.updateMany(
            {
                learning_path_id: learningPathObjectId,
                user_id: userObjectId,
                status: { $in: ["selected", "pending_selection"] },
            },
            { $set: { status: "expired" } }
        );

        if (!roadmapSimulation) {
            throw new Error("Thiếu roadmap simulation khi tạo StrategyOption.");
        }

        createdStrategyOption = await createSelectedStrategyOption({
            user_id: userObjectId,
            learning_path_id: learningPathObjectId,
            trigger_type: input.trigger_type,
            scenario: input.scenario,
            source_user_test_id: sourceUserTestId,
            source_week_study_id: sourceWeekStudyId,
            decision,
            roadmapSimulation,
            lessonManagerById,
            now,
        });
        activeStrategyOption = createdStrategyOption;
    } else {
        activeStrategyOption = await LearningPathStrategyOption.findOne({
            learning_path_id: learningPathObjectId,
            user_id: userObjectId,
            status: "selected",
        }).sort({ selected_at: -1, created_at: -1 });
    }

    const cycleDescription =
        cycleIntent.cycle_mode === "remediation"
            ? `Cycle ${cycleNo}: remediation ${decision.primary_focus_skill_key} lần ${cycleIntent.remediation_attempt}/2`
            : cycleIntent.remediation_limit_reached
                ? `Cycle ${cycleNo}: chuyển từ ${cycleIntent.excluded_skill_key} sang ${decision.primary_focus_skill_key}`
                : `Cycle ${cycleNo}: tập trung ${decision.primary_focus_skill_key}`;
    const weekStudy = await WeekStudy.create({
        no: cycleNo,
        description: cycleDescription,
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
        cycle_mode: cycleIntent.cycle_mode,
        expected_skill_gain: decision.expected_skill_gain,
        expected_roi_per_hour: decision.expected_roi_per_hour,
        learning_path_strategy_option_id: activeStrategyOption?._id ?? null,
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
    const decisionReasons =
        cycleIntent.cycle_mode === "remediation"
            ? [
                `Skill ${decision.primary_focus_skill_key} không đạt ngưỡng tiến bộ.`,
                `Tạo remediation cycle lần ${cycleIntent.remediation_attempt}/2.`,
                "Giữ nguyên primary skill và chọn package ROI cao nhất trong skill này.",
                `Expected gain: ${decision.expected_skill_gain}.`,
                `Expected ROI/giờ: ${decision.expected_roi_per_hour}.`,
            ]
            : cycleIntent.remediation_limit_reached
                ? [
                    `Skill ${cycleIntent.excluded_skill_key} vẫn PLATEAU sau 2 remediation cycle liên tiếp.`,
                    "Đã loại skill này khỏi ROI selection hiện tại.",
                    `Chuyển sang skill ${decision.primary_focus_skill_key}.`,
                    `Expected ROI/giờ mới: ${decision.expected_roi_per_hour}.`,
                ]
                : [
                    `Skill ${decision.primary_focus_skill_key} có package ROI cao nhất.`,
                    `Expected gain: ${decision.expected_skill_gain}.`,
                    `Expected ROI/giờ: ${decision.expected_roi_per_hour}.`,
                    `Projected Part ability: ${decision.projected_part_ability_before} → ${decision.projected_part_ability_after}.`,
                    `Ability-based TOEIC score gain proxy: ${decision.projected_score_gain}.`,
                ];
    const topCandidateSummaries = [...decision.candidates]
        .filter((candidate) => !candidate.rejection_reason)
        .sort(
            (left, right) =>
                right.expected_roi_per_hour -
                left.expected_roi_per_hour
        )
        .slice(0, 10)
        .map((candidate) => ({
            skill_key: candidate.skill_key,
            part_type: candidate.part_type,
            current_ability: candidate.current_ability,
            expected_skill_gain: candidate.expected_skill_gain,
            expected_roi_per_hour: candidate.expected_roi_per_hour,
            selected_unit_ids: candidate.selected_units.map(
                (unit) => unit.lesson_manager_id
            ),
        }));

    await createSchedulerDecisionLog({
        user_id: userObjectId,
        learning_path_id: learningPathObjectId,
        learning_path_strategy_option_id: activeStrategyOption?._id ?? null,
        source_week_id: sourceWeekStudyId,
        generated_week_id: weekStudy._id,
        trigger_type: input.trigger_type,
        scheduler_version: "learning-path-v3-skill-roi",
        strategy: "maximize_skill_roi",
        scenario: input.scenario,
        status: "applied",
        reasons: decisionReasons,
        warnings: cycleIntent.remediation_limit_reached
            ? [`REMEDIATION_LIMIT_REACHED:${cycleIntent.excluded_skill_key}`]
            : [],
        input_snapshot: {
            current_score: input.current_score,
            target_score: learningPath.target_score,
            weekly_available_minutes:
                (learningPath.time_per_day ?? 0) *
                (learningPath.days_per_week ?? 0),
            test_type:
                input.trigger_type === "initial_generation"
                    ? "entry"
                    : input.trigger_type === "full_test_review"
                        ? "full"
                        : "mini",
            part_abilities: planningContext.part_abilities,
            skill_abilities: decisionContext.skill_abilities,
            extra: {
                policy: planningContext.policy,
                cycle_mode: cycleIntent.cycle_mode,
                remediation_attempt: cycleIntent.remediation_attempt ?? null,
                consecutive_remediation_count:
                    cycleIntent.consecutive_remediation_count,
                remediation_limit_reached:
                    cycleIntent.remediation_limit_reached,
                forced_skill_key: cycleIntent.forced_skill_key ?? null,
                excluded_skill_key: cycleIntent.excluded_skill_key ?? null,
                evaluated_skill_count: decision.evaluated_skill_count,
                eligible_skill_count: decision.eligible_skill_count,
                top_candidates: topCandidateSummaries,
                assessment_type: assessmentState.assessment.type,
                selected_projection: {
                    skill_ability_before:
                        decision.projected_skill_ability_before,

                    skill_ability_after:
                        decision.projected_skill_ability_after,

                    part_ability_before:
                        decision.projected_part_ability_before,

                    part_ability_after:
                        decision.projected_part_ability_after,

                    ability_based_score_gain_proxy:
                        decision.projected_score_gain,
                },
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
        strategy_option: createdStrategyOption,
        week_study: dayStudyResult.week_study,
        day_studies: dayStudyResult.day_studies,
        assessment_result: assessmentResult,
        roadmap_simulation: roadmapSimulation,
    };
};
