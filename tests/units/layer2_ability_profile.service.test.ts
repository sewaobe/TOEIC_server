import { describe, expect, it, jest } from "@jest/globals";

jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
}));

jest.mock("../../src/utils/webpush", () => ({}));

import { calculateThetaRaschV2 } from "../../src/services/irt.service";
import { buildAbilityProfile } from "../../src/services/learning_path_v2/layer2_ability_profile.service";
import type { NormalizedTestResultV2 } from "../../src/types/learning_path_v2";

const createNormalizedResult = (
  answers: NormalizedTestResultV2["answers"],
  overrides: Partial<NormalizedTestResultV2> = {}
): NormalizedTestResultV2 => ({
  trigger_type: "full_test_review",
  user_id: "user-1",
  test_id: "test-1",
  test_result_id: "result-1",
  test_type: "full_test",
  source: "overview_test",
  answers,
  part_results: [
    {
      part_type: 5,
      accuracy: 100,
    },
  ],
  metadata: {},
  ...overrides,
});

const createAnswer = (
  questionId: string,
  isCorrect: boolean,
  irtDifficulty: number,
  partType: number,
  skillKey = `skill-${partType}`,
  skillGroup: "basic" | "core" | "advanced" = "basic"
): NormalizedTestResultV2["answers"][number] => ({
  question_id: questionId,
  is_correct: isCorrect,
  irt_difficulty: irtDifficulty,
  part_type: partType,
  skill_keys: [skillKey],
  skills: [
    {
      key: skillKey,
      label_vi: skillKey,
      raw_tag: skillKey,
      part_type: partType,
      skill_group: skillGroup,
    },
  ],
});

describe("LearningPath v2 Layer 2 ability profile", () => {
  it("calculateThetaRaschV2 -> mixed item difficulties -> returns ability between 0 and 1", () => {
    // Chuẩn bị
    const items = [
      { question_id: "q1", is_correct: true, irt_difficulty: -1 },
      { question_id: "q2", is_correct: false, irt_difficulty: 1 },
      { question_id: "q3", is_correct: true, irt_difficulty: 0 },
    ];

    // Thực thi
    const result = calculateThetaRaschV2(items);

    // Kiểm tra
    expect(result.ability).toBeGreaterThanOrEqual(0);
    expect(result.ability).toBeLessThanOrEqual(1);
    expect(result.item_count).toBe(3);
    expect(result.correct_count).toBe(2);
  });

  it("buildAbilityProfile -> valid part items -> returns part abilities", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      createAnswer("q1", true, -1, 1),
      createAnswer("q2", false, 1, 1),
      createAnswer("q3", true, 0, 2),
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    expect(profile.part_abilities).toHaveLength(2);
    expect(profile.part_abilities[0]).toMatchObject({
      part_type: 1,
      item_count: 2,
      correct_count: 1,
    });
    expect(profile.part_abilities[0].ability).toBeGreaterThanOrEqual(0);
    expect(profile.part_abilities[0].ability).toBeLessThanOrEqual(1);
  });

  it("buildAbilityProfile -> valid skill items -> returns skill abilities", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      createAnswer("q1", true, -1, 5, "part5_word_form", "basic"),
      createAnswer("q2", false, 1, 5, "part5_word_form", "basic"),
      createAnswer("q3", true, 0, 7, "part7_inference", "advanced"),
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    expect(profile.skill_abilities).toHaveLength(2);
    expect(profile.skill_abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill_key: "part5_word_form",
          part_type: 5,
          skill_group: "basic",
          item_count: 2,
        }),
        expect.objectContaining({
          skill_key: "part7_inference",
          part_type: 7,
          skill_group: "advanced",
          item_count: 1,
        }),
      ])
    );
  });

  it("buildAbilityProfile -> all 7 parts -> assigns relative part status 3 weak 2 medium 2 strong", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      createAnswer("q1", false, 0, 1),
      createAnswer("q2", false, 0, 2),
      createAnswer("q3", false, 0, 3),
      createAnswer("q4", true, 0, 4),
      createAnswer("q5", true, 0, 5),
      createAnswer("q6", true, -2, 6),
      createAnswer("q7", true, -2, 7),
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    expect(profile.part_abilities.filter((part) => part.status === "weak"))
      .toHaveLength(3);
    expect(profile.part_abilities.filter((part) => part.status === "medium"))
      .toHaveLength(2);
    expect(profile.part_abilities.filter((part) => part.status === "strong"))
      .toHaveLength(2);
  });

  it("buildAbilityProfile -> fewer than 7 parts -> assigns part status from absolute_level", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      createAnswer("q1", false, 0, 1),
      createAnswer("q2", true, 0, 2),
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    for (const partAbility of profile.part_abilities) {
      if (
        partAbility.absolute_level === "very_low" ||
        partAbility.absolute_level === "low"
      ) {
        expect(partAbility.status).toBe("weak");
      } else if (partAbility.absolute_level === "medium") {
        expect(partAbility.status).toBe("medium");
      } else {
        expect(partAbility.status).toBe("strong");
      }
    }
  });

  it("buildAbilityProfile -> skills >= 3 -> assigns relative skill status", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      createAnswer("q1", false, 0, 1, "skill-a"),
      createAnswer("q2", true, 0, 2, "skill-b"),
      createAnswer("q3", true, -2, 3, "skill-c"),
      createAnswer("q4", true, -2, 4, "skill-d"),
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    expect(profile.skill_abilities.filter((skill) => skill.status === "weak").length)
      .toBeGreaterThanOrEqual(1);
    expect(profile.skill_abilities.filter((skill) => skill.status === "medium").length)
      .toBeGreaterThanOrEqual(1);
    expect(profile.skill_abilities.filter((skill) => skill.status === "strong").length)
      .toBeGreaterThanOrEqual(1);
  });

  it("buildAbilityProfile -> unknown/unmapped skills -> skips them", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      {
        question_id: "q1",
        is_correct: true,
        irt_difficulty: 0,
        part_type: 5,
        raw_tags: ["[Part 5] Mystery"],
        skill_keys: [],
        skills: [],
      },
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    expect(profile.skill_abilities).toEqual([]);
    expect(profile.warnings).toContain("Skipped 1 items missing skill_keys.");
  });

  it("buildAbilityProfile -> items missing irt_difficulty -> skips item and records warning", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      createAnswer("q1", true, 0, 5),
      {
        question_id: "q2",
        is_correct: true,
        part_type: 5,
        skill_keys: ["part5_word_form"],
      },
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    expect(profile.part_abilities[0].item_count).toBe(1);
    expect(profile.warnings).toContain(
      "Skipped 1 items missing irt_difficulty."
    );
  });

  it("buildAbilityProfile -> no valid Rasch items -> throws clear Layer 2 error", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      {
        question_id: "q1",
        is_correct: true,
        part_type: 5,
      },
    ]);

    // Thực thi
    const action = buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    await expect(action).rejects.toThrow(
      "No valid Rasch item responses for ability calculation"
    );
  });

  it("buildAbilityProfile -> public output -> does not contain confidence theta or overall", async () => {
    // Chuẩn bị
    const normalizedResult = createNormalizedResult([
      createAnswer("q1", true, 0, 5),
    ]);

    // Thực thi
    const profile = await buildAbilityProfile({
      normalized_result: normalizedResult,
    });

    // Kiểm tra
    expect(profile).not.toHaveProperty("confidence");
    expect(profile).not.toHaveProperty("theta");
    expect(profile).not.toHaveProperty("overall");
    expect(profile.part_abilities[0]).not.toHaveProperty("confidence");
    expect(profile.part_abilities[0]).not.toHaveProperty("theta");
    expect(profile.skill_abilities[0]).not.toHaveProperty("confidence");
    expect(profile.skill_abilities[0]).not.toHaveProperty("theta");
  });
});
