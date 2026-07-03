import { Types } from "mongoose";
import { Group } from "../models/group.model";
import { Test } from "../models/test.model";
import { UserSkill } from "../models/user_skill.model";
import { UserTest } from "../models/user_test.model";
import { TestStatus } from "../models/enums/TestStatus";
import { TestType } from "../models/enums/TestType";

type GenerateLearningPathFullTestInput = {
  user_id: string;
  learning_path_id: string;
};

type FullTestCandidate = {
  test: any;
  fitScore: number;
  attemptCount: number;
};

const TOEIC_FULL_TEST_PART_WEIGHTS: Record<number, number> = {
  1: 6 / 200,
  2: 25 / 200,
  3: 39 / 200,
  4: 30 / 200,
  5: 30 / 200,
  6: 16 / 200,
  7: 54 / 200,
};

const PART_TYPES = [1, 2, 3, 4, 5, 6, 7];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const abilityToTargetDifficulty = (ability?: number): number => {
  if (typeof ability !== "number" || !Number.isFinite(ability)) {
    return 0;
  }

  return clamp01(ability) * 6 - 3;
};

const toObjectId = (id: string | Types.ObjectId): Types.ObjectId =>
  id instanceof Types.ObjectId ? id : new Types.ObjectId(id);

const getUserIdCandidates = (userId: string): unknown[] => {
  const candidates: unknown[] = [userId];
  if (Types.ObjectId.isValid(userId)) {
    candidates.push(new Types.ObjectId(userId));
  }
  return candidates;
};

const loadUserFullTestAttemptCounts = async (
  userId: string
): Promise<Map<string, number>> => {
  const attempts = await UserTest.aggregate<{
    _id: Types.ObjectId;
    count: number;
  }>([
    {
      $match: {
        user_id: { $in: getUserIdCandidates(userId) },
      },
    },
    {
      $lookup: {
        from: "tests",
        localField: "test_id",
        foreignField: "_id",
        as: "test",
      },
    },
    { $unwind: "$test" },
    {
      $match: {
        "test.type": TestType.FULL_TEST,
      },
    },
    {
      $group: {
        _id: "$test_id",
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(attempts.map((item) => [String(item._id), item.count]));
};

const calculateTestPartAverageDifficulty = (
  test: any
): Map<number, number> => {
  const partStats = new Map<number, { sum: number; count: number }>();

  for (const group of test.groups ?? []) {
    const partType = Number(group.part);
    if (!PART_TYPES.includes(partType)) continue;

    const current = partStats.get(partType) ?? { sum: 0, count: 0 };
    for (const question of group.questions ?? []) {
      current.sum += question.irt_difficulty ?? 0;
      current.count += 1;
    }
    partStats.set(partType, current);
  }

  return new Map(
    [...partStats.entries()].map(([partType, stats]) => [
      partType,
      stats.count > 0 ? stats.sum / stats.count : 0,
    ])
  );
};

const calculateFullTestFitScore = (input: {
  test: any;
  targetDifficultyByPart: Map<number, number>;
}): number => {
  const testDifficultyByPart = calculateTestPartAverageDifficulty(input.test);

  return PART_TYPES.reduce((score, partType) => {
    const testDifficulty = testDifficultyByPart.get(partType) ?? 0;
    const targetDifficulty = input.targetDifficultyByPart.get(partType) ?? 0;
    const weight = TOEIC_FULL_TEST_PART_WEIGHTS[partType] ?? 0;

    return score + weight * Math.abs(testDifficulty - targetDifficulty);
  }, 0);
};

export const selectLearningPathFullTest = async (
  input: GenerateLearningPathFullTestInput
) => {
  const userSkill = await UserSkill.findOne({
    user_id: toObjectId(input.user_id),
    context_type: "learning_path",
    learning_path_id: toObjectId(input.learning_path_id),
  }).lean();

  if (!userSkill) {
    throw new Error("Không tìm thấy UserSkill để chọn full test.");
  }

  const targetDifficultyByPart = new Map<number, number>(
    (userSkill.parts ?? []).map((part) => [
      part.part_type,
      abilityToTargetDifficulty(part.ability),
    ])
  );

  const tests = await Test.find({
    type: TestType.FULL_TEST,
    status: TestStatus.OPEN,
  })
    .populate({
      path: "groups",
      model: "Group",
      populate: {
        path: "questions",
        select: "_id irt_difficulty",
      },
    })
    .lean();

  if (!tests.length) {
    throw new Error("Không có full test OPEN để chọn cho LearningPath.");
  }

  const attemptCounts = await loadUserFullTestAttemptCounts(input.user_id);
  const candidates: FullTestCandidate[] = tests.map((test) => ({
    test,
    fitScore: calculateFullTestFitScore({
      test,
      targetDifficultyByPart,
    }),
    attemptCount: attemptCounts.get(String(test._id)) ?? 0,
  }));

  const minAttemptCount = Math.min(
    ...candidates.map((candidate) => candidate.attemptCount)
  );

  return candidates
    .filter((candidate) => candidate.attemptCount === minAttemptCount)
    .sort((left, right) => {
      if (left.fitScore !== right.fitScore) {
        return left.fitScore - right.fitScore;
      }

      return String(left.test._id).localeCompare(String(right.test._id));
    })[0].test;
};
