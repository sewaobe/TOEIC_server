import { SchedulerDecisionLog, SchedulerScenario, SchedulerStrategy } from "../../models/scheduler_decision_log.model";

export interface GetLatestAppliedStrategyContextInput {
  user_id: string;
  learning_path_id: string;
}

export interface LatestAppliedStrategyContext {
  strategy?: SchedulerStrategy;
  scenario?: SchedulerScenario;
  reasons: string[];
  warnings: string[];
  created_at?: Date;
}

// Decision logging is separate from planning. This checkpoint keeps only a read helper.
export const getLatestAppliedStrategyContext = async (
  input: GetLatestAppliedStrategyContextInput
): Promise<LatestAppliedStrategyContext | null> => {
  const latestLog = await SchedulerDecisionLog.findOne({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
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
