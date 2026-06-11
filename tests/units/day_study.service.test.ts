import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SessionType } from "../../src/models/enums/SessionType";
import { WeekStudyStatus } from "../../src/models/enums/WeekStudyStatus";

const mockLearningPath: any = {
  findOne: jest.fn(),
};

const mockWeekStudy: any = {
  findOne: jest.fn(),
};

const mockLessonManager: any = {
  find: jest.fn(),
};

const mockDayStudy: any = {
  create: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
};

jest.mock("../../src/models", () => ({
  DayStudy: mockDayStudy,
  LearningPath: mockLearningPath,
  LessonManager: mockLessonManager,
  WeekStudy: mockWeekStudy,
}));

import {
  createDayStudiesForWeekStudyCycle,
  mapActivityTypeToSessionType,
} from "../../src/services/day_study.service";

const userId = new Types.ObjectId().toString();
const learningPathId = new Types.ObjectId().toString();
const weekStudyId = new Types.ObjectId().toString();
const optionId = new Types.ObjectId();
const lessonManagerId1 = new Types.ObjectId();
const lessonManagerId2 = new Types.ObjectId();
const assessmentTestId = new Types.ObjectId();

const createLearningPath = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(learningPathId),
  user_id: new Types.ObjectId(userId),
  isActive: true,
  time_per_day: 60,
  ...overrides,
});

const createWeekStudy = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(weekStudyId),
  learning_path_strategy_option_id: optionId,
  assessment_type: "mini_test",
  assessment_estimated_minutes: 100,
  days: [],
  save: (jest.fn() as any).mockResolvedValue(undefined),
  ...overrides,
});

const createCycleUnit = (
  lessonManagerId: Types.ObjectId,
  order: number,
  overrides: Record<string, unknown> = {}
) => ({
  lesson_manager_id: lessonManagerId,
  title: `LessonManager ${order + 1}`,
  part_type: 5,
  score_band: { from: 400, to: 600 },
  unit_type: "foundation",
  node_role: "normal",
  target_tags: ["part5_word_form"],
  order,
  planned_minutes: 60,
  estimated_gain: 0.2,
  reason: `Roadmap reason ${order + 1}`,
  ...overrides,
});

const createActivity = (
  activityType: "lesson" | "vocabulary" | "dictation" | "shadowing" | "quiz",
  minutes: number,
  order: number
) => ({
  activity_type: activityType,
  activity_id: new Types.ObjectId(),
  estimated_minutes: minutes,
  is_required: true,
  order,
});

const createLessonManager = (
  id: Types.ObjectId,
  activities: Array<ReturnType<typeof createActivity>>,
  overrides: Record<string, unknown> = {}
) => ({
  _id: id,
  title: `LessonManager ${id.toString().slice(-4)}`,
  planned_completion_time: activities.reduce(
    (sum, activity) => sum + activity.estimated_minutes,
    0
  ),
  recommended_activity_order: activities,
  ...overrides,
});

const setupValidMocks = (overrides: {
  learningPath?: Record<string, unknown>;
  weekStudy?: Record<string, unknown>;
  cycleUnits?: any[];
  lessonManagers?: any[];
} = {}) => {
  const learningPath = createLearningPath(overrides.learningPath);
  const weekStudy = createWeekStudy(overrides.weekStudy);
  const cycleUnits =
    overrides.cycleUnits ?? [
      createCycleUnit(lessonManagerId1, 0),
      createCycleUnit(lessonManagerId2, 1),
    ];
  const lessonManagers =
    overrides.lessonManagers ?? [
      createLessonManager(lessonManagerId1, [
        createActivity("lesson", 20, 1),
        createActivity("vocabulary", 30, 2),
      ]),
      createLessonManager(lessonManagerId2, [
        createActivity("quiz", 25, 1),
        createActivity("dictation", 15, 2),
      ]),
    ];

  mockLearningPath.findOne.mockResolvedValue(learningPath);
  mockWeekStudy.findOne.mockResolvedValue(weekStudy);
  mockLessonManager.find.mockResolvedValue(lessonManagers);
  mockDayStudy.create.mockImplementation((payloads: any[]) =>
    Promise.resolve(
      payloads.map((payload) => ({
        _id: new Types.ObjectId(),
        ...payload,
      }))
    )
  );

  return { learningPath, weekStudy, cycleUnits, lessonManagers };
};

const createCycleInput = (cycleUnits: any[]) => ({
  user_id: userId,
  learning_path_id: learningPathId,
  week_study_id: weekStudyId,
  assessment_test_id: assessmentTestId,
  cycle_units: cycleUnits,
});

describe("day_study.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupValidMocks();
  });

  it("createDayStudiesForWeekStudyCycle -> valid week cycle -> creates learning days and assessment day", async () => {
    const { weekStudy, cycleUnits } = setupValidMocks();

    const result = await createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits));

    expect(mockDayStudy.create).toHaveBeenCalledTimes(1);
    const payloads = mockDayStudy.create.mock.calls[0][0];
    expect(payloads).toHaveLength(3);
    expect(payloads[0].dayOfWeek).toBe(1);
    expect(payloads[0].sessions[0].items.map((item: any) => item.estimated_minutes)).toEqual([
      20,
      30,
    ]);
    expect(payloads[1].sessions[0].items.map((item: any) => item.estimated_minutes)).toEqual([
      25,
      15,
    ]);
    expect(payloads[2].sessions[0].items[0].kind).toBe(SessionType.MINI_TEST);
    expect(payloads[2].sessions[0].items[0].activity_id).toBe(assessmentTestId);
    expect(weekStudy.days).toHaveLength(3);
    expect(weekStudy.save).toHaveBeenCalled();
    expect(result.day_studies).toHaveLength(3);
  });

  it("createDayStudiesForWeekStudyCycle -> activity overflow single day -> allows activity larger than daily budget", async () => {
    const { cycleUnits } = setupValidMocks({
      learningPath: { time_per_day: 30 },
      cycleUnits: [createCycleUnit(lessonManagerId1, 0)],
      lessonManagers: [
        createLessonManager(lessonManagerId1, [createActivity("lesson", 45, 1)]),
      ],
    });

    await createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits));

    const payloads = mockDayStudy.create.mock.calls[0][0];
    expect(payloads[0].sessions[0].planned_minutes).toBe(45);
    expect(payloads[0].sessions[0].items).toHaveLength(1);
  });

  it("createDayStudiesForWeekStudyCycle -> same LessonManager spans multiple days", async () => {
    const { cycleUnits } = setupValidMocks({
      learningPath: { time_per_day: 50 },
      cycleUnits: [createCycleUnit(lessonManagerId1, 0)],
      lessonManagers: [
        createLessonManager(lessonManagerId1, [
          createActivity("lesson", 30, 1),
          createActivity("vocabulary", 30, 2),
          createActivity("quiz", 20, 3),
        ]),
      ],
    });

    await createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits));

    const payloads = mockDayStudy.create.mock.calls[0][0];
    expect(payloads[0].sessions[0].lesson_manager_id).toEqual(lessonManagerId1);
    expect(payloads[1].sessions[0].lesson_manager_id).toEqual(lessonManagerId1);
    expect(payloads[0].sessions[0].items).toHaveLength(1);
    expect(payloads[1].sessions[0].items).toHaveLength(2);
  });

  it("createDayStudiesForWeekStudyCycle -> full_test assessment -> creates FULL_TEST day", async () => {
    const { cycleUnits } = setupValidMocks({
      weekStudy: {
        assessment_type: "full_test",
        assessment_estimated_minutes: 200,
      },
      cycleUnits: [createCycleUnit(lessonManagerId1, 0)],
      lessonManagers: [
        createLessonManager(lessonManagerId1, [createActivity("lesson", 20, 1)]),
      ],
    });

    await createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits));

    const payloads = mockDayStudy.create.mock.calls[0][0];
    const assessmentDay = payloads[payloads.length - 1];
    expect(assessmentDay.sessions[0].items[0].kind).toBe(SessionType.FULL_TEST);
    expect(assessmentDay.sessions[0].items[0].activity_id).toBe(assessmentTestId);
    expect(assessmentDay.sessions[0].planned_minutes).toBe(200);
  });

  it("createDayStudiesForWeekStudyCycle -> WeekStudy already has days -> throws", async () => {
    const { cycleUnits } = setupValidMocks({
      weekStudy: { days: [new Types.ObjectId()] },
    });

    await expect(
      createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits))
    ).rejects.toThrow("WeekStudy");
    expect(mockDayStudy.create).not.toHaveBeenCalled();
  });

  it("createDayStudiesForWeekStudyCycle -> missing LearningPath -> throws", async () => {
    const { cycleUnits } = setupValidMocks();
    mockLearningPath.findOne.mockResolvedValue(null);

    await expect(
      createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits))
    ).rejects.toThrow("LearningPath");
  });

  it("createDayStudiesForWeekStudyCycle -> LessonManager recommended_activity_order empty -> fallback synthetic lesson item", async () => {
    const { cycleUnits } = setupValidMocks({
      cycleUnits: [createCycleUnit(lessonManagerId1, 0, { planned_minutes: 55 })],
      lessonManagers: [
        createLessonManager(lessonManagerId1, [], { planned_completion_time: 40 }),
      ],
    });

    await createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits));

    const payloads = mockDayStudy.create.mock.calls[0][0];
    expect(payloads[0].sessions[0].items[0].kind).toBe(SessionType.LESSON);
    expect(payloads[0].sessions[0].items[0].estimated_minutes).toBe(55);
  });

  it("mapActivityTypeToSessionType -> vocabulary maps to FLASH_CARD", () => {
    expect(mapActivityTypeToSessionType("vocabulary")).toBe(
      SessionType.FLASH_CARD
    );
  });

  it("createDayStudiesForWeekStudyCycle -> first day only unlocks first item of first session", async () => {
    const { cycleUnits } = setupValidMocks({
      learningPath: { time_per_day: 100 },
      cycleUnits: [
        createCycleUnit(lessonManagerId1, 0),
        createCycleUnit(lessonManagerId2, 1),
      ],
      lessonManagers: [
        createLessonManager(lessonManagerId1, [
          createActivity("lesson", 20, 1),
          createActivity("vocabulary", 20, 2),
        ]),
        createLessonManager(lessonManagerId2, [
          createActivity("quiz", 20, 1),
        ]),
      ],
    });

    await createDayStudiesForWeekStudyCycle(createCycleInput(cycleUnits));

    const payloads = mockDayStudy.create.mock.calls[0][0];
    const firstDay = payloads[0];

    expect(firstDay.status).toBe(WeekStudyStatus.IN_PROGRESS);
    expect(firstDay.sessions[0].status).toBe(WeekStudyStatus.IN_PROGRESS);
    expect(firstDay.sessions[0].items[0].status).toBe(WeekStudyStatus.IN_PROGRESS);
    expect(firstDay.sessions[0].items[1].status).toBe(WeekStudyStatus.LOCK);

    expect(firstDay.sessions[1].status).toBe(WeekStudyStatus.LOCK);
    expect(firstDay.sessions[1].items[0].status).toBe(WeekStudyStatus.LOCK);
  });
});



