import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUserSkill: any = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
};

const mockGetRecentUserSkillHistories: any = jest.fn();

jest.mock("../../src/models/user_skill.model", () => ({
  UserSkill: mockUserSkill,
}));

jest.mock(
  "../../src/services/user_skill_history.service",
  () => ({
    getRecentUserSkillHistories: mockGetRecentUserSkillHistories,
  })
);

import {
  calculateAbilityByEWMA,
  calculateTrendByRegression,
  updateUserSkillFromHistory,
} from "../../src/services/user_skill.service";

const userId = new Types.ObjectId();
const learningPathId = new Types.ObjectId();
const historyId = new Types.ObjectId();
const sourceUserTestId = new Types.ObjectId();
const createdAt = new Date("2026-06-01T10:00:00.000Z");

const createFindOneChain = (snapshot: any) => ({
  lean: (jest.fn() as any).mockResolvedValue(snapshot),
});

const createHistory = (overrides: Record<string, unknown> = {}) => ({
  _id: historyId,
  user_id: userId,
  context_type: "learning_path",
  learning_path_id: learningPathId,
  source_user_test_id: sourceUserTestId,
  trigger_type: "initial_generation",
  parts: [
    {
      part_type: 1,
      ability: 0.6,
      status: "medium",
      absolute_level: "medium",
      item_count: 10,
      correct_count: 6,
    },
  ],
  skills: [
    {
      skill_key: "part1_photos",
      label_vi: "Mô tả tranh",
      part_type: 1,
      skill_group: "core",
      ability: 0.6,
      status: "medium",
      absolute_level: "medium",
      item_count: 5,
      correct_count: 3,
    },
  ],
  submitted_at: createdAt,
  created_at: createdAt,
  ...overrides,
});

const createRecentHistories = () => [
  {
    ...createHistory({
      _id: new Types.ObjectId(),
      submitted_at: new Date("2026-06-01T10:00:00.000Z"),
      created_at: new Date("2026-06-01T10:00:00.000Z"),
    }),
    parts: [{ ...createHistory().parts[0], ability: 0.6 }],
    skills: [{ ...createHistory().skills[0], ability: 0.6 }],
  },
  {
    ...createHistory({
      _id: new Types.ObjectId(),
      submitted_at: new Date("2026-05-31T10:00:00.000Z"),
      created_at: new Date("2026-05-31T10:00:00.000Z"),
    }),
    parts: [{ ...createHistory().parts[0], ability: 0.4 }],
    skills: [{ ...createHistory().skills[0], ability: 0.4 }],
  },
  {
    ...createHistory({
      _id: new Types.ObjectId(),
      submitted_at: new Date("2026-05-30T10:00:00.000Z"),
      created_at: new Date("2026-05-30T10:00:00.000Z"),
    }),
    parts: [{ ...createHistory().parts[0], ability: 0.2 }],
    skills: [{ ...createHistory().skills[0], ability: 0.2 }],
  },
];

describe("learning_path_v2 user skill service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRecentUserSkillHistories.mockResolvedValue([createHistory()]);
    mockUserSkill.findOne.mockReturnValue(createFindOneChain(null));
    mockUserSkill.findOneAndUpdate.mockResolvedValue({ _id: new Types.ObjectId() });
  });

  it("calculateAbilityByEWMA -> no previous ability -> returns signal ability", () => {
    // Chuẩn bị
    const input = { signalAbility: 0.7, alpha: 0.4 };

    // Thực thi
    const result = calculateAbilityByEWMA(input);

    // Kiểm tra
    expect(result).toBe(0.7);
  });

  it("calculateAbilityByEWMA -> previous ability and alpha -> returns weighted ability", () => {
    // Chuẩn bị
    const input = { previousAbility: 0.2, signalAbility: 0.6, alpha: 0.25 };

    // Thực thi
    const result = calculateAbilityByEWMA(input);

    // Kiểm tra
    expect(result).toBeCloseTo(0.3);
  });

  it("calculateAbilityByEWMA -> result outside bounds -> clamps to 0..1", () => {
    // Chuẩn bị
    const tooHigh = { previousAbility: 1, signalAbility: 2, alpha: 1 };
    const tooLow = { previousAbility: 0, signalAbility: -1, alpha: 1 };

    // Thực thi
    const highResult = calculateAbilityByEWMA(tooHigh);
    const lowResult = calculateAbilityByEWMA(tooLow);

    // Kiểm tra
    expect(highResult).toBe(1);
    expect(lowResult).toBe(0);
  });

  it("calculateTrendByRegression -> fewer than 2 points -> returns stable", () => {
    // Chuẩn bị
    const points = [{ ability: 0.5, created_at: createdAt }];

    // Thực thi
    const result = calculateTrendByRegression(points);

    // Kiểm tra
    expect(result).toEqual({
      trend: "stable",
      trend_slope: 0,
      history_count: 1,
    });
  });

  it("calculateTrendByRegression -> increasing abilities -> returns improving", () => {
    // Chuẩn bị
    const points = [
      { ability: 0.2, created_at: new Date("2026-05-30T00:00:00.000Z") },
      { ability: 0.4, created_at: new Date("2026-05-31T00:00:00.000Z") },
      { ability: 0.6, created_at: new Date("2026-06-01T00:00:00.000Z") },
    ];

    // Thực thi
    const result = calculateTrendByRegression(points);

    // Kiểm tra
    expect(result.trend).toBe("improving");
    expect(result.trend_slope).toBeGreaterThan(0.03);
  });

  it("calculateTrendByRegression -> decreasing abilities -> returns declining", () => {
    // Chuẩn bị
    const points = [
      { ability: 0.7, created_at: new Date("2026-05-30T00:00:00.000Z") },
      { ability: 0.5, created_at: new Date("2026-05-31T00:00:00.000Z") },
      { ability: 0.3, created_at: new Date("2026-06-01T00:00:00.000Z") },
    ];

    // Thực thi
    const result = calculateTrendByRegression(points);

    // Kiểm tra
    expect(result.trend).toBe("declining");
    expect(result.trend_slope).toBeLessThan(-0.03);
  });

  it("calculateTrendByRegression -> nearly flat abilities -> returns stable", () => {
    // Chuẩn bị
    const points = [
      { ability: 0.5, created_at: new Date("2026-05-30T00:00:00.000Z") },
      { ability: 0.51, created_at: new Date("2026-05-31T00:00:00.000Z") },
      { ability: 0.52, created_at: new Date("2026-06-01T00:00:00.000Z") },
    ];

    // Thực thi
    const result = calculateTrendByRegression(points);

    // Kiểm tra
    expect(result.trend).toBe("stable");
  });

  it("updateUserSkillFromHistory -> no existing snapshot -> creates snapshot from history", async () => {
    // Chuẩn bị
    const history = createHistory();

    // Thực thi
    await updateUserSkillFromHistory(history as any);

    // Kiểm tra
    const update = mockUserSkill.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.parts).toEqual([
      expect.objectContaining({
        part_type: 1,
        ability: 0.6,
        status: "medium",
        absolute_level: "medium",
        skills: [
          expect.objectContaining({
            skill_key: "part1_photos",
            ability: 0.6,
          }),
        ],
      }),
    ]);
    expect(mockUserSkill.findOneAndUpdate.mock.calls[0][2]).toEqual(
      expect.objectContaining({ upsert: true, new: true })
    );
  });

  it("updateUserSkillFromHistory -> existing snapshot -> updates ability by EWMA", async () => {
    // Chuẩn bị
    mockUserSkill.findOne.mockReturnValue(
      createFindOneChain({
        parts: [
          {
            part_type: 1,
            ability: 0.2,
            status: "weak",
            absolute_level: "very_low",
            skills: [
              {
                skill_key: "part1_photos",
                ability: 0.2,
                status: "weak",
                absolute_level: "very_low",
              },
            ],
          },
        ],
      })
    );

    // Thực thi
    await updateUserSkillFromHistory(
      createHistory({ trigger_type: "mini_test_completion" }) as any
    );

    // Kiểm tra
    const update = mockUserSkill.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.parts[0].ability).toBeCloseTo(0.3);
    expect(update.$set.parts[0].skills[0].ability).toBeCloseTo(0.3);
  });

  it("updateUserSkillFromHistory -> existing part/skill not in new history -> keeps unchanged", async () => {
    // Chuẩn bị
    const unchangedPart = {
      part_type: 2,
      ability: 0.8,
      status: "strong",
      absolute_level: "high",
      skills: [
        {
          skill_key: "part2_questions",
          ability: 0.8,
          status: "strong",
          absolute_level: "high",
        },
      ],
    };
    mockUserSkill.findOne.mockReturnValue(
      createFindOneChain({
        parts: [
          {
            part_type: 1,
            ability: 0.2,
            status: "weak",
            absolute_level: "very_low",
            skills: [
              {
                skill_key: "unchanged_skill",
                ability: 0.9,
                status: "strong",
                absolute_level: "high",
              },
            ],
          },
          unchangedPart,
        ],
      })
    );

    // Thực thi
    await updateUserSkillFromHistory(createHistory() as any);

    // Kiểm tra
    const update = mockUserSkill.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.parts).toEqual(
      expect.arrayContaining([expect.objectContaining(unchangedPart)])
    );
    expect(update.$set.parts[0].skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill_key: "unchanged_skill", ability: 0.9 }),
      ])
    );
  });

  it("updateUserSkillFromHistory -> updated ability -> recomputes status and absolute_level", async () => {
    // Chuẩn bị
    mockUserSkill.findOne.mockReturnValue(
      createFindOneChain({
        parts: [
          {
            part_type: 1,
            ability: 0.7,
            status: "medium",
            absolute_level: "medium",
            skills: [],
          },
        ],
      })
    );

    // Thực thi
    await updateUserSkillFromHistory(
      createHistory({
        parts: [
          {
            part_type: 1,
            ability: 1,
            status: "strong",
            absolute_level: "high",
            item_count: 10,
            correct_count: 10,
          },
        ],
        skills: [],
      }) as any
    );

    // Kiểm tra
    const update = mockUserSkill.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.parts[0].ability).toBeCloseTo(0.82);
    expect(update.$set.parts[0]).toEqual(
      expect.objectContaining({
        absolute_level: "high",
        status: "strong",
      })
    );
  });

  it("updateUserSkillFromHistory -> recent histories -> stores trend and trend_slope", async () => {
    // Chuẩn bị
    mockGetRecentUserSkillHistories.mockResolvedValue(createRecentHistories());

    // Thực thi
    await updateUserSkillFromHistory(createHistory() as any);

    // Kiểm tra
    const update = mockUserSkill.findOneAndUpdate.mock.calls[0][1];
    expect(update.$set.parts[0].trend).toBe("improving");
    expect(update.$set.parts[0].trend_slope).toBeGreaterThan(0.03);
    expect(update.$set.parts[0].skills[0].trend).toBe("improving");
  });

  it("updateUserSkillFromHistory -> upsert query -> uses user_id/context_type/learning_path_id", async () => {
    // Chuẩn bị
    const history = createHistory();

    // Thực thi
    await updateUserSkillFromHistory(history as any);

    // Kiểm tra
    expect(mockUserSkill.findOneAndUpdate.mock.calls[0][0]).toEqual({
      user_id: userId,
      context_type: "learning_path",
      learning_path_id: learningPathId,
    });
  });
});
