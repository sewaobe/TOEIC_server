import { Types } from "mongoose";
import {
  SchedulerDecisionLog,
  SchedulerDecisionStatus,
  SchedulerScenario,
  SchedulerStrategy,
  SchedulerTriggerType,
  type ISchedulerInputSnapshot,
  type ISchedulerOutputSummary,
} from "../../models/scheduler_decision_log.model";

export interface GetLatestAppliedStrategyContextInput {
  user_id: string;
  learning_path_id: string;
}

export interface CreateSchedulerDecisionLogInput {
  user_id: string | Types.ObjectId;
  learning_path_id: string | Types.ObjectId;
  source_week_id?: string | Types.ObjectId | null;
  generated_week_id?: string | Types.ObjectId | null;
  trigger_type: SchedulerTriggerType;
  scheduler_version?: string;
  strategy?: SchedulerStrategy;
  scenario?: SchedulerScenario;
  status: SchedulerDecisionStatus;
  reasons?: string[];
  warnings?: string[];
  input_snapshot?: ISchedulerInputSnapshot;
  candidate_lesson_manager_ids?: Array<string | Types.ObjectId>;
  selected_lesson_manager_ids?: Array<string | Types.ObjectId>;
  output_summary?: ISchedulerOutputSummary;
  error_message?: string;
  created_by?: string | Types.ObjectId | null;
}

export interface LatestAppliedStrategyContext {
  strategy?: SchedulerStrategy;
  scenario?: SchedulerScenario;
  reasons: string[];
  warnings: string[];
  created_at?: Date;
}

const toObjectId = (
  id?: string | Types.ObjectId | null
): Types.ObjectId | undefined => {
  if (!id) return undefined;
  return id instanceof Types.ObjectId ? id : new Types.ObjectId(id);
};

const toObjectIds = (
  ids?: Array<string | Types.ObjectId>
): Types.ObjectId[] => (ids ?? []).map((id) => toObjectId(id)!);

export const createSchedulerDecisionLog = async (
  input: CreateSchedulerDecisionLogInput
) => {
  return SchedulerDecisionLog.create({
    user_id: toObjectId(input.user_id),
    learning_path_id: toObjectId(input.learning_path_id),
    source_week_id: toObjectId(input.source_week_id),
    generated_week_id: toObjectId(input.generated_week_id),
    trigger_type: input.trigger_type,
    scheduler_version:
      input.scheduler_version ?? "learning-path-v2-layer4",
    strategy: input.strategy,
    scenario: input.scenario,
    status: input.status,
    reasons: input.reasons ?? [],
    warnings: input.warnings ?? [],
    input_snapshot: input.input_snapshot,
    candidate_lesson_manager_ids: toObjectIds(
      input.candidate_lesson_manager_ids
    ),
    selected_lesson_manager_ids: toObjectIds(
      input.selected_lesson_manager_ids
    ),
    output_summary: input.output_summary,
    error_message: input.error_message ?? "",
    created_by: toObjectId(input.created_by),
  });
};

// Decision logging is separate from planning.
export const getLatestAppliedStrategyContext = async (
  input: GetLatestAppliedStrategyContextInput
): Promise<LatestAppliedStrategyContext | null> => {
  const userObjectId = toObjectId(input.user_id);
  const learningPathObjectId = toObjectId(input.learning_path_id);

  const latestLog = await SchedulerDecisionLog.findOne({
    user_id: userObjectId,
    learning_path_id: learningPathObjectId,
    status: "applied",
  })
    .sort({ created_at: -1 })
    .select("strategy scenario reasons warnings created_at")
    .lean();

  if (!latestLog) {
    return null;
  }

  return {
    strategy: latestLog.strategy as SchedulerStrategy | undefined,
    scenario: latestLog.scenario as SchedulerScenario | undefined,
    reasons: latestLog.reasons ?? [],
    warnings: latestLog.warnings ?? [],
    created_at: latestLog.created_at,
  };
};
