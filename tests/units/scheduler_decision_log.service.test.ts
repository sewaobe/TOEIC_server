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
      input_snapshot: {
        test_type: "entry",
        part_abilities: [
          {
            part_type: 1,
            label_vi: "Part 1",
            ability: 0.4,
            status: "weak",
            trend: "stable",
          },
        ],
        skill_abilities: [
          {
            part_type: 1,
            skill_key: "part1_photos",
            label_vi: "Photographs",
            ability: 0.35,
            status: "weak",
            trend: "declining",
          },
        ],
      },
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
        input_snapshot: expect.objectContaining({
          part_abilities: [
            {
              part_type: 1,
              label_vi: "Part 1",
              ability: 0.4,
              status: "weak",
              trend: "stable",
            },
          ],
          skill_abilities: [
            {
              part_type: 1,
              skill_key: "part1_photos",
              label_vi: "Photographs",
              ability: 0.35,
              status: "weak",
              trend: "declining",
            },
          ],
        }),
      })
    );
    const createPayload = mockSchedulerDecisionLog.create.mock.calls[0][0];
    expect(createPayload.input_snapshot.part_abilities[0]).not.toHaveProperty("absolute_level");
    expect(createPayload.input_snapshot.skill_abilities[0]).not.toHaveProperty("tag");
    expect(createPayload.input_snapshot.skill_abilities[0]).not.toHaveProperty("skill_group");
    expect(createPayload.input_snapshot).not.toHaveProperty("completed_lesson_manager_ids");
  });
});
