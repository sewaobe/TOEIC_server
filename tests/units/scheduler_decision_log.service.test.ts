import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockSchedulerDecisionLog: any = {
  create: jest.fn(),
  findOne: jest.fn(),
};

jest.mock("../../src/models/scheduler_decision_log.model", () => ({
  SchedulerDecisionLog: mockSchedulerDecisionLog,
}));

import { createSchedulerDecisionLog } from "../../src/services/learning_path_v2/scheduler_decision_log.service";

describe("scheduler_decision_log.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSchedulerDecisionLog.create.mockImplementation((payload: any) =>
      Promise.resolve({ _id: new Types.ObjectId(), ...payload })
    );
  });

  it("createSchedulerDecisionLog -> stores strategy option reference and does not duplicate candidates", async () => {
    const strategyOptionId = new Types.ObjectId().toString();

    await createSchedulerDecisionLog({
      user_id: new Types.ObjectId().toString(),
      learning_path_id: new Types.ObjectId().toString(),
      learning_path_strategy_option_id: strategyOptionId,
      trigger_type: "initial_generation",
      strategy: "recommended",
      scenario: "ONBOARDING",
      status: "applied",
      selected_lesson_manager_ids: [new Types.ObjectId().toString()],
      output_summary: {
        planned_minutes: 120,
        selected_unit_count: 1,
      },
    });

    expect(mockSchedulerDecisionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        learning_path_strategy_option_id: new Types.ObjectId(strategyOptionId),
        selected_lesson_manager_ids: expect.any(Array),
      })
    );
  });
});
