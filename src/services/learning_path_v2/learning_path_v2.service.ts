import type {
  AbilityProfileV2,
  BuildFullTestLearningPathPlanInput,
  BuildInitialLearningPathPlanInput,
  BuildMiniTestNextWeekPlanInput,
  LearningPathScenarioV2,
  LearningScenarioDecisionV2,
  NormalizedTestResultV2,
} from "../../types/learning_path_v2";
import { Types } from "mongoose";
import {
  GroupUser,
  LearningPath,
  LearningPathStrategyOption,
  LessonManager,
  UserProgress,
  UserSkill,
  UserSkillHistory,
  UserTest,
} from "../../models";
import type { IUserTest } from "../../models";
import type { ILearningPath } from "../../models/learning_path.model";
import { CERFLevel } from "../../models/topic_vocabulary.model";
import type { ILearningPathStrategyOption } from "../../models/learning_path_strategy_option.model";
import type { ILessonManager } from "../../models/lesson_manager.model";
import type { IUserSkill } from "../../models/user_skill.model";
import type { IUserSkillHistory } from "../../models/user_skill_history.model";
import { normalizeTestResult } from "./layer1_test_result.service";
import { buildAbilityProfile } from "./layer2_ability_profile.service";
import { getLatestUserTestBySubmitType } from "../user_test.service";
import { UserTestSubmitType } from "../../models/enums/UserTestSubmitType";
import { ensureMentorAssignedForUser } from "../mentor_assignment.service";
import { createUserSkillHistory } from "../user_skill_history.service";
import {
  getUserSkillSnapshot,
  updateUserSkillFromHistory,
} from "../user_skill.service";
import { evaluateLearningPathScenario } from "./layer3_strategy_decision.service";
import { logLearningPathV2DebugSafe } from "./learning_path_v2_debug_logger";
import {
  createSkillFocusedCycle,
  type CreateSkillFocusedCycleResult,
} from "./skill_focused_cycle.service";
import { calculateProjectedToeicScore } from "./skill_roi_optimizer.service";
import { emitToUser } from "../../socket/emitToUser.socket";

import { DayStudy, WeekStudy } from "../../models";
import type { IDayStudy } from "../../models/day_study.model";
import type { IWeekStudy } from "../../models/week_study.model";
import { SchedulerDecisionLog } from "../../models/scheduler_decision_log.model";
import { WeekStudyStatus } from "../../models/enums/WeekStudyStatus";
import { SessionType } from "../../models/enums/SessionType";
import { getToeicSkillLabelVi } from "../../utils/toeic_skill.util";
import { updateUserProgress } from "../user_progress.service";

export type LearningPathV2AbilityPipelineInput =
  | BuildInitialLearningPathPlanInput
  | BuildFullTestLearningPathPlanInput
  | BuildMiniTestNextWeekPlanInput;

export interface LearningPathV2AbilityPipelineOutput {
  normalized_result: NormalizedTestResultV2;
  user_test: IUserTest;
  ability_profile: AbilityProfileV2;
  user_skill_history: IUserSkillHistory;
  user_skill: IUserSkill;
  scenario_decision: LearningScenarioDecisionV2;
  layer4_result?: {
    strategy_options?: ILearningPathStrategyOption[];
    selected_strategy_option?: ILearningPathStrategyOption | null;
    cycle_result?:
    | CreateSkillFocusedCycleResult
    | null;
  };
}

/**
 * Guard lịch sử của giai đoạn chuyển từ planner cũ sang scheduler V3.
 * Hiện ROI scheduler đã sẵn sàng, class này chỉ còn để caller cũ compile.
 */
export class LearningPathV3SchedulerNotReadyError extends Error {
  statusCode = 503;

  constructor() {
    super("Skill ROI scheduler chưa sẵn sàng.");
    this.name = "LearningPathV3SchedulerNotReadyError";
  }
}

/**
 * Giữ export để các caller cũ tiếp tục compile.
 * ROI scheduler hiện là đường chạy chính nên guard không còn chặn pipeline.
 */
export const assertLearningPathV3SchedulerReady = (): void => undefined;

type Layer4PipelineResult = NonNullable<
  LearningPathV2AbilityPipelineOutput["layer4_result"]
>;

const isAssessmentPipelineTrigger = (
  triggerType: LearningPathV2AbilityPipelineInput["trigger_type"]
): triggerType is "mini_test_completion" | "full_test_review" =>
  triggerType === "mini_test_completion" || triggerType === "full_test_review";

const getAssessmentTypeFromTrigger = (
  triggerType: "mini_test_completion" | "full_test_review"
): "mini_test" | "full_test" =>
  triggerType === "mini_test_completion" ? "mini_test" : "full_test";

const emitLearningPathAssessmentEvent = (input: {
  user_id: string;
  learning_path_id: string;
  trigger_type: LearningPathV2AbilityPipelineInput["trigger_type"];
  event: string;
  payload: Record<string, unknown>;
}): void => {
  if (!isAssessmentPipelineTrigger(input.trigger_type)) return;

  try {
    emitToUser(input.user_id, input.event, {
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      assessment_type: getAssessmentTypeFromTrigger(input.trigger_type),
      ...input.payload,
    });
  } catch (error) {
    logLearningPathV2DebugSafe("pipeline.assessment_emit_failed", {
      stage: "pipeline",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      event: input.event,
      error,
    });
  }
};

const toValidUserObjectId = (userId: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error("user_id không hợp lệ.");
  }

  return new Types.ObjectId(userId);
};

const toObjectId = (id: string | Types.ObjectId): Types.ObjectId =>
  id instanceof Types.ObjectId ? id : new Types.ObjectId(id);

const getLatestActiveLearningPathForUser = async (
  userId: string
): Promise<ILearningPath | null> => {
  return LearningPath.findOne({
    user_id: toValidUserObjectId(userId),
    isActive: true,
  }).sort({ created_at: -1 });
};

export const upsertLearningPathV2Setup = async (input: {
  user_id: string;
  target_score: number;
  target_completion_date: Date;
  time_per_day: number;
  days_per_week: number;
}): Promise<{ learning_path: ILearningPath }> => {
  const userObjectId = toValidUserObjectId(input.user_id);

  if (!Number.isFinite(input.target_score) || input.target_score <= 0) {
    throw new Error("target_score không hợp lệ.");
  }

  if (
    !(input.target_completion_date instanceof Date) ||
    Number.isNaN(input.target_completion_date.getTime())
  ) {
    throw new Error("target_completion_date không hợp lệ.");
  }

  if (!Number.isFinite(input.time_per_day) || input.time_per_day <= 0) {
    throw new Error("time_per_day không hợp lệ.");
  }

  if (
    !Number.isFinite(input.days_per_week) ||
    input.days_per_week < 1 ||
    input.days_per_week > 7
  ) {
    throw new Error("days_per_week không hợp lệ.");
  }

  const existing = await getLatestActiveLearningPathForUser(input.user_id);

  if ((existing?.week_study_ids?.length ?? 0) > 0) {
    throw new Error(
      "Lộ trình đã được tạo cycle, không thể sửa setup trực tiếp."
    );
  }

  const setupPayload = {
    target_score: input.target_score,
    target_completion_date: input.target_completion_date,
    time_per_day: input.time_per_day,
    days_per_week: input.days_per_week,
    updated_at: new Date(),
  };

  if (existing) {
    existing.set(setupPayload);
    await existing.save();
    return { learning_path: existing };
  }

  const learningPath = await LearningPath.create({
    user_id: userObjectId,
    title: "Lộ trình TOEIC Smart",
    description: "Lộ trình cá nhân hóa bằng LearningPath v2",
    level: CERFLevel.B1,
    isActive: true,
    status: "active",
    reason: null,
    ...setupPayload,
    current_week: 1,
    week_study_ids: [],
    created_by: userObjectId,
    created_at: new Date(),
  });

  return { learning_path: learningPath };
};

export const getLearningPathV2GenerationContext = async (input: {
  user_id: string;
}) => {
  const learningPath = await getLatestActiveLearningPathForUser(input.user_id);
  const latestInitialTest = await getLatestUserTestBySubmitType({
    user_id: input.user_id,
    submit_type: UserTestSubmitType.INITIAL_ASSESSMENT,
  });

  const missing_requirements: string[] = [];

  if (!learningPath) {
    missing_requirements.push("learning_path_setup");
  }

  if (!latestInitialTest) {
    missing_requirements.push("initial_assessment");
  }

  if (learningPath && !learningPath.target_completion_date) {
    missing_requirements.push("target_completion_date");
  }

  if (
    learningPath &&
    (!learningPath.time_per_day || !learningPath.days_per_week)
  ) {
    missing_requirements.push("time_setup");
  }

  return {
    learning_path: learningPath,
    latest_initial_test: latestInitialTest,
    can_generate: missing_requirements.length === 0,
    missing_requirements,
  };
};

export const ensureLearningPathV2MentorAssigned = async (input: {
  user_id: string;
  learning_path_id: string;
  current_score?: number;
  target_score?: number;
}) => {
  const userObjectId = toValidUserObjectId(input.user_id);
  const learningPathObjectId = toObjectId(input.learning_path_id);

  let group = await GroupUser.findOne({ students: userObjectId });

  if (!group?.mentor_id) {
    const assignedMentorId = await ensureMentorAssignedForUser(userObjectId);

    if (!assignedMentorId) {
      throw new Error(
        "Người dùng chưa được gán mentor và không tìm thấy CTV phù hợp."
      );
    }

    group = await GroupUser.findOne({ students: userObjectId });
  }

  if (!group?.mentor_id) {
    throw new Error(
      "Người dùng chưa được gán mentor và không tìm thấy CTV phù hợp."
    );
  }

  await GroupUser.updateOne(
    { students: userObjectId },
    { $set: { learningPath_id: learningPathObjectId } }
  );

  const hasCurrentScore = Number.isFinite(input.current_score);
  const hasTargetScore = Number.isFinite(input.target_score);

  await UserProgress.findOneAndUpdate(
    {
      user_id: userObjectId,
      learningPath_id: learningPathObjectId,
    },
    {
      $set: {
        mentor_id: group.mentor_id,
        updated_at: new Date(),
        ...(hasCurrentScore ? { current_score: input.current_score } : {}),
        ...(hasTargetScore ? { target_score: input.target_score } : {}),
      },
      $setOnInsert: {
        user_id: userObjectId,
        learningPath_id: learningPathObjectId,
        completed_lessons: 0,
        total_lessons: 0,
        completion_rate: 0,
        total_study_time: 0,
        streak_days: 0,
        longest_streak: 0,
        status: "active",
        ...(!hasCurrentScore ? { current_score: 0 } : {}),
        ...(!hasTargetScore ? { target_score: 0 } : {}),
      },
    },
    { upsert: true, new: true }
  );

  return { mentor_id: group.mentor_id };
};

const clampAbility = (value: number): number => Math.min(1, Math.max(0, value));

const loadLearningPathForScheduler = async (input: {
  learning_path_id: string;
  user_id: string;
}): Promise<ILearningPath> => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath để tạo cycle Skill ROI.");
  }

  return learningPath;
};
const countCycleActivities = (dayStudies?: IDayStudy[]) => {
  const days = dayStudies ?? [];

  return {
    generated_day_count: days.length,
    generated_session_count: days.reduce(
      (sum, day) => sum + (day.sessions?.length ?? 0),
      0
    ),
    generated_activity_count: days.reduce(
      (sum, day) =>
        sum +
        (day.sessions ?? []).reduce(
          (sessionSum, session) => sessionSum + (session.items?.length ?? 0),
          0
        ),
      0
    ),
  };
};

const mapUserSkillPartsToSchedulerSnapshot = (userSkill: IUserSkill) =>
  (userSkill.parts ?? []).map((part) => ({
    part_type: part.part_type,
    ability: part.ability,
    status: part.status,
    trend: part.trend,
  }));

const mapUserSkillSkillsToSchedulerSnapshot = (userSkill: IUserSkill) =>
  (userSkill.parts ?? []).flatMap((part) =>
    (part.skills ?? []).map((skill) => ({
      part_type: part.part_type,
      skill_key: skill.skill_key,
      ability: skill.ability,
      status: skill.status,
      trend: skill.trend,
    }))
  );

const sumDayStudyPlannedMinutes = (dayStudies?: IDayStudy[]): number => {
  return (dayStudies ?? []).reduce((daySum, day) => {
    const sessions = day.sessions ?? [];

    return (
      daySum +
      sessions.reduce((sessionSum, session) => {
        if (typeof session.planned_minutes === "number") {
          return sessionSum + session.planned_minutes;
        }

        return (
          sessionSum +
          (session.items ?? []).reduce(
            (itemSum, item) => itemSum + (item.estimated_minutes ?? 0),
            0
          )
        );
      }, 0)
    );
  }, 0);
};

const createInitialCycle = async (input: {
  originalInput: LearningPathV2AbilityPipelineInput;
  learningPath: ILearningPath;
  userTest: IUserTest;
  userSkill: IUserSkill;
  normalizedResult: NormalizedTestResultV2;
}): Promise<Layer4PipelineResult> => {
  /*
   * Entry test đi thẳng vào Skill ROI scheduler.
   * Scheduler tự chọn skill/package ROI cao nhất và tạo cycle đầu tiên,
   * không còn bước sinh nhiều strategy option để user chọn thủ công.
   */
  const cycleResult = await createSkillFocusedCycle({
    user_id: input.originalInput.user_id,
    learning_path_id: input.originalInput.learning_path_id,
    trigger_type: "initial_generation",
    scenario: "ONBOARDING",
    source_user_test_id: input.userTest._id,
    current_score: input.userTest.score,
    now: input.normalizedResult.submitted_at ?? input.userTest.submit_at ?? new Date(),
  });

  return {
    strategy_options: [],
    selected_strategy_option: null,
    cycle_result: cycleResult,
  };
};

const createFullTestOptionAndCycle = async (input: {
  originalInput: LearningPathV2AbilityPipelineInput;
  learningPath: ILearningPath;
  userTest: IUserTest;
  userSkill: IUserSkill;
  scenarioDecision: LearningScenarioDecisionV2;
  normalizedResult: NormalizedTestResultV2;
}): Promise<Layer4PipelineResult> => {
  /*
   * Full test tạo lại baseline roadmap bằng mô phỏng ROI dài hạn.
   * StrategyOption hiện chỉ đóng vai trò snapshot roadmap/audit cho canvas,
   * không phải một lựa chọn chiến lược mà user cần xác nhận.
   * Package ROI đã chọn được dùng ngay để tạo cycle kế tiếp.
   */
  const cycleResult = await createSkillFocusedCycle({
    user_id: input.originalInput.user_id,
    learning_path_id: input.originalInput.learning_path_id,
    trigger_type: "full_test_review",
    scenario: input.scenarioDecision.scenario,
    source_user_test_id: input.userTest._id,
    source_week_study_id: input.originalInput.week_study_id ?? null,
    current_score: input.userTest.score,
    now: input.normalizedResult.submitted_at ?? input.userTest.submit_at ?? new Date(),
  });

  return {
    strategy_options: cycleResult.strategy_option
      ? [cycleResult.strategy_option]
      : [],
    selected_strategy_option: cycleResult.strategy_option,
    cycle_result: cycleResult,
  };
};

const handleMiniTestCompletionCycle = async (input: {
  originalInput: LearningPathV2AbilityPipelineInput;
  learningPath: ILearningPath;
  userTest: IUserTest;
  userSkill: IUserSkill;
  scenarioDecision: LearningScenarioDecisionV2;
}): Promise<Layer4PipelineResult> => {
  /*
   * Sau mini test, UserSkill đã được cập nhật trước khi hàm này chạy.
   * Mini test chỉ tạo cycle thích nghi ngắn hạn và ghi SchedulerDecisionLog;
   * baseline roadmap snapshot chỉ được làm mới ở Entry/Full test.
   */
  const cycleResult = await createSkillFocusedCycle({
    user_id: input.originalInput.user_id,
    learning_path_id: input.originalInput.learning_path_id,
    trigger_type: "mini_test_completion",
    scenario: input.scenarioDecision.scenario,
    source_user_test_id: input.userTest._id,
    source_week_study_id: input.originalInput.week_study_id ?? null,
    current_score: input.userTest.score,
    now: input.userTest.submit_at ?? new Date(),
  });

  return {
    strategy_options: [],
    selected_strategy_option: null,
    cycle_result: cycleResult,
  };
};

const summarizeNormalizedResultForLog = (result: NormalizedTestResultV2) => {
  const answers = Array.isArray(result.answers) ? result.answers : [];
  const partResults = Array.isArray(result.part_results)
    ? result.part_results
    : [];

  return {
    test_id: result.test_id,
    test_result_id: result.test_result_id,
    test_type: result.test_type,
    source: result.source,
    submitted_at: result.submitted_at,
    elapsed_seconds: result.elapsed_seconds,
    raw_score: result.raw_score,
    accuracy: result.accuracy,
    answers_count: answers.length,
    part_results_count: partResults.length,
    sample_answers: answers.slice(0, 3).map((answer) => ({
      question_id: answer.question_id,
      part_type: answer.part_type,
      is_correct: answer.is_correct,
      irt_difficulty: answer.irt_difficulty,
      skill_keys: answer.skill_keys?.slice(0, 5) ?? [],
    })),
    metadata_summary: {
      missing_question_metadata_count:
        result.metadata?.missing_question_metadata_count,
      missing_irt_difficulty_count: result.metadata?.missing_irt_difficulty_count,
      skill_enrichment_warnings: result.metadata?.skill_enrichment_warnings,
    },
  };
};

const summarizeAbilityProfileForLog = (profile: AbilityProfileV2) => {
  const partAbilities = Array.isArray(profile.part_abilities)
    ? profile.part_abilities
    : [];
  const skillAbilities = Array.isArray(profile.skill_abilities)
    ? profile.skill_abilities
    : [];

  return {
    source_test_result_id: profile.source_test_result_id,
    part_abilities_count: partAbilities.length,
    skill_abilities_count: skillAbilities.length,
    part_abilities: partAbilities.map((part) => ({
      part_type: part.part_type,
      ability: part.ability,
      status: part.status,
      item_count: part.item_count,
      correct_count: part.correct_count,
    })),
    weak_skill_keys_sample: skillAbilities
      .filter((skill) => skill.status === "weak")
      .slice(0, 10)
      .map((skill) => skill.skill_key),
    warnings: profile.warnings,
  };
};

const summarizeLayer4ResultForLog = (result?: Layer4PipelineResult) => {
  const cycleResult = result?.cycle_result;
  const cycleCreated = cycleResult?.status === "cycle_created";
  const plan = cycleCreated ? cycleResult.plan : undefined;
  const dayStudies = cycleCreated && Array.isArray(cycleResult.day_studies)
    ? cycleResult.day_studies
    : [];

  return {
    strategy_options_count: result?.strategy_options?.length ?? 0,
    selected_strategy_option_id: result?.selected_strategy_option?._id,
    selected_strategy: result?.selected_strategy_option?.strategy,
    selected_status: result?.selected_strategy_option?.status,
    cycle_status: cycleResult?.status,
    week_study_id: cycleCreated ? cycleResult.week_study?._id : null,
    day_studies_count: dayStudies.length,
    assessment_type: plan?.assessment?.type,
    selected_roadmap_positions: plan?.selected_roadmap_positions,
  };
};

/**
 * Pipeline chạy Layer 1/2/3 rồi nối sang Skill ROI scheduler.
 *
 * - initial_generation: dùng entry test, cập nhật ability và tạo cycle đầu tiên.
 * - mini_test_completion: dùng mini test cuối cycle, cập nhật local ability
 *   và tạo cycle kế tiếp ngay bằng ROI.
 * - full_test_review: dùng full test định kỳ, đo lại toàn bộ ability,
 *   mô phỏng roadmap ROI dài hạn và tạo cycle kế tiếp.
 *
 * Scheduler tự chọn package Skill ROI; user không còn chọn strategy thủ công.
 * layer4_result được giữ để tương thích contract cũ của FE/API.
 */
export const runLearningPathV2AbilityPipeline = async (
  input: LearningPathV2AbilityPipelineInput
): Promise<LearningPathV2AbilityPipelineOutput> => {
  const rawResult = input.raw_result;
  const userTest = input.source_user_test;

  logLearningPathV2DebugSafe("pipeline.start", {
    stage: "pipeline",
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    trigger_type: input.trigger_type,
    source_user_test_id: userTest._id,
    source_test_id: userTest.test_id,
    source_submit_at: userTest.submit_at,
    raw_answers_count: Array.isArray(rawResult.answers)
      ? rawResult.answers.length
      : 0,
    raw_parts_count: Array.isArray(rawResult.parts) ? rawResult.parts.length : 0,
  });

  try {

    // Layer 1 chuẩn hóa test result thô thành dữ liệu answer-level để các layer sau dùng chung.
    const normalizedResult = await normalizeTestResult({
      trigger_type: input.trigger_type,
      user_id: input.user_id,
      test_id: typeof rawResult.test_id === "string" ? rawResult.test_id : undefined,
      raw_result: rawResult,
    });

    logLearningPathV2DebugSafe("pipeline.normalized_result", {
      stage: "layer1",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      ...summarizeNormalizedResultForLog(normalizedResult),
    });

    // Lấy UserSkill snapshot cũ trước khi update để Layer 3 so sánh old/new focus skills.
    const oldUserSkill = await getUserSkillSnapshot({
      user_id: input.user_id,
      context_type: "learning_path",
      learning_path_id: input.learning_path_id,
    });

    // Layer 2 tính ability từ question-level answers, không dùng part_results làm ability.
    const abilityProfile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    logLearningPathV2DebugSafe("pipeline.ability_profile", {
      stage: "layer2",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      ...summarizeAbilityProfileForLog(abilityProfile),
    });

    // UserSkillHistory lưu ability signal theo từng lần submit để phục vụ trend và audit.
    const userSkillHistory = await createUserSkillHistory({
      user_id: input.user_id,
      context_type: "learning_path",
      learning_path_id: input.learning_path_id,
      source_user_test_id: String(userTest._id),
      source_test_id: normalizedResult.test_id,
      trigger_type: normalizedResult.trigger_type,
      ability_profile: abilityProfile,
      submitted_at: normalizedResult.submitted_at,
    });

    // UserSkill là snapshot đã merge bằng EWMA + trend slope từ history mới nhất.
    const userSkill = await updateUserSkillFromHistory(userSkillHistory);

    const latestUserSkillPartAbilities =
      mapUserSkillPartsToSchedulerSnapshot(userSkill);

    emitLearningPathAssessmentEvent({
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      event: "learning_path_assessment_abilities",
      payload: {
        source_user_test_id: String(userTest._id),
        ability_profile: abilityProfile,
        submitted_part_abilities: abilityProfile.part_abilities,
        user_skill_parts: latestUserSkillPartAbilities,
        part_abilities: latestUserSkillPartAbilities,
      },
    });

    // Layer 3 quyết scenario dựa trên trigger, deadline, pace và focus skill delta.
    let scenarioDecision = await evaluateLearningPathScenario({
      trigger_type: normalizedResult.trigger_type,
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      learning_path_created_at: input.learning_path_created_at,
      target_completion_date: input.target_completion_date,
      old_user_skill: oldUserSkill,
      new_user_skill: userSkill,
      week_study_id: input.week_study_id,
      source_user_test_id: String(userTest._id),
      actual_submit_at: userTest.submit_at,
    });

    if (
      input.trigger_type === "mini_test_completion" &&
      input.debug_scenario_override === "PLATEAU"
    ) {
      scenarioDecision = {
        ...scenarioDecision,
        scenario: "PLATEAU",
      };
    }

    logLearningPathV2DebugSafe("pipeline.scenario_decision", {
      stage: "layer3",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      scenario: scenarioDecision.scenario,
      pre_deadline: scenarioDecision.pre_deadline,
      pace_status: scenarioDecision.pace_status,
      delay_days: scenarioDecision.delay_days,
      focus_delta: scenarioDecision.focus_delta,
      comparable_focus_skill_count:
        scenarioDecision.comparable_focus_skill_count,
      newly_measured_focus_skill_count:
        scenarioDecision.newly_measured_focus_skill_count,
      primary_focus_skill_key: scenarioDecision.primary_focus_skill_key,
      focus_part_type: scenarioDecision.focus_part_type,
    });

    const learningPath = await loadLearningPathForScheduler({
      learning_path_id: input.learning_path_id,
      user_id: input.user_id,
    });

    let layer4Result: Layer4PipelineResult | undefined;

    switch (normalizedResult.trigger_type) {
      case "initial_generation":
        layer4Result = await createInitialCycle({
          originalInput: input,
          learningPath,
          userTest,
          userSkill,
          normalizedResult,
        });
        break;

      case "full_test_review":
        layer4Result = await createFullTestOptionAndCycle({
          originalInput: input,
          learningPath,
          userTest,
          userSkill,
          scenarioDecision,
          normalizedResult,
        });
        break;

      case "mini_test_completion":
        layer4Result = await handleMiniTestCompletionCycle({
          originalInput: input,
          learningPath,
          userTest,
          userSkill,
          scenarioDecision,
        });
        break;

      default:
        layer4Result = undefined;
    }

    logLearningPathV2DebugSafe("pipeline.layer4_result", {
      stage: "layer4",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      ...summarizeLayer4ResultForLog(layer4Result),
    });

    emitLearningPathAssessmentEvent({
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      event: "learning_path_assessment_completed",
      payload: {
        source_user_test_id: String(userTest._id),
        requires_strategy_selection: false,
        layer4_result: summarizeLayer4ResultForLog(layer4Result),
        strategy_options:
          layer4Result?.strategy_options?.map((option) => ({
            option_id: String(option._id),
            strategy: option.strategy,
            status: option.status,
            trigger_type: option.trigger_type,
          })) ?? [],
      },
    });

    return {
      normalized_result: normalizedResult,
      user_test: userTest,
      ability_profile: abilityProfile,
      user_skill_history: userSkillHistory,
      user_skill: userSkill,
      scenario_decision: scenarioDecision,
      layer4_result: layer4Result,
    };
  } catch (error) {
    logLearningPathV2DebugSafe("pipeline.error", {
      stage: "pipeline",
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      source_user_test_id: userTest._id,
      error,
    });
    emitLearningPathAssessmentEvent({
      user_id: input.user_id,
      learning_path_id: input.learning_path_id,
      trigger_type: input.trigger_type,
      event: "learning_path_assessment_error",
      payload: {
        source_user_test_id: String(userTest._id),
        message: error instanceof Error ? error.message : "Pipeline failed",
      },
    });
    throw error;
  }
};


type LearningPathV2ReadInput = {
  user_id: string;
  learning_path_id: string;
};

export class LearningPathV2MockLearningError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "LearningPathV2MockLearningError";
    this.statusCode = statusCode;
  }
}

type CurrentCycleResponse = {
  week_study: IWeekStudy;
  day_studies: LearningPathV2DayStudyView[];
};

type CurrentLearningPathCycleV2Result = {
  learning_path: ILearningPath;
  selected_strategy_option: ILearningPathStrategyOption | null;
  current_cycle: CurrentCycleResponse | null;
};

type LearningPathV2OverviewWeek = Record<string, unknown> & {
  days: LearningPathV2DayStudyView[];
};

type LearningPathV2DayStudyView = Record<string, unknown> & {
  stage_no: number;
  display_title: string;
  display_subtitle: string;
  activity_summary: string;
};

type LearningPathV2ScoreSummary = {
  current_total: number | null;
  current_listening: number | null;
  current_reading: number | null;
  anchor_total: number | null;
  anchor_listening: number | null;
  anchor_reading: number | null;
  anchor_projection_total: number | null;
  current_projection_total: number | null;
  listening_ability: number | null;
  reading_ability: number | null;
  last_evaluated_at: Date | null;
  anchor_trigger_type: "initial_generation" | "full_test_review" | null;
  source: "calibrated_user_skill_projection" | "not_available";
};

type LearningPathV2OverviewResult = CurrentLearningPathCycleV2Result & {
  pending_strategy_options: ILearningPathStrategyOption[];
  week_studies: LearningPathV2OverviewWeek[];
  score_summary: LearningPathV2ScoreSummary;
  roadmap_canvas: {
    requires_strategy_selection: boolean;
    strategy_selection_reason: "full_test_review_pending" | null;
    current_cycle: {
      week_study_id: string;
      cycle_no: number;
      status: WeekStudyStatus;
      primary_focus_skill_key: string;
      covered_skill_keys: string[];
      focus_part_type: number;
      cycle_mode: IWeekStudy["cycle_mode"];
      expected_skill_gain: number;
      expected_roi_per_hour: number;
      assessment_type: "mini_test" | "full_test" | null;
    } | null;
    current_learning: RoadmapCanvasCurrentLearning | null;
    checkpoints: RoadmapCanvasCheckpoint[];
    units: RoadmapCanvasUnitStatusItem[];
    part_roadmaps: RoadmapCanvasPartRoadmap[];
  }
};

const loadActiveLearningPath = async (
  input: LearningPathV2ReadInput
): Promise<ILearningPath> => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath.");
  }

  return learningPath;
};

const findCurrentWeekStudy = async (
  learningPath: ILearningPath
): Promise<IWeekStudy | null> => {
  const weekStudyIds = learningPath.week_study_ids ?? [];

  if (weekStudyIds.length === 0) {
    return null;
  }

  const currentWeekStudy = await WeekStudy.findOne({
    _id: { $in: weekStudyIds },
    status: WeekStudyStatus.IN_PROGRESS,
  }).sort({ no: -1 });

  if (currentWeekStudy) {
    return currentWeekStudy;
  }

  return WeekStudy.findOne({
    _id: { $in: weekStudyIds },
  }).sort({ no: -1 });
};

const loadDayStudiesForWeek = (weekStudy: IWeekStudy): Promise<IDayStudy[]> =>
  DayStudy.find({ week_id: weekStudy._id }).sort({ dayOfWeek: 1 });

const sessionKindLabel: Partial<Record<SessionType, string>> = {
  [SessionType.LESSON]: "Bài học",
  [SessionType.FLASH_CARD]: "Từ vựng",
  [SessionType.QUIZ]: "Quiz",
  [SessionType.DICTATION]: "Dictation",
  [SessionType.SHADOWING]: "Shadowing",
  [SessionType.MINI_TEST]: "Mini Test",
  [SessionType.FULL_TEST]: "Full Test",
};

const buildDayStudyDisplayView = (
  dayStudy: IDayStudy,
  index: number
): LearningPathV2DayStudyView => {
  const stageNo = index + 1;
  const raw =
    typeof (dayStudy as any).toObject === "function"
      ? (dayStudy as any).toObject()
      : dayStudy;
  const sessions = dayStudy.sessions ?? [];
  const allItems = sessions.flatMap((session) => session.items ?? []);
  const itemKinds = new Set(allItems.map((item) => item.kind));
  const assessmentKind = itemKinds.has(SessionType.FULL_TEST)
    ? SessionType.FULL_TEST
    : itemKinds.has(SessionType.MINI_TEST)
      ? SessionType.MINI_TEST
      : null;
  const partTypes = Array.from(
    new Set(
      sessions
        .map((session) => session.part_type)
        .filter((partType): partType is number => typeof partType === "number")
    )
  ).sort((a, b) => a - b);
  const partLabel =
    partTypes.length > 0 ? `Part ${partTypes.join(", ")}` : "Luyện tập";
  const primarySession = sessions.find((session) => session.lesson_manager_title);
  const activitySummary = Array.from(itemKinds)
    .map((kind) => sessionKindLabel[kind] ?? kind)
    .join(" · ");

  if (assessmentKind) {
    const assessmentLabel =
      assessmentKind === SessionType.FULL_TEST ? "Full Test" : "Mini Test";
    return {
      ...raw,
      stage_no: stageNo,
      display_title: `${assessmentLabel} cuối cycle`,
      display_subtitle: `Stage ${stageNo} · Đánh giá năng lực`,
      activity_summary: activitySummary || assessmentLabel,
    };
  }

  return {
    ...raw,
    stage_no: stageNo,
    display_title:
      primarySession?.lesson_manager_title?.trim() ||
      `Stage ${stageNo} · ${partLabel}`,
    display_subtitle: `Stage ${stageNo} · ${partLabel}`,
    activity_summary: activitySummary || "Hoạt động học",
  };
};

const buildDayStudyDisplayViews = (
  dayStudies: IDayStudy[]
): LearningPathV2DayStudyView[] =>
  dayStudies.map((dayStudy, index) => buildDayStudyDisplayView(dayStudy, index));

const emptyLearningPathV2ScoreSummary = (): LearningPathV2ScoreSummary => ({
  current_total: null,
  current_listening: null,
  current_reading: null,
  anchor_total: null,
  anchor_listening: null,
  anchor_reading: null,
  anchor_projection_total: null,
  current_projection_total: null,
  listening_ability: null,
  reading_ability: null,
  last_evaluated_at: null,
  anchor_trigger_type: null,
  source: "not_available",
});

const roundScoreValue = (value: number): number => Math.round(value);

const clampScoreValue = (value: number, max: number): number =>
  Math.min(max, Math.max(0, roundScoreValue(value)));

const buildPartAbilityMap = (
  parts: Array<{ part_type: number; ability: number }>
): Record<number, number> =>
  parts.reduce<Record<number, number>>((acc, part) => {
    acc[part.part_type] = part.ability;
    return acc;
  }, {});

const calculateAnchorSectionScoreFromHistory = (
  parts: Array<{ part_type: number; correct_count?: number }>,
  section: "listening" | "reading"
): number | null => {
  const sectionParts = parts.filter((part) =>
    section === "listening"
      ? part.part_type >= 1 && part.part_type <= 4
      : part.part_type >= 5 && part.part_type <= 7
  );

  if (sectionParts.length === 0) {
    return null;
  }

  return sectionParts.reduce(
    (total, part) => total + (Number(part.correct_count ?? 0) * 5),
    0
  );
};

const buildLearningPathV2ScoreSummary = async (
  input: LearningPathV2ReadInput
): Promise<LearningPathV2ScoreSummary> => {
  const baseQuery = {
    user_id: input.user_id,
    context_type: "learning_path" as const,
    learning_path_id: input.learning_path_id,
  };

  const [userSkill, fullTestAnchor, entryAnchor] = await Promise.all([
    UserSkill.findOne(baseQuery).lean<IUserSkill | null>(),
    UserSkillHistory.findOne({
      ...baseQuery,
      trigger_type: "full_test_review",
      source_user_test_id: { $ne: null },
    })
      .sort({ submitted_at: -1, created_at: -1 })
      .lean<IUserSkillHistory | null>(),
    UserSkillHistory.findOne({
      ...baseQuery,
      trigger_type: "initial_generation",
      source_user_test_id: { $ne: null },
    })
      .sort({ submitted_at: -1, created_at: -1 })
      .lean<IUserSkillHistory | null>(),
  ]);

  if (!userSkill || (userSkill.parts ?? []).length === 0) {
    return emptyLearningPathV2ScoreSummary();
  }

  const anchorHistory = fullTestAnchor ?? entryAnchor;

  if (
    !anchorHistory ||
    !anchorHistory.source_user_test_id ||
    (anchorHistory.parts ?? []).length === 0
  ) {
    return emptyLearningPathV2ScoreSummary();
  }

  const anchorTest = await UserTest.findById(anchorHistory.source_user_test_id)
    .select("score submit_at")
    .lean<IUserTest | null>();

  if (!anchorTest || !Number.isFinite(anchorTest.score)) {
    return emptyLearningPathV2ScoreSummary();
  }

  const currentProjection = calculateProjectedToeicScore(
    buildPartAbilityMap(userSkill.parts ?? [])
  );
  const anchorProjection = calculateProjectedToeicScore(
    buildPartAbilityMap(anchorHistory.parts ?? [])
  );
  const anchorTotal = Number(anchorTest.score);
  const anchorListening =
    calculateAnchorSectionScoreFromHistory(anchorHistory.parts ?? [], "listening");
  const anchorReading =
    calculateAnchorSectionScoreFromHistory(anchorHistory.parts ?? [], "reading");
  const currentTotal = clampScoreValue(
    anchorTotal +
    (currentProjection.projected_total_score -
      anchorProjection.projected_total_score),
    990
  );

  return {
    current_total: currentTotal,
    current_listening:
      anchorListening === null
        ? null
        : clampScoreValue(
          anchorListening +
          (currentProjection.projected_listening_score -
            anchorProjection.projected_listening_score),
          495
        ),
    current_reading:
      anchorReading === null
        ? null
        : clampScoreValue(
          anchorReading +
          (currentProjection.projected_reading_score -
            anchorProjection.projected_reading_score),
          495
        ),
    anchor_total: anchorTotal,
    anchor_listening: anchorListening,
    anchor_reading: anchorReading,
    anchor_projection_total: anchorProjection.projected_total_score,
    current_projection_total: currentProjection.projected_total_score,
    listening_ability: currentProjection.listening_ability,
    reading_ability: currentProjection.reading_ability,
    last_evaluated_at: userSkill.last_evaluated_at ?? null,
    anchor_trigger_type: anchorHistory.trigger_type as
      | "initial_generation"
      | "full_test_review",
    source: "calibrated_user_skill_projection",
  };
};

type MockLearningAssessmentLocator = {
  dayIndex: number;
  sessionIndex: number;
  itemIndex: number;
  kind: SessionType.MINI_TEST | SessionType.FULL_TEST;
  assessmentTestId: string | null;
};

export type MockLearningPathV2Result = {
  learning_path_id: string;
  week_study_id: string;
  assessment_day_study_id: string;
  assessment_type: "mini_test" | "full_test";
  assessment_test_id: string | null;
  completed_day_count: number;
  completed_session_count: number;
  completed_item_count: number;
};

const findLastAssessmentItem = (
  dayStudies: IDayStudy[]
): MockLearningAssessmentLocator | null => {
  const assessmentKinds = new Set<SessionType>([
    SessionType.MINI_TEST,
    SessionType.FULL_TEST,
  ]);

  for (let dayIndex = dayStudies.length - 1; dayIndex >= 0; dayIndex -= 1) {
    const sessions = dayStudies[dayIndex].sessions ?? [];

    for (
      let sessionIndex = sessions.length - 1;
      sessionIndex >= 0;
      sessionIndex -= 1
    ) {
      const items = sessions[sessionIndex].items ?? [];

      for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
        const item = items[itemIndex];

        if (!assessmentKinds.has(item.kind)) {
          continue;
        }

        return {
          dayIndex,
          sessionIndex,
          itemIndex,
          kind: item.kind as SessionType.MINI_TEST | SessionType.FULL_TEST,
          assessmentTestId: item.activity_id ? String(item.activity_id) : null,
        };
      }
    }
  }

  return null;
};

const isBeforeAssessment = (
  dayIndex: number,
  sessionIndex: number,
  itemIndex: number,
  locator: MockLearningAssessmentLocator
) =>
  dayIndex < locator.dayIndex ||
  (dayIndex === locator.dayIndex && sessionIndex < locator.sessionIndex) ||
  (dayIndex === locator.dayIndex &&
    sessionIndex === locator.sessionIndex &&
    itemIndex < locator.itemIndex);

const isAfterAssessment = (
  dayIndex: number,
  sessionIndex: number,
  itemIndex: number,
  locator: MockLearningAssessmentLocator
) =>
  dayIndex > locator.dayIndex ||
  (dayIndex === locator.dayIndex && sessionIndex > locator.sessionIndex) ||
  (dayIndex === locator.dayIndex &&
    sessionIndex === locator.sessionIndex &&
    itemIndex > locator.itemIndex);

export const mockCompleteLearningPathV2CurrentWeek = async (
  input: LearningPathV2ReadInput
): Promise<MockLearningPathV2Result> => {
  const learningPath = await loadActiveLearningPath(input);
  const weekStudyIds = learningPath.week_study_ids ?? [];

  if (weekStudyIds.length === 0) {
    throw new LearningPathV2MockLearningError(
      "Chưa có cycle đang học để mock."
    );
  }

  const weekStudy = await WeekStudy.findOne({
    _id: { $in: weekStudyIds },
    status: WeekStudyStatus.IN_PROGRESS,
  }).sort({ no: -1 });

  if (!weekStudy) {
    throw new LearningPathV2MockLearningError(
      "Chưa có cycle đang học để mock."
    );
  }

  const dayStudies = await loadDayStudiesForWeek(weekStudy);

  if (dayStudies.length === 0) {
    throw new LearningPathV2MockLearningError(
      "Cycle hiện tại chưa có DayStudy để mock."
    );
  }

  const assessmentLocator = findLastAssessmentItem(dayStudies);

  if (!assessmentLocator) {
    throw new LearningPathV2MockLearningError(
      "Không tìm thấy bài Mini Test hoặc Full Test cuối tuần để mock."
    );
  }

  const assessmentDay = dayStudies[assessmentLocator.dayIndex];
  const assessmentSession =
    assessmentDay.sessions[assessmentLocator.sessionIndex];
  const assessmentItem = assessmentSession.items[assessmentLocator.itemIndex];

  if (assessmentItem.status === WeekStudyStatus.COMPLETED) {
    throw new LearningPathV2MockLearningError(
      "Tuần học này đã hoàn tất bài kiểm tra cuối.",
      409
    );
  }

  let completedDayCount = 0;
  let completedSessionCount = 0;
  let completedItemCount = 0;
  const changedDayStudies = new Set<IDayStudy>();

  dayStudies.forEach((dayStudy, dayIndex) => {
    if (dayIndex < assessmentLocator.dayIndex) {
      if (dayStudy.status !== WeekStudyStatus.COMPLETED) {
        completedDayCount += 1;
      }
      dayStudy.status = WeekStudyStatus.COMPLETED;
    } else if (dayIndex === assessmentLocator.dayIndex) {
      dayStudy.status = WeekStudyStatus.IN_PROGRESS;
    } else {
      dayStudy.status = WeekStudyStatus.LOCK;
    }

    dayStudy.sessions.forEach((session, sessionIndex) => {
      if (
        dayIndex < assessmentLocator.dayIndex ||
        (dayIndex === assessmentLocator.dayIndex &&
          sessionIndex < assessmentLocator.sessionIndex)
      ) {
        if (session.status !== WeekStudyStatus.COMPLETED) {
          completedSessionCount += 1;
        }
        session.status = WeekStudyStatus.COMPLETED;
      } else if (
        dayIndex === assessmentLocator.dayIndex &&
        sessionIndex === assessmentLocator.sessionIndex
      ) {
        session.status = WeekStudyStatus.IN_PROGRESS;
      } else {
        session.status = WeekStudyStatus.LOCK;
      }

      session.items.forEach((item, itemIndex) => {
        if (
          isBeforeAssessment(
            dayIndex,
            sessionIndex,
            itemIndex,
            assessmentLocator
          )
        ) {
          if (item.status !== WeekStudyStatus.COMPLETED) {
            completedItemCount += 1;
          }
          item.status = WeekStudyStatus.COMPLETED;
        } else if (
          dayIndex === assessmentLocator.dayIndex &&
          sessionIndex === assessmentLocator.sessionIndex &&
          itemIndex === assessmentLocator.itemIndex
        ) {
          item.status = WeekStudyStatus.IN_PROGRESS;
        } else if (
          isAfterAssessment(dayIndex, sessionIndex, itemIndex, assessmentLocator)
        ) {
          item.status = WeekStudyStatus.LOCK;
        }
      });
    });

    dayStudy.markModified("sessions");
    changedDayStudies.add(dayStudy);
  });

  await Promise.all([...changedDayStudies].map((dayStudy) => dayStudy.save()));

  try {
    await updateUserProgress(
      new Types.ObjectId(input.user_id),
      new Types.ObjectId(input.learning_path_id)
    );
  } catch (error) {
    console.error("Lỗi khi cập nhật UserProgress sau mock learning:", error);
  }

  return {
    learning_path_id: input.learning_path_id,
    week_study_id: String(weekStudy._id),
    assessment_day_study_id: String(assessmentDay._id),
    assessment_type:
      assessmentLocator.kind === SessionType.MINI_TEST
        ? "mini_test"
        : "full_test",
    assessment_test_id: assessmentLocator.assessmentTestId,
    completed_day_count: completedDayCount,
    completed_session_count: completedSessionCount,
    completed_item_count: completedItemCount,
  };
};

const loadSelectedStrategyOptionForWeek = async (input: {
  user_id: string;
  learning_path_id: string;
  week_study: IWeekStudy | null;
}): Promise<ILearningPathStrategyOption | null> => {
  if (!input.week_study?.learning_path_strategy_option_id) {
    return null;
  }

  return LearningPathStrategyOption.findOne({
    _id: input.week_study.learning_path_strategy_option_id,
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });
};

export const getCurrentLearningPathCycleV2 = async (
  input: LearningPathV2ReadInput
): Promise<CurrentLearningPathCycleV2Result> => {
  const learningPath = await loadActiveLearningPath(input);
  const weekStudy = await findCurrentWeekStudy(learningPath);
  const dayStudies = weekStudy ? await loadDayStudiesForWeek(weekStudy) : [];
  const selectedStrategyOption = await loadSelectedStrategyOptionForWeek({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    week_study: weekStudy,
  });

  return {
    learning_path: learningPath,
    selected_strategy_option: selectedStrategyOption,
    current_cycle: weekStudy
      ? {
        week_study: weekStudy,
        day_studies: buildDayStudyDisplayViews(dayStudies),
      }
      : null,
  };
};

export const getLearningPathV2Overview = async (
  input: LearningPathV2ReadInput
): Promise<LearningPathV2OverviewResult> => {
  const learningPath = await loadActiveLearningPath(input);
  const weekStudyIds = learningPath.week_study_ids ?? [];

  /*
   * LearningPathStrategyOption hiện không còn là lựa chọn thủ công của user.
   * Nó được giữ như snapshot roadmap ROI dài hạn để vẽ canvas và truy vết
   * các cycle được tạo sau Entry/Full test.
   */
  const [selectedOption, pendingOptions, scoreSummary] = await Promise.all([
    LearningPathStrategyOption.findOne({
      learning_path_id: input.learning_path_id,
      user_id: input.user_id,
      status: "selected",
    }).sort({ created_at: -1 }),
    LearningPathStrategyOption.find({
      learning_path_id: input.learning_path_id,
      user_id: input.user_id,
      status: "pending_selection",
    }).sort({ created_at: -1 }),
    buildLearningPathV2ScoreSummary(input),
  ]);
  const requiresStrategySelection = pendingOptions.length > 0;

  const weekStudies =
    weekStudyIds.length > 0
      ? await WeekStudy.find({ _id: { $in: weekStudyIds } }).sort({ no: 1 })
      : [];

  const currentWeekStudy =
    [...weekStudies]
      .reverse()
      .find((week) => week.status === WeekStudyStatus.IN_PROGRESS) ??
    weekStudies[weekStudies.length - 1] ??
    null;

  const dayStudies = currentWeekStudy
    ? await loadDayStudiesForWeek(currentWeekStudy)
    : [];
  const allDayStudiesRaw =
    weekStudies.length > 0
      ? await DayStudy.find({
        week_id: { $in: weekStudies.map((week) => week._id) },
      }).sort({ dayOfWeek: 1 })
      : [];
  const weekOrderById = new Map(
    weekStudies.map((week, index) => [String(week._id), index])
  );
  const allDayStudies = [...allDayStudiesRaw].sort((a, b) => {
    const weekOrderA = weekOrderById.get(String(a.week_id)) ?? 0;
    const weekOrderB = weekOrderById.get(String(b.week_id)) ?? 0;

    if (weekOrderA !== weekOrderB) {
      return weekOrderA - weekOrderB;
    }

    return (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0);
  });
  const dayStudiesByWeekId = new Map<string, IDayStudy[]>();

  for (const dayStudy of allDayStudies) {
    const weekId = String(dayStudy.week_id);
    const weekDays = dayStudiesByWeekId.get(weekId) ?? [];
    weekDays.push(dayStudy);
    dayStudiesByWeekId.set(weekId, weekDays);
  }

  const overviewWeekStudies: LearningPathV2OverviewWeek[] = weekStudies.map(
    (week) => ({
      ...week.toObject(),
      days: buildDayStudyDisplayViews(
        dayStudiesByWeekId.get(String(week._id)) ?? []
      ),
    })
  );
  const roadmapStrategyOptions = await loadRoadmapCanvasStrategyOptions({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    weekStudies,
    selectedOption,
  });
  const roadmapCheckpoints = await buildRoadmapCanvasCheckpoints({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    selectedOption,
    weekStudies,
    allDayStudies,
  });

  return {
    learning_path: learningPath,
    selected_strategy_option: selectedOption,
    pending_strategy_options: pendingOptions,
    week_studies: overviewWeekStudies,
    score_summary: scoreSummary,
    current_cycle: currentWeekStudy
      ? {
        week_study: currentWeekStudy,
        day_studies: buildDayStudyDisplayViews(dayStudies),
      }
      : null,
    roadmap_canvas: buildRoadmapCanvasSnapshot({
      selectedOption,
      currentWeekStudy,
      weekStudies,
        allDayStudies,
        roadmapStrategyOptions,
        includeProjection: !requiresStrategySelection,
        requiresStrategySelection,
        checkpoints: roadmapCheckpoints,
      }),
  };
};

const scenarioLabelVi: Record<string, string> = {
  ONBOARDING: "Khởi tạo lộ trình",
  NORMAL_PROGRESS: "Đang tiến bộ",
  PLATEAU: "Chững lại",
  BEHIND_SCHEDULE: "Chậm tiến độ",
  PRE_DEADLINE: "Gần deadline",
  FULLTEST_MONTHLY: "Đánh giá định kỳ",
};

const cycleModeLabelVi: Record<string, string> = {
  main_learning: "Học trọng tâm",
  remediation: "Củng cố điểm yếu",
  review: "Ôn tập",
  mixed_practice: "Luyện tập tổng hợp",
  exam_practice: "Luyện đề",
};

const triggerLabelVi: Record<string, string> = {
  initial_generation: "Tạo lộ trình ban đầu",
  mini_test_completion: "Sau Mini Test",
  full_test_review: "Sau Full Test",
  manual: "Điều chỉnh thủ công",
};

const testTypeLabelVi: Record<string, string> = {
  entry: "Entry Test",
  mini: "Mini Test",
  full: "Full Test",
  manual: "Điều chỉnh thủ công",
};

const formatAbilityPercent = (ability?: number) =>
  typeof ability === "number" && Number.isFinite(ability)
    ? Math.round(ability * 100)
    : null;

const formatStudyMinutes = (minutes?: number) => {
  const value = Number(minutes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "Chưa có dữ liệu";
  if (value < 60) return `${Math.round(value)} phút`;

  const hours = value / 60;
  return `${Math.round(hours * 10) / 10} giờ`;
};

const normalizeDecisionReason = (reason: string): string => {
  if (!reason) return reason;

  const skillMatch = reason.match(/^Skill\s+(.+?)\s+có package ROI cao nhất\.$/);
  if (skillMatch) {
    return `Kỹ năng ${getToeicSkillLabelVi(skillMatch[1])} có gói bài học đạt hiệu quả dự kiến cao nhất.`;
  }

  const plateauMatch = reason.match(/^Skill\s+(.+?)\s+không đạt ngưỡng tiến bộ\.$/);
  if (plateauMatch) {
    return `Kỹ năng ${getToeicSkillLabelVi(plateauMatch[1])} chưa đạt mức tiến bộ kỳ vọng.`;
  }

  if (reason.startsWith("Expected gain:")) {
    return `Mức tăng năng lực dự kiến: ${reason.replace("Expected gain:", "").trim()}`;
  }

  if (reason.startsWith("Expected ROI/giờ:")) {
    return `Hiệu quả học dự kiến mỗi giờ: ${reason.replace("Expected ROI/giờ:", "").trim()}`;
  }

  if (reason.startsWith("Projected Part ability:")) {
    return `Năng lực Part dự kiến sau cycle: ${reason.replace("Projected Part ability:", "").trim()}`;
  }

  if (reason.startsWith("Ability-based TOEIC score gain proxy:")) {
    return `Mức tăng điểm TOEIC mô phỏng từ ability: ${reason.replace("Ability-based TOEIC score gain proxy:", "").trim()}`;
  }

  return reason;
};

export const getLearningPathV2CurrentCycleExplanation = async (
  input: LearningPathV2ReadInput
) => {
  const learningPath = await loadActiveLearningPath(input);
  const currentWeekStudy = await findCurrentWeekStudy(learningPath);

  if (!currentWeekStudy) {
    return {
      has_current_cycle: false,
      message: "Lộ trình chưa có cycle học hiện tại.",
    };
  }

  /*
   * SchedulerDecisionLog là nguồn giải thích đúng nhất cho cycle hiện tại.
   * WeekStudy cho biết kết quả cycle đã tạo, còn log cho biết snapshot năng lực
   * và lý do tại thời điểm scheduler ra quyết định.
   */
  const decisionLog = await SchedulerDecisionLog.findOne({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    generated_week_id: currentWeekStudy._id,
    status: "applied",
  })
    .sort({ created_at: -1 })
    .lean();

  const fallbackLatestLog = decisionLog
    ? null
    : await SchedulerDecisionLog.findOne({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        status: "applied",
      })
        .sort({ created_at: -1 })
        .lean();

  const effectiveLog = decisionLog ?? fallbackLatestLog;
  const snapshot = effectiveLog?.input_snapshot;
  const focusPartSnapshot = snapshot?.part_abilities?.find(
    (part) => part.part_type === currentWeekStudy.focus_part_type
  );
  const focusSkillSnapshot = snapshot?.skill_abilities?.find(
    (skill) => skill.skill_key === currentWeekStudy.primary_focus_skill_key
  );
  const extra = snapshot?.extra as Record<string, any> | undefined;
  const selectedProjection = extra?.selected_projection as
    | Record<string, number>
    | undefined;
  const topCandidates = Array.isArray(extra?.top_candidates)
    ? extra.top_candidates.slice(0, 5).map((candidate: any) => ({
        skill_key: candidate.skill_key,
        skill_label: getToeicSkillLabelVi(candidate.skill_key),
        part_type: candidate.part_type,
        current_ability_percent: formatAbilityPercent(candidate.current_ability),
        expected_skill_gain: candidate.expected_skill_gain,
        expected_roi_per_hour: candidate.expected_roi_per_hour,
        is_selected:
          candidate.skill_key === currentWeekStudy.primary_focus_skill_key,
      }))
    : [];

  const decisionTraceLogs = await SchedulerDecisionLog.find({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    status: "applied",
  })
    .sort({ created_at: -1 })
    .limit(8)
    .lean();

  const generatedWeekIds = decisionTraceLogs
    .map((log) => log.generated_week_id)
    .filter(Boolean);
  const traceWeeks =
    generatedWeekIds.length > 0
      ? await WeekStudy.find({ _id: { $in: generatedWeekIds } })
          .select(
            "no primary_focus_skill_key focus_part_type cycle_mode expected_skill_gain expected_roi_per_hour assessment_type"
          )
          .lean()
      : [];
  const traceWeekById = new Map(
    traceWeeks.map((week) => [String(week._id), week])
  );

  return {
    has_current_cycle: true,
    generated_from_current_cycle_log: Boolean(decisionLog),
    cycle: {
      week_id: String(currentWeekStudy._id),
      cycle_no: currentWeekStudy.no,
      status: currentWeekStudy.status,
      expected_completion_at: currentWeekStudy.expected_completion_at,
      focus_part_type: currentWeekStudy.focus_part_type,
      primary_focus_skill_key: currentWeekStudy.primary_focus_skill_key,
      primary_focus_skill_label: getToeicSkillLabelVi(
        currentWeekStudy.primary_focus_skill_key
      ),
      covered_skill_keys: currentWeekStudy.covered_skill_keys ?? [],
      covered_skill_labels: (currentWeekStudy.covered_skill_keys ?? []).map(
        getToeicSkillLabelVi
      ),
      cycle_mode: currentWeekStudy.cycle_mode,
      cycle_mode_label:
        cycleModeLabelVi[currentWeekStudy.cycle_mode] ??
        currentWeekStudy.cycle_mode,
      expected_skill_gain: currentWeekStudy.expected_skill_gain,
      expected_roi_per_hour: currentWeekStudy.expected_roi_per_hour,
      assessment_type: currentWeekStudy.assessment_type,
      assessment_estimated_minutes:
        currentWeekStudy.assessment_estimated_minutes,
    },
    decision: effectiveLog
      ? {
          log_id: String(effectiveLog._id),
          created_at: effectiveLog.created_at,
          trigger_type: effectiveLog.trigger_type,
          trigger_label:
            triggerLabelVi[effectiveLog.trigger_type] ??
            effectiveLog.trigger_type,
          strategy: effectiveLog.strategy,
          strategy_label: "Tối đa hóa hiệu quả học theo kỹ năng",
          scenario: effectiveLog.scenario,
          scenario_label:
            scenarioLabelVi[effectiveLog.scenario ?? ""] ??
            effectiveLog.scenario,
          reasons: (effectiveLog.reasons ?? []).map(normalizeDecisionReason),
          raw_reasons: effectiveLog.reasons ?? [],
          warnings: effectiveLog.warnings ?? [],
        }
      : null,
    evidence: {
      current_score: snapshot?.current_score ?? null,
      target_score: snapshot?.target_score ?? learningPath.target_score ?? null,
      weekly_available_minutes: snapshot?.weekly_available_minutes ?? null,
      weekly_available_label: formatStudyMinutes(
        snapshot?.weekly_available_minutes
      ),
      test_type: snapshot?.test_type ?? null,
      test_type_label: snapshot?.test_type
        ? testTypeLabelVi[snapshot.test_type] ?? snapshot.test_type
        : null,
      focus_part: focusPartSnapshot
        ? {
            part_type: focusPartSnapshot.part_type,
            ability_percent: formatAbilityPercent(focusPartSnapshot.ability),
            status: focusPartSnapshot.status,
            trend: focusPartSnapshot.trend,
          }
        : null,
      focus_skill: focusSkillSnapshot
        ? {
            skill_key: focusSkillSnapshot.skill_key,
            skill_label: getToeicSkillLabelVi(focusSkillSnapshot.skill_key),
            part_type: focusSkillSnapshot.part_type,
            ability_percent: formatAbilityPercent(focusSkillSnapshot.ability),
            status: focusSkillSnapshot.status,
            trend: focusSkillSnapshot.trend,
          }
        : null,
      selected_projection: selectedProjection
        ? {
            skill_ability_before_percent: formatAbilityPercent(
              selectedProjection.skill_ability_before
            ),
            skill_ability_after_percent: formatAbilityPercent(
              selectedProjection.skill_ability_after
            ),
            part_ability_before_percent: formatAbilityPercent(
              selectedProjection.part_ability_before
            ),
            part_ability_after_percent: formatAbilityPercent(
              selectedProjection.part_ability_after
            ),
          }
        : null,
      top_candidates: topCandidates,
    },
    decision_trace: decisionTraceLogs.map((log) => {
      const week = log.generated_week_id
        ? traceWeekById.get(String(log.generated_week_id))
        : undefined;

      return {
        log_id: String(log._id),
        created_at: log.created_at,
        trigger_type: log.trigger_type,
        trigger_label: triggerLabelVi[log.trigger_type] ?? log.trigger_type,
        scenario: log.scenario,
        scenario_label: scenarioLabelVi[log.scenario ?? ""] ?? log.scenario,
        generated_week_id: log.generated_week_id
          ? String(log.generated_week_id)
          : null,
        cycle_no: week?.no ?? null,
        focus_part_type: week?.focus_part_type ?? null,
        primary_focus_skill_key: week?.primary_focus_skill_key ?? null,
        primary_focus_skill_label: week?.primary_focus_skill_key
          ? getToeicSkillLabelVi(week.primary_focus_skill_key)
          : null,
        cycle_mode: week?.cycle_mode ?? null,
        cycle_mode_label: week?.cycle_mode
          ? cycleModeLabelVi[week.cycle_mode] ?? week.cycle_mode
          : null,
        expected_skill_gain: week?.expected_skill_gain ?? null,
        expected_roi_per_hour: week?.expected_roi_per_hour ?? null,
        assessment_type: week?.assessment_type ?? null,
        reason_summary: normalizeDecisionReason(log.reasons?.[0] ?? ""),
      };
    }),
  };
};

type LearningPathNodeDetailStatus = "completed" | "in_cycle" | "current" | "locked";

const getNodeDetailStatusLabel = (status: LearningPathNodeDetailStatus) => {
  if (status === "completed") return "Đã hoàn thành";
  if (status === "current") return "Đang học";
  if (status === "in_cycle") return "Trong cycle này";
  return "Dự kiến";
};

const getNodeDetailActivityLabel = (kind: string) => {
  const labels: Record<string, string> = {
    lesson: "Bài học lý thuyết",
    vocabulary: "Flashcard từ vựng",
    flash_card: "Flashcard từ vựng",
    dictation: "Luyện nghe chép chính tả",
    shadowing: "Luyện shadowing",
    quiz: "Quiz luyện tập",
    mini_test: "Mini Test đánh giá",
    full_test: "Full Test đánh giá",
  };
  return labels[kind] ?? "Hoạt động học tập";
};

const getNodeDetailActivityStatus = (status: WeekStudyStatus) => {
  if (status === WeekStudyStatus.COMPLETED) return "completed" as const;
  if (status === WeekStudyStatus.IN_PROGRESS) return "in_progress" as const;
  if (status === WeekStudyStatus.LOCK) return "planned" as const;
  return "upcoming" as const;
};

export const getLearningPathV2NodeDetail = async (input: {
  user_id: string;
  learning_path_id: string;
  lesson_manager_id: string;
}) => {
  const learningPath = await loadActiveLearningPath({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });
  if (!Types.ObjectId.isValid(input.lesson_manager_id)) {
    throw new Error("lessonManagerId không hợp lệ.");
  }

  const lessonManager = await LessonManager.findById(input.lesson_manager_id).lean<ILessonManager | null>();
  if (!lessonManager) throw new Error("Không tìm thấy LessonManager.");

  const weekStudies = await WeekStudy.find({
    _id: { $in: learningPath.week_study_ids ?? [] },
  }).lean<IWeekStudy[]>();
  const weekStatusById = new Map(weekStudies.map((week) => [String(week._id), week.status]));
  const dayStudies = await DayStudy.find({
    week_id: { $in: weekStudies.map((week) => week._id) },
  }).lean<IDayStudy[]>();
  const lessonManagerId = String(lessonManager._id);
  const matchingSessions = dayStudies.flatMap((day) =>
    (day.sessions ?? [])
      .filter((session) => getRoadmapLessonManagerIdFromSession(session) === lessonManagerId)
      .map((session) => ({ day, session }))
  );

  const currentWeek = [...weekStudies]
    .filter((week) => week.status === WeekStudyStatus.IN_PROGRESS)
    .sort((a, b) => b.no - a.no)[0];
  const hasCompletedSession = matchingSessions.some(({ day, session }) =>
    weekStatusById.get(String(day.week_id)) === WeekStudyStatus.COMPLETED ||
    day.status === WeekStudyStatus.COMPLETED ||
    session.status === WeekStudyStatus.COMPLETED
  );
  const currentSession = matchingSessions.find(({ session }) => session.status === WeekStudyStatus.IN_PROGRESS);
  const isInCurrentCycle = Boolean(
    currentWeek && matchingSessions.some(({ day }) => String(day.week_id) === String(currentWeek._id))
  );
  const status: LearningPathNodeDetailStatus = hasCompletedSession
    ? "completed"
    : currentSession
      ? "current"
      : isInCurrentCycle
        ? "in_cycle"
        : "locked";

  const decisionLog = await SchedulerDecisionLog.findOne({
      learning_path_id: learningPath._id,
      user_id: input.user_id,
      $or: [
        { selected_lesson_manager_ids: lessonManager._id },
        ...(matchingSessions.length > 0
          ? [{ generated_week_id: { $in: matchingSessions.map(({ day }) => day.week_id) } }]
          : []),
      ],
    })
    .sort({ created_at: -1 })
    .lean();
  const snapshot = decisionLog?.input_snapshot;
  const partSnapshot = snapshot?.part_abilities?.find((part) => part.part_type === lessonManager.part_type);
  const skillSnapshot = snapshot?.skill_abilities?.find((skill) =>
    (lessonManager.target_tags ?? []).some((tag) => tag.includes(skill.skill_key))
  );
  const unitActivities = matchingSessions.flatMap(({ session }) => session.items ?? []);
  const activitySource = unitActivities.length > 0
    ? unitActivities
    : (lessonManager.recommended_activity_order ?? []).map((activity) => ({
      kind: activity.activity_type,
      status: WeekStudyStatus.LOCK,
      estimated_minutes: activity.estimated_minutes,
      order: activity.order,
    }));
  const activities = activitySource
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((activity, index) => ({
      order: index + 1,
      title: getNodeDetailActivityLabel(activity.kind),
      type_label: getNodeDetailActivityLabel(activity.kind),
      status: getNodeDetailActivityStatus(activity.status),
      estimated_minutes: activity.estimated_minutes ?? 0,
    }));
  const reasons = [
    ...(status === "locked" ? [{
      type: "roadmap_projection",
      title: "Bài này nằm trong roadmap dự kiến",
      text: "Nội dung có thể được điều chỉnh sau các lần đánh giá tiếp theo.",
      priority: 10,
      evidence: [{ label: "Trạng thái", value: "Dự kiến" }],
    }] : []),
    ...(partSnapshot ? [{
      type: "snapshot_weak_part",
      title: `Part ${lessonManager.part_type} được ưu tiên khi tạo cycle`,
      text: "Quyết định dựa trên snapshot năng lực tại thời điểm scheduler tạo cycle.",
      priority: 20,
      evidence: [{ label: "Năng lực", value: `${Math.round((partSnapshot.ability ?? 0) * 100)}%`, tone: partSnapshot.status === "weak" ? "warning" : "neutral" }],
    }] : []),
    ...(skillSnapshot ? [{
      type: "snapshot_weak_skill",
      title: `Skill ${skillSnapshot.skill_key} được đánh giá trong cycle`,
      text: "Skill này xuất hiện trong snapshot scheduler của cycle đã chọn bài học.",
      priority: 30,
      evidence: [{ label: "Năng lực", value: `${Math.round((skillSnapshot.ability ?? 0) * 100)}%`, tone: skillSnapshot.status === "weak" ? "warning" : "neutral" }],
    }] : []),
    ...(lessonManager.score_band ? [{
      type: "target_alignment",
      title: "Phù hợp vùng điểm mục tiêu",
      text: `Bài học thuộc band ${lessonManager.score_band.from}-${lessonManager.score_band.to}.`,
      priority: 40,
      evidence: [{ label: "Score band", value: `${lessonManager.score_band.from}-${lessonManager.score_band.to}` }],
    }] : []),
  ];

  return {
    lesson_manager_id: lessonManagerId,
    title: lessonManager.title,
    part_type: lessonManager.part_type,
    skill_group: lessonManager.part_type <= 4 ? "Listening" : "Reading",
    status,
    unit_type: lessonManager.unit_type,
    unit_type_label: lessonManager.unit_type,
    node_role: lessonManager.node_role,
    target_tags: lessonManager.target_tags ?? [],
    short_tags: lessonManager.target_tags ?? [],
    planned_minutes: lessonManager.planned_completion_time ?? 0,
    score_band: lessonManager.score_band,
    roadmap_context_label: status === "locked" ? "Roadmap dự kiến" : "Cycle học tập",
    status_label: getNodeDetailStatusLabel(status),
    explanation: {
      source: "backend",
      reasons: reasons.sort((a, b) => a.priority - b.priority),
      adaptive_note: decisionLog?.reasons?.[0] ?? "Hệ thống sẽ cập nhật lộ trình sau mỗi lần đánh giá.",
    },
    activities,
    primary_action: status === "current"
      ? { label: "Tiếp tục học", enabled: true }
      : status === "completed"
        ? { label: "Xem lại bài", enabled: true }
        : { label: "Đã hiểu", enabled: true },
    debug_contract_note: "",
  };
};


type RoadmapCanvasUnitStatus = "completed" | "in_cycle" | "current" | "locked";

type RoadmapCanvasCheckpointType = "entry_test" | "mini_test" | "full_test";

type RoadmapCanvasCheckpointStatus = "completed" | "current" | "planned";

type RoadmapCanvasCheckpoint = {
  id: string;
  type: RoadmapCanvasCheckpointType;
  label: string;
  cycle_no: number;
  status: RoadmapCanvasCheckpointStatus;
  test_id?: string | null;
  week_study_id?: string | null;
  day_study_id?: string | null;
  planned_score?: number | null;
  actual_score?: number | null;
  submitted_at?: Date | null;
};

type RoadmapCanvasUnitStatusItem = {
  lesson_manager_id: string;
  status: RoadmapCanvasUnitStatus;
};

type RoadmapCanvasUnit = {
  lesson_manager_id: string;
  title: string;
  part_type: number;
  unit_type: string;
  node_role?: string;
  target_tags?: string[];
  order: number;
  planned_minutes?: number;
  estimated_gain?: number;
  reason?: string;
  unit_source?: "strategy" | "alternative";
  source_reason?: string;
  score_band?: {
    from?: number;
    to?: number;
  };
};

type RoadmapCanvasPartRoadmap = {
  part_type: number;
  cursor_index: number;
  target_minutes: number;
  estimated_gain: number;
  reaches_target: boolean;
  units: RoadmapCanvasUnit[];
};

type RoadmapCanvasCurrentLearning = {
  lesson_manager_id: string;
  day_study_id: string;
  stage_no: number;
  session_no: number;
  item_order?: number;
  kind?: string;
};

const getRoadmapLessonManagerIdFromSession = (
  session: IDayStudy["sessions"][number]
): string | null => {
  const lessonManagerId =
    session.lesson_manager_id ??
    session.items?.find((item) => item.source_lesson_manager_id)
      ?.source_lesson_manager_id;

  return lessonManagerId ? String(lessonManagerId) : null;
};

const buildStrategyUnitLookup = (
  strategyOptions: ILearningPathStrategyOption[]
): Map<string, RoadmapCanvasUnit> => {
  /*
   * Tên model vẫn là StrategyOption vì đang giữ schema cũ.
   * Trong business mới, các record này là snapshot roadmap ROI dài hạn.
   * Canvas dùng snapshot để hiển thị dự kiến ổn định, còn cycle thật luôn
   * được tạo từ quyết định Skill ROI mới nhất.
   */
  const lookup = new Map<string, RoadmapCanvasUnit>();

  for (const option of strategyOptions) {
    for (const roadmap of option.part_roadmaps ?? []) {
      for (const unit of roadmap.units ?? []) {
        const lessonManagerId = String(unit.lesson_manager_id);
        if (lookup.has(lessonManagerId)) continue;

        lookup.set(lessonManagerId, {
          lesson_manager_id: lessonManagerId,
          title: unit.title,
          part_type: Number(unit.part_type ?? roadmap.part_type),
          unit_type: unit.unit_type,
          node_role: unit.node_role,
          target_tags: unit.target_tags ?? [],
          order: unit.order ?? 0,
          planned_minutes: unit.planned_minutes ?? 0,
          estimated_gain: unit.estimated_gain,
          reason: unit.reason,
          unit_source: unit.unit_source ?? "strategy",
          source_reason: unit.source_reason,
          score_band: unit.score_band,
        });
      }
    }
  }

  return lookup;
};

const pushRoadmapCanvasUnit = (
  roadmapByPart: Map<number, RoadmapCanvasPartRoadmap>,
  unit: RoadmapCanvasUnit
) => {
  const partType = Number(unit.part_type);
  if (!Number.isInteger(partType) || partType < 1 || partType > 7) return;

  const roadmap =
    roadmapByPart.get(partType) ??
    {
      part_type: partType,
      cursor_index: 0,
      target_minutes: 0,
      estimated_gain: 0,
      reaches_target: false,
      units: [],
    };

  if (
    roadmap.units.some(
      (existing) =>
        String(existing.lesson_manager_id) === String(unit.lesson_manager_id)
    )
  ) {
    roadmapByPart.set(partType, roadmap);
    return;
  }

  roadmap.units.push({
    ...unit,
    order: roadmap.units.length,
  });
  roadmapByPart.set(partType, roadmap);
};

const seedRoadmapCanvasParts = (): Map<number, RoadmapCanvasPartRoadmap> => {
  const roadmapByPart = new Map<number, RoadmapCanvasPartRoadmap>();

  for (let partType = 1; partType <= 7; partType += 1) {
    roadmapByPart.set(partType, {
      part_type: partType,
      cursor_index: 0,
      target_minutes: 0,
      estimated_gain: 0,
      reaches_target: false,
      units: [],
    });
  }

  return roadmapByPart;
};

const loadRoadmapCanvasStrategyOptions = async (input: {
  user_id: string;
  learning_path_id: string;
  weekStudies: IWeekStudy[];
  selectedOption?: ILearningPathStrategyOption | null;
}): Promise<ILearningPathStrategyOption[]> => {
  const optionIds = new Set<string>();

  if (input.selectedOption?._id) {
    optionIds.add(String(input.selectedOption._id));
  }

  for (const week of input.weekStudies) {
    if (week.learning_path_strategy_option_id) {
      optionIds.add(String(week.learning_path_strategy_option_id));
    }
  }

  if (optionIds.size === 0) return [];

  return LearningPathStrategyOption.find({
    _id: { $in: [...optionIds].map((id) => new Types.ObjectId(id)) },
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });
};

const getCheckpointStatusFromAssessmentItem = (
  status: WeekStudyStatus
): RoadmapCanvasCheckpointStatus => {
  if (status === WeekStudyStatus.COMPLETED) return "completed";
  if (status === WeekStudyStatus.IN_PROGRESS) return "current";
  return "planned";
};

const getCheckpointLabel = (type: RoadmapCanvasCheckpointType): string => {
  if (type === "entry_test") return "Entry Test";
  if (type === "mini_test") return "Mini Test";
  return "Full Test";
};

const findAssessmentItemInWeek = (
  dayStudies: IDayStudy[]
): {
  dayStudy: IDayStudy;
  item: IDayStudy["sessions"][number]["items"][number];
  type: Exclude<RoadmapCanvasCheckpointType, "entry_test">;
} | null => {
  for (const dayStudy of dayStudies) {
    for (const session of dayStudy.sessions ?? []) {
      for (const item of session.items ?? []) {
        if (item.kind === SessionType.MINI_TEST) {
          return { dayStudy, item, type: "mini_test" };
        }

        if (item.kind === SessionType.FULL_TEST) {
          return { dayStudy, item, type: "full_test" };
        }
      }
    }
  }

  return null;
};

const getRoadmapSimulationBaseCycleNo = (input: {
  selectedOption?: ILearningPathStrategyOption | null;
  weekStudies: IWeekStudy[];
}): number => {
  if (!input.selectedOption?._id) return 1;

  const optionId = String(input.selectedOption._id);
  const firstLinkedWeek = input.weekStudies
    .filter(
      (week) =>
        week.learning_path_strategy_option_id &&
        String(week.learning_path_strategy_option_id) === optionId
    )
    .sort((a, b) => a.no - b.no)[0];

  return firstLinkedWeek?.no ?? 1;
};

const loadActualAssessmentTestsByTestId = async (input: {
  user_id: string;
  testIds: string[];
}): Promise<Map<string, IUserTest>> => {
  const validTestIds = Array.from(
    new Set(input.testIds.filter((id) => Types.ObjectId.isValid(id)))
  );
  if (validTestIds.length === 0) return new Map();

  const userTests = await UserTest.find({
    user_id: input.user_id,
    test_id: { $in: validTestIds.map((id) => new Types.ObjectId(id)) },
    submit_type: { $in: [UserTestSubmitType.MINI_TEST, UserTestSubmitType.FULL_TEST] },
  })
    .sort({ submit_at: -1, created_at: -1 })
    .lean<IUserTest[]>();

  const byTestId = new Map<string, IUserTest>();
  for (const userTest of userTests) {
    const testId = String(userTest.test_id);
    if (!byTestId.has(testId)) {
      byTestId.set(testId, userTest);
    }
  }

  return byTestId;
};

const buildRoadmapCanvasCheckpoints = async (input: {
  user_id: string;
  learning_path_id: string;
  selectedOption?: ILearningPathStrategyOption | null;
  weekStudies: IWeekStudy[];
  allDayStudies: IDayStudy[];
}): Promise<RoadmapCanvasCheckpoint[]> => {
  const checkpointsById = new Map<string, RoadmapCanvasCheckpoint>();
  const dayStudiesByWeekId = new Map<string, IDayStudy[]>();
  const assessmentTestIds: string[] = [];

  for (const dayStudy of input.allDayStudies ?? []) {
    const weekId = String(dayStudy.week_id);
    const group = dayStudiesByWeekId.get(weekId) ?? [];
    group.push(dayStudy);
    dayStudiesByWeekId.set(weekId, group);
  }

  const latestEntryTest = await getLatestUserTestBySubmitType({
    user_id: input.user_id,
    submit_type: UserTestSubmitType.INITIAL_ASSESSMENT,
  });

  if (latestEntryTest) {
    checkpointsById.set("entry-test", {
      id: "entry-test",
      type: "entry_test",
      label: getCheckpointLabel("entry_test"),
      cycle_no: 0,
      status: "completed",
      test_id: String(latestEntryTest.test_id),
      actual_score: latestEntryTest.score,
      submitted_at: latestEntryTest.submit_at,
    });
  }

  const baseCycleNo = getRoadmapSimulationBaseCycleNo({
    selectedOption: input.selectedOption,
    weekStudies: input.weekStudies,
  });

  for (const cycle of input.selectedOption?.roadmap_simulation?.cycles ?? []) {
    const cycleNo = baseCycleNo + cycle.cycle_no - 1;
    const type = cycle.assessment_type;
    const id = `cycle-${cycleNo}-${type}`;

    checkpointsById.set(id, {
      id,
      type,
      label: getCheckpointLabel(type),
      cycle_no: cycleNo,
      status: "planned",
      planned_score:
        typeof cycle.planned_score_after === "number"
          ? cycle.planned_score_after
          : null,
    });
  }

  for (const weekStudy of input.weekStudies) {
    const weekDayStudies = dayStudiesByWeekId.get(String(weekStudy._id)) ?? [];
    const assessment = findAssessmentItemInWeek(weekDayStudies);
    if (!assessment) continue;

    const testId = assessment.item.activity_id
      ? String(assessment.item.activity_id)
      : null;
    if (testId) {
      assessmentTestIds.push(testId);
    }

    const id = `cycle-${weekStudy.no}-${assessment.type}`;
    const existing = checkpointsById.get(id);

    checkpointsById.set(id, {
      ...existing,
      id,
      type: assessment.type,
      label: getCheckpointLabel(assessment.type),
      cycle_no: weekStudy.no,
      status: getCheckpointStatusFromAssessmentItem(assessment.item.status),
      test_id: testId,
      week_study_id: String(weekStudy._id),
      day_study_id: String(assessment.dayStudy._id),
      planned_score: existing?.planned_score ?? null,
    });
  }

  const actualAssessmentByTestId = await loadActualAssessmentTestsByTestId({
    user_id: input.user_id,
    testIds: assessmentTestIds,
  });

  for (const checkpoint of checkpointsById.values()) {
    if (!checkpoint.test_id) continue;

    const actual = actualAssessmentByTestId.get(checkpoint.test_id);
    if (!actual) continue;

    checkpoint.status = "completed";
    checkpoint.actual_score = actual.score;
    checkpoint.submitted_at = actual.submit_at;
  }

  return [...checkpointsById.values()].sort((a, b) => {
    if (a.cycle_no !== b.cycle_no) return a.cycle_no - b.cycle_no;
    const typeOrder: Record<RoadmapCanvasCheckpointType, number> = {
      entry_test: 0,
      mini_test: 1,
      full_test: 2,
    };
    return typeOrder[a.type] - typeOrder[b.type];
  });
};

const buildRoadmapCanvasSnapshot = (input: {
  selectedOption?: ILearningPathStrategyOption | null;
  currentWeekStudy?: IWeekStudy | null;
  weekStudies: IWeekStudy[];
  allDayStudies: IDayStudy[];
  roadmapStrategyOptions: ILearningPathStrategyOption[];
  includeProjection: boolean;
  requiresStrategySelection: boolean;
  checkpoints: RoadmapCanvasCheckpoint[];
}) => {
  const currentCycleLessonManagerIds = new Set<string>();
  const completedLessonManagerIds = new Set<string>();
  const weekStatusById = new Map(
    input.weekStudies.map((week) => [String(week._id), week.status])
  );
  let currentLearning: RoadmapCanvasCurrentLearning | null = null;

  const strategyUnitByLessonManagerId = buildStrategyUnitLookup(
    input.roadmapStrategyOptions
  );
  const roadmapByPart = seedRoadmapCanvasParts();

  for (const day of input.allDayStudies ?? []) {
    const weekStatus = weekStatusById.get(String(day.week_id));
    const isCurrentWeek =
      input.currentWeekStudy &&
      String(day.week_id) === String(input.currentWeekStudy._id);

    for (const session of day.sessions ?? []) {
      const sessionLessonManagerId = getRoadmapLessonManagerIdFromSession(session);
      if (!sessionLessonManagerId) continue;

      if (isCurrentWeek) {
        currentCycleLessonManagerIds.add(sessionLessonManagerId);
      }

      const isCompleted =
        weekStatus === WeekStudyStatus.COMPLETED ||
        day.status === WeekStudyStatus.COMPLETED ||
        session.status === WeekStudyStatus.COMPLETED;
      if (isCompleted) {
        completedLessonManagerIds.add(sessionLessonManagerId);
      }

      if (!currentLearning && session.status === WeekStudyStatus.IN_PROGRESS) {
        const inProgressItem = (session.items ?? []).find(
          (item) => item.status === WeekStudyStatus.IN_PROGRESS
        );

        const lessonManagerId = session.lesson_manager_id ?? inProgressItem?.source_lesson_manager_id;

        if (lessonManagerId) {
          currentLearning = {
            lesson_manager_id: String(lessonManagerId),
            day_study_id: String(day._id),
            stage_no: day.dayOfWeek,
            session_no: session.session_no,
            item_order: inProgressItem?.order,
            kind: inProgressItem?.kind,
          };
        }
      }

      const strategyUnit = strategyUnitByLessonManagerId.get(
        sessionLessonManagerId
      );
      pushRoadmapCanvasUnit(roadmapByPart, {
        lesson_manager_id: sessionLessonManagerId,
        title:
          strategyUnit?.title ??
          session.lesson_manager_title ??
          `Part ${session.part_type ?? 0}`,
        part_type: Number(strategyUnit?.part_type ?? session.part_type ?? 0),
        unit_type: strategyUnit?.unit_type ?? "mixed_practice",
        node_role: strategyUnit?.node_role ?? "normal",
        target_tags: strategyUnit?.target_tags ?? [],
        order: 0,
        planned_minutes:
          strategyUnit?.planned_minutes ?? session.planned_minutes ?? 0,
        estimated_gain: strategyUnit?.estimated_gain,
        reason: strategyUnit?.reason ?? session.scheduler_reason,
        unit_source: strategyUnit?.unit_source ?? "strategy",
        source_reason: strategyUnit?.source_reason,
        score_band: strategyUnit?.score_band,
      });
    }
  }

  if (input.includeProjection && input.selectedOption) {
    for (const roadmap of input.selectedOption.part_roadmaps ?? []) {
      for (const unit of roadmap.units ?? []) {
        pushRoadmapCanvasUnit(roadmapByPart, {
          lesson_manager_id: String(unit.lesson_manager_id),
          title: unit.title,
          part_type: Number(unit.part_type ?? roadmap.part_type),
          unit_type: unit.unit_type,
          node_role: unit.node_role,
          target_tags: unit.target_tags ?? [],
          order: unit.order ?? 0,
          planned_minutes: unit.planned_minutes ?? 0,
          estimated_gain: unit.estimated_gain,
          reason: unit.reason,
          unit_source: unit.unit_source ?? "strategy",
          source_reason: unit.source_reason,
          score_band: unit.score_band,
        });
      }
    }
  }

  const currentLearningLessonManagerId =
    currentLearning?.lesson_manager_id ?? null;

  const units: RoadmapCanvasUnitStatusItem[] = [];

  const partRoadmaps = [...roadmapByPart.values()]
    .sort((a, b) => a.part_type - b.part_type)
    .map((roadmap) => {
      const cursorIndex = roadmap.units.filter((unit) =>
        completedLessonManagerIds.has(String(unit.lesson_manager_id))
      ).length;

      return {
        ...roadmap,
        cursor_index: cursorIndex,
        target_minutes: roadmap.units.reduce(
          (total, unit) => total + (unit.planned_minutes ?? 0),
          0
        ),
        estimated_gain: roadmap.units.reduce(
          (total, unit) => total + (unit.estimated_gain ?? 0),
          0
        ),
      };
    });

  for (const roadmap of partRoadmaps) {
    for (const unit of roadmap.units ?? []) {
      const lessonManagerId = String(unit.lesson_manager_id);

      let status: RoadmapCanvasUnitStatus = "locked";

      if (completedLessonManagerIds.has(lessonManagerId)) {
        status = "completed";
      } else if (lessonManagerId === currentLearningLessonManagerId) {
        status = "current";
      } else if (currentCycleLessonManagerIds.has(lessonManagerId)) {
        status = "in_cycle";
      }

      units.push({
        lesson_manager_id: lessonManagerId,
        status,
      });
    }
  }

  return {
    requires_strategy_selection: input.requiresStrategySelection,
    strategy_selection_reason: input.requiresStrategySelection
      ? ("full_test_review_pending" as const)
      : null,
    current_cycle: input.currentWeekStudy
      ? {
        week_study_id: String(input.currentWeekStudy._id),
        cycle_no: input.currentWeekStudy.no,
        status: input.currentWeekStudy.status,
        primary_focus_skill_key: input.currentWeekStudy.primary_focus_skill_key,
        covered_skill_keys: input.currentWeekStudy.covered_skill_keys ?? [],
        focus_part_type: input.currentWeekStudy.focus_part_type,
        cycle_mode: input.currentWeekStudy.cycle_mode,
        expected_skill_gain: input.currentWeekStudy.expected_skill_gain,
        expected_roi_per_hour: input.currentWeekStudy.expected_roi_per_hour,
        assessment_type: input.currentWeekStudy.assessment_type ?? null,
      }
      : null,
    current_learning: currentLearning,
    checkpoints: input.checkpoints,
    units,
    part_roadmaps: partRoadmaps,
  };
};



/**
 * ==================================
 * ========= User Skill =============
 * ==================================
 */
type SkillMapTab = "parts" | "skills" | "history";

type SkillMapStatusFilter = "weak" | "medium" | "strong";

type SkillMapSkillGroupFilter = "basic" | "core" | "advanced";

type GetLearningPathV2SkillMapInput = {
  user_id: string;
  learning_path_id: string;
  tab?: string;
  status?: string;
  part_type?: number;
  skill_group?: string;
  focus_only?: boolean;
  q?: string;
  page?: number;
  limit?: number;
};

type SkillMapEvidence = {
  item_count?: number;
  correct_count?: number;
};

type SkillMapEvidenceMaps = {
  partsByType: Map<number, SkillMapEvidence>;
  skillsByKey: Map<string, SkillMapEvidence>;
};

const normalizeSkillMapTab = (tab?: string): SkillMapTab => {
  if (tab === "skills" || tab === "history" || tab === "parts") {
    return tab;
  }

  return "parts";
};

const toAbilityPercent = (ability?: number): number => {
  if (typeof ability !== "number" || !Number.isFinite(ability)) {
    return 0;
  }

  return Math.round(clampAbility(ability) * 100);
};

const toTrendDeltaPercent = (trendSlope?: number): number | undefined => {
  if (typeof trendSlope !== "number" || !Number.isFinite(trendSlope)) {
    return undefined;
  }

  return Math.round(trendSlope * 100);
};

const getSkillDomainByPartType = (partType: number): "Listening" | "Reading" => {
  return partType >= 1 && partType <= 4 ? "Listening" : "Reading";
};

const normalizeStatusFilter = (
  status?: string
): SkillMapStatusFilter | undefined => {
  if (status === "weak" || status === "medium" || status === "strong") {
    return status;
  }

  return undefined;
};

const normalizeSkillGroupFilter = (
  skillGroup?: string
): SkillMapSkillGroupFilter | undefined => {
  if (
    skillGroup === "basic" ||
    skillGroup === "core" ||
    skillGroup === "advanced"
  ) {
    return skillGroup;
  }

  return undefined;
};

const loadLearningPathSkillMapBase = async (input: {
  user_id: string;
  learning_path_id: string;
}) => {
  const learningPath = await LearningPath.findOne({
    _id: input.learning_path_id,
    user_id: input.user_id,
    isActive: true,
  }).lean<ILearningPath | null>();

  if (!learningPath) {
    throw new Error("Không tìm thấy LearningPath.");
  }

  const weekStudyIds = learningPath.week_study_ids ?? [];
  const currentWeekStudy =
    weekStudyIds.length > 0
      ? await WeekStudy.findOne({
        _id: { $in: weekStudyIds },
        status: WeekStudyStatus.IN_PROGRESS,
      })
        .sort({ no: -1 })
        .lean<IWeekStudy | null>()
      : null;

  const userSkill = await UserSkill.findOne({
    user_id: input.user_id,
    context_type: "learning_path",
    learning_path_id: input.learning_path_id,
  }).lean<IUserSkill | null>();

  if (!userSkill) {
    return {
      learningPath,
      userSkill: null,
      currentWeekStudy,
    };
  }

  return {
    learningPath,
    userSkill,
    currentWeekStudy,
  };
};

const loadSkillMapLatestEvidence = async (input: {
  user_id: string;
  learning_path_id: string;
}): Promise<SkillMapEvidenceMaps> => {
  const histories = await UserSkillHistory.find({
    user_id: input.user_id,
    context_type: "learning_path",
    learning_path_id: input.learning_path_id,
  })
    .sort({ submitted_at: -1, created_at: -1 })
    .limit(20)
    .select("parts skills")
    .lean<IUserSkillHistory[]>();

  const partsByType = new Map<number, SkillMapEvidence>();
  const skillsByKey = new Map<string, SkillMapEvidence>();

  for (const history of histories) {
    for (const part of history.parts ?? []) {
      if (!partsByType.has(part.part_type)) {
        partsByType.set(part.part_type, {
          item_count: part.item_count,
          correct_count: part.correct_count,
        });
      }
    }

    for (const skill of history.skills ?? []) {
      if (!skillsByKey.has(skill.skill_key)) {
        skillsByKey.set(skill.skill_key, {
          item_count: skill.item_count,
          correct_count: skill.correct_count,
        });
      }
    }
  }

  return {
    partsByType,
    skillsByKey,
  };
};

const buildSkillMapPartsTab = async (input: {
  userSkill: IUserSkill | null;
  currentWeekStudy?: IWeekStudy | null;
  evidence?: SkillMapEvidenceMaps;
}) => {
  const focusPartSet = new Set(
    input.currentWeekStudy ? [input.currentWeekStudy.focus_part_type] : []
  );

  const parts = (input.userSkill?.parts ?? [])
    .map((part) => {
      const evidence = input.evidence?.partsByType.get(part.part_type);

      return {
        part_type: part.part_type,
        skill_domain: getSkillDomainByPartType(part.part_type),
        ability_percent: toAbilityPercent(part.ability),
        status: part.status,
        absolute_level: part.absolute_level,
        trend: part.trend,
        trend_delta_percent: toTrendDeltaPercent(part.trend_slope),
        history_count: part.history_count ?? 0,
        item_count: evidence?.item_count,
        correct_count: evidence?.correct_count,
        is_focus_part: focusPartSet.has(part.part_type),
        last_evaluated_at: part.last_evaluated_at,
      };
    })
    .sort((a, b) => a.part_type - b.part_type);

  const weakestParts = [...parts]
    .filter((part) => part.status === "weak")
    .sort((a, b) => a.ability_percent - b.ability_percent)
    .map((part) => part.part_type);

  const strongestParts = [...parts]
    .filter((part) => part.status === "strong")
    .sort((a, b) => b.ability_percent - a.ability_percent)
    .map((part) => part.part_type);

  const improvingParts = [...parts]
    .filter((part) => part.trend === "improving")
    .map((part) => part.part_type);

  const decliningParts = [...parts]
    .filter((part) => part.trend === "declining")
    .map((part) => part.part_type);

  return {
    tab: "parts",
    summary: {
      weakest_parts: weakestParts,
      strongest_parts: strongestParts,
      improving_parts: improvingParts,
      declining_parts: decliningParts,
      focus_part_type: input.currentWeekStudy?.focus_part_type ?? null,
      last_evaluated_at: input.userSkill?.last_evaluated_at,
    },
    parts,
  };
};

const buildSkillMapSkillsTab = async (input: {
  userSkill: IUserSkill | null;
  currentWeekStudy?: IWeekStudy | null;
  evidence?: SkillMapEvidenceMaps;
  status?: string;
  part_type?: number;
  skill_group?: string;
  focus_only?: boolean;
  q?: string;
}) => {
  const statusFilter = normalizeStatusFilter(input.status);
  const skillGroupFilter = normalizeSkillGroupFilter(input.skill_group);
  const focusSkillSet = new Set(
    input.currentWeekStudy
      ? [
        input.currentWeekStudy.primary_focus_skill_key,
        ...(input.currentWeekStudy.covered_skill_keys ?? []),
      ]
      : []
  );
  const query = input.q?.trim().toLowerCase();

  let skills = (input.userSkill?.parts ?? []).flatMap((part) =>
    (part.skills ?? []).map((skill) => {
      const evidence = input.evidence?.skillsByKey.get(skill.skill_key);

      return {
        skill_key: skill.skill_key,
        label_vi:
          getToeicSkillLabelVi(skill.skill_key, part.part_type) ??
          skill.label_vi ??
          skill.skill_key,
        part_type: part.part_type,
        skill_domain: getSkillDomainByPartType(part.part_type),
        skill_group: skill.skill_group,
        ability_percent: toAbilityPercent(skill.ability),
        status: skill.status,
        absolute_level: skill.absolute_level,
        trend: skill.trend,
        trend_delta_percent: toTrendDeltaPercent(skill.trend_slope),
        history_count: skill.history_count ?? 0,
        item_count: evidence?.item_count,
        correct_count: evidence?.correct_count,
        is_focus_skill: focusSkillSet.has(skill.skill_key),
        last_evaluated_at: skill.last_evaluated_at,
      };
    })
  );

  if (statusFilter) {
    skills = skills.filter((skill) => skill.status === statusFilter);
  }

  if (Number.isFinite(input.part_type)) {
    skills = skills.filter((skill) => skill.part_type === input.part_type);
  }

  if (skillGroupFilter) {
    skills = skills.filter((skill) => skill.skill_group === skillGroupFilter);
  }

  if (input.focus_only) {
    skills = skills.filter((skill) => skill.is_focus_skill);
  }

  if (query) {
    skills = skills.filter(
      (skill) =>
        skill.skill_key.toLowerCase().includes(query) ||
        skill.label_vi.toLowerCase().includes(query)
    );
  }

  skills.sort((a, b) => {
    if (a.status !== b.status) {
      const rank = { weak: 0, medium: 1, strong: 2 };
      return rank[a.status] - rank[b.status];
    }

    if (a.part_type !== b.part_type) {
      return a.part_type - b.part_type;
    }

    return a.ability_percent - b.ability_percent;
  });

  const weakestSkills = skills
    .filter((skill) => skill.status === "weak")
    .slice(0, 5)
    .map((skill) => ({
      skill_key: skill.skill_key,
      label_vi: skill.label_vi,
      part_type: skill.part_type,
      ability_percent: skill.ability_percent,
    }));

  return {
    tab: "skills",
    summary: {
      weakest_skills: weakestSkills,
      focus_skill_count: focusSkillSet.size,
      improving_skill_count: skills.filter((skill) => skill.trend === "improving").length,
      last_evaluated_at: input.userSkill?.last_evaluated_at,
    },
    filters: {
      status: statusFilter,
      part_type: input.part_type,
      skill_group: skillGroupFilter,
      focus_only: Boolean(input.focus_only),
      q: input.q,
    },
    skills,
    meta: {
      total: skills.length,
    },
  };
};

const mapTriggerTypeToUiLabel = (triggerType: string): string => {
  if (triggerType === "initial_generation") return "Entry Test";
  if (triggerType === "mini_test_completion") return "Mini Test";
  if (triggerType === "full_test_review") return "Full Test";
  return "Luyện tập";
};

const buildSkillMapHistoryTab = async (input: {
  user_id: string;
  learning_path_id: string;
  page?: number;
  limit?: number;
}) => {
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(20, Math.max(1, Number(input.limit) || 5));
  const skip = (page - 1) * limit;

  const query = {
    user_id: input.user_id,
    context_type: "learning_path",
    learning_path_id: input.learning_path_id,
  };

  const [histories, total] = await Promise.all([
    UserSkillHistory.find(query)
      .sort({ submitted_at: -1, created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean<IUserSkillHistory[]>(),
    UserSkillHistory.countDocuments(query),
  ]);

  const sourceUserTestIds = histories
    .map((history) => history.source_user_test_id)
    .filter(Boolean)
    .map((id) => String(id));

  const userTests = await UserTest.find({
    _id: { $in: sourceUserTestIds },
  }).lean<IUserTest[]>();

  const userTestById = new Map(
    userTests.map((test) => [String(test._id), test])
  );

  const sortedChronological = [...histories].sort((a, b) => {
    const aTime = (a.submitted_at ?? a.created_at ?? new Date(0)).getTime();
    const bTime = (b.submitted_at ?? b.created_at ?? new Date(0)).getTime();
    return aTime - bTime;
  });

  const scoreTrend = sortedChronological.map((history) => {
    const userTest = history.source_user_test_id
      ? userTestById.get(String(history.source_user_test_id))
      : undefined;

    return {
      history_id: String(history._id),
      label: mapTriggerTypeToUiLabel(history.trigger_type),
      submitted_at: history.submitted_at ?? history.created_at,
      score: userTest?.score ?? null,
    };
  });

  const items = histories.map((history) => {
    const userTest = history.source_user_test_id
      ? userTestById.get(String(history.source_user_test_id))
      : undefined;

    const parts = [...(history.parts ?? [])]
      .map((part) => ({
        part_type: part.part_type,
        ability_percent: toAbilityPercent(part.ability),
        status: part.status,
        absolute_level: part.absolute_level,
        item_count: part.item_count,
        correct_count: part.correct_count,
      }))
      .sort((a, b) => a.part_type - b.part_type);

    const weakestParts = [...parts]
      .filter((part) => part.status === "weak")
      .sort((a, b) => a.ability_percent - b.ability_percent)
      .map((part) => part.part_type);

    return {
      history_id: String(history._id),
      source_user_test_id: history.source_user_test_id
        ? String(history.source_user_test_id)
        : null,
      trigger_type: history.trigger_type,
      label: mapTriggerTypeToUiLabel(history.trigger_type),
      submitted_at: history.submitted_at ?? history.created_at,
      score: userTest?.score ?? null,
      duration: userTest?.duration ?? null,
      submit_type: userTest?.submit_type ?? null,
      parts,
      weakest_parts: weakestParts,
    };
  });

  return {
    tab: "history",
    summary: {
      assessment_count: total,
      latest_submitted_at: items[0]?.submitted_at ?? null,
      improved_part_count: null,
    },
    score_trend: scoreTrend,
    histories: items,
    meta: {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

export const getLearningPathV2SkillMap = async (
  input: GetLearningPathV2SkillMapInput
) => {
  const tab = normalizeSkillMapTab(input.tab);

  const { userSkill, currentWeekStudy } = await loadLearningPathSkillMapBase({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
  });
  const evidence =
    tab === "history"
      ? undefined
      : await loadSkillMapLatestEvidence({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
      });

  switch (tab) {
    case "skills":
      return buildSkillMapSkillsTab({
        userSkill,
        currentWeekStudy,
        evidence,
        status: input.status,
        part_type: input.part_type,
        skill_group: input.skill_group,
        focus_only: input.focus_only,
        q: input.q,
      });

    case "history":
      return buildSkillMapHistoryTab({
        user_id: input.user_id,
        learning_path_id: input.learning_path_id,
        page: input.page,
        limit: input.limit,
      });

    case "parts":
    default:
      return buildSkillMapPartsTab({
        userSkill,
        currentWeekStudy,
        evidence,
      });
  }
};
