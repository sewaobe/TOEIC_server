import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWeekStudy: any = {
  findOne: jest.fn(),
};

const mockDayStudy: any = {
  findOne: jest.fn(),
};

jest.mock("../../src/models", () => ({
  WeekStudy: mockWeekStudy,
  DayStudy: mockDayStudy,
}));

import { SessionType } from "../../src/models/enums/SessionType";
import {
  attachAssessmentTestToWeekCycle,
  generateAssessmentTestFromWeekCycle,
  generateFullTestFromWeekCycle,
  generateMiniTestFromWeekCycle,
} from "../../src/services/learning_path_v2/learning_path_assessment.service";

const weekStudyId = new Types.ObjectId();
const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();

const createWeekStudy = (overrides: Record<string, unknown> = {}) => ({
  _id: weekStudyId,
  assessment_type: "mini_test",
  days: [new Types.ObjectId()],
  ...overrides,
});

const createDayStudy = (kind: SessionType): any => ({
  _id: new Types.ObjectId(),
  sessions: [
    {
      session_no: 1,
      items: [{ kind }],
    },
  ],
  save: (jest.fn() as any).mockResolvedValue(undefined),
});

const createFindOneSortChain = (value: unknown) => ({
  sort: (jest.fn() as any).mockResolvedValue(value),
});

describe("learning_path_assessment.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generateAssessmentTestFromWeekCycle -> mini_test attaches test_id to MINI_TEST item", async () => {
    const weekStudy = createWeekStudy({ assessment_type: "mini_test" });
    const dayStudy = createDayStudy(SessionType.MINI_TEST);
    mockWeekStudy.findOne.mockResolvedValue(weekStudy);
    mockDayStudy.findOne.mockReturnValue(createFindOneSortChain(dayStudy));

    const result = await generateAssessmentTestFromWeekCycle({
      user_id: userId,
      learning_path_id: learningPathId,
      week_study_id: String(weekStudyId),
    });

    expect(result.test_id).toBeInstanceOf(Types.ObjectId);
    expect(result.day_study).toBe(dayStudy);
    expect(dayStudy.sessions[0].items[0].activity_id).toBe(result.test_id);
    expect(dayStudy.save).toHaveBeenCalledTimes(1);
  });

  it("generateAssessmentTestFromWeekCycle -> full_test attaches test_id to FULL_TEST item", async () => {
    const weekStudy = createWeekStudy({ assessment_type: "full_test" });
    const dayStudy = createDayStudy(SessionType.FULL_TEST);
    mockWeekStudy.findOne.mockResolvedValue(weekStudy);
    mockDayStudy.findOne.mockReturnValue(createFindOneSortChain(dayStudy));

    const result = await generateAssessmentTestFromWeekCycle({
      user_id: userId,
      learning_path_id: learningPathId,
      week_study_id: String(weekStudyId),
    });

    expect(result.test_id).toBeInstanceOf(Types.ObjectId);
    expect(dayStudy.sessions[0].items[0].activity_id).toBe(result.test_id);
    expect(dayStudy.save).toHaveBeenCalledTimes(1);
  });

  it("attachAssessmentTestToWeekCycle -> no WeekStudy -> throws Vietnamese error", async () => {
    mockWeekStudy.findOne.mockResolvedValue(null);

    const action = attachAssessmentTestToWeekCycle({
      week_study_id: String(weekStudyId),
      test_id: new Types.ObjectId(),
    });

    await expect(action).rejects.toThrow(
      "Không tìm thấy WeekStudy để gắn assessment test."
    );
  });

  it("attachAssessmentTestToWeekCycle -> no DayStudy -> throws Vietnamese error", async () => {
    mockWeekStudy.findOne.mockResolvedValue(createWeekStudy());
    mockDayStudy.findOne.mockReturnValue(createFindOneSortChain(null));

    const action = attachAssessmentTestToWeekCycle({
      week_study_id: String(weekStudyId),
      test_id: new Types.ObjectId(),
    });

    await expect(action).rejects.toThrow(
      "Không tìm thấy DayStudy assessment cuối cycle."
    );
  });

  it("attachAssessmentTestToWeekCycle -> missing assessment item -> throws Vietnamese error", async () => {
    mockWeekStudy.findOne.mockResolvedValue(
      createWeekStudy({ assessment_type: "mini_test" })
    );
    mockDayStudy.findOne.mockReturnValue(
      createFindOneSortChain(createDayStudy(SessionType.LESSON))
    );

    const action = attachAssessmentTestToWeekCycle({
      week_study_id: String(weekStudyId),
      test_id: new Types.ObjectId(),
    });

    await expect(action).rejects.toThrow(
      "Không tìm thấy assessment item trong DayStudy cuối cycle."
    );
  });

  it("generateMiniTestFromWeekCycle -> returns ObjectId placeholder", async () => {
    const result = await generateMiniTestFromWeekCycle({
      user_id: userId,
      learning_path_id: learningPathId,
      week_study_id: String(weekStudyId),
    });

    expect(result.test_id).toBeInstanceOf(Types.ObjectId);
  });

  it("generateFullTestFromWeekCycle -> returns ObjectId placeholder", async () => {
    const result = await generateFullTestFromWeekCycle({
      user_id: userId,
      learning_path_id: learningPathId,
      week_study_id: String(weekStudyId),
    });

    expect(result.test_id).toBeInstanceOf(Types.ObjectId);
  });
});
