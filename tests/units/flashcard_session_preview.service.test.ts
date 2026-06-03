import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  calForgetHalflife,
  calculateRecallProbability,
  calRecallHalflife,
  clampDifficulty,
  DHP_CONFIG,
} from "../../src/utils/dhp.util";
import { lookupSspMmcIntervalDays } from "../../src/services/ssp_mmc_policy.service";

const mockUserVocabularyMemoryV2 = {
  find: jest.fn(),
};

jest.mock("../../src/models/user_vocabulary_progress_v2.model", () => ({
  UserVocabularyMemoryV2: mockUserVocabularyMemoryV2,
}));

import {
  buildFlashcardSessionPreviewMetadata,
  buildReviewCardPreview,
  FORGOT_DIFFICULTY_STEP,
  NEW_CARD_REMEMBER_INTERVAL_DAYS,
  SHORT_TERM_REPEAT_POLICIES,
  VAGUE_DIFFICULTY_STEP,
} from "../../src/services/flashcard_session_preview.service";
import { FlashcardSessionCardState } from "../../src/types/flashcardFeedback.type";

const userId = new Types.ObjectId().toString();
const now = new Date("2026-05-17T10:00:00.000Z");
const lastReviewedAt = new Date("2026-05-14T10:00:00.000Z");

const createMemory = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  user_id: new Types.ObjectId(userId),
  vocabulary_id: new Types.ObjectId(),
  difficulty: 8,
  half_life_days: 6,
  last_reviewed_at: lastReviewedAt,
  due_at: now,
  status: "reviewing",
  ...overrides,
});

const mockLeanMemoryRecords = (records: any[]) => {
  mockUserVocabularyMemoryV2.find.mockReturnValue({
    lean: (jest.fn() as any).mockResolvedValue(records),
  });
};

describe("flashcard session preview service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeanMemoryRecords([]);
  });

  it("buildFlashcardSessionPreviewMetadata -> Vocabulary without memory -> ReturnsNewCardMetadataWithRememberInterval1Day", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId().toString();

    // Act
    const result = await buildFlashcardSessionPreviewMetadata({
      userId,
      vocabularyIds: [vocabularyId],
      now,
    });

    // Assert
    expect(result.repeat_policy).toEqual(SHORT_TERM_REPEAT_POLICIES);
    expect(result.cards[vocabularyId]).toEqual({
      card_type: "NEW",
      options: {
        remember: { interval_days: NEW_CARD_REMEMBER_INTERVAL_DAYS },
        vague: { repeat_policy_key: "vague" },
        unknown: { repeat_policy_key: "unknown_or_forgot" },
      },
    });
  });

  it("buildFlashcardSessionPreviewMetadata -> Vocabulary with memory -> ReturnsReviewCardMetadata", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId();
    const memory = createMemory({ vocabulary_id: vocabularyId });
    mockLeanMemoryRecords([memory]);

    // Act
    const result = await buildFlashcardSessionPreviewMetadata({
      userId,
      vocabularyIds: [vocabularyId.toString()],
      now,
    });

    // Assert
    expect(result.cards[vocabularyId.toString()].card_type).toBe("REVIEW");
    expect(result.cards[vocabularyId.toString()].memory_snapshot).toEqual({
      difficulty: memory.difficulty,
      half_life_days: memory.half_life_days,
      last_reviewed_at: memory.last_reviewed_at,
      p_recall_now: calculateRecallProbability(
        memory.half_life_days,
        memory.last_reviewed_at,
        now
      ),
    });
    expect(result.cards[vocabularyId.toString()].options.forgot).toBeDefined();
    expect(result.cards[vocabularyId.toString()].options.unknown).toBeUndefined();
  });

  it("buildReviewCardPreview -> Remember action -> UsesRecallBranchInterval", () => {
    // Arrange
    const memory = createMemory();
    const pRecallNow = calculateRecallProbability(
      memory.half_life_days,
      memory.last_reviewed_at,
      now
    );
    const recallHalfLifeDays = calRecallHalflife(
      memory.difficulty,
      memory.half_life_days,
      pRecallNow
    );

    // Act
    const result = buildReviewCardPreview(memory, now);

    // Assert
    expect(result.options.remember).toEqual({
      difficulty: memory.difficulty,
      half_life_days: recallHalfLifeDays,
      interval_days: lookupSspMmcIntervalDays(memory.difficulty, recallHalfLifeDays),
    });
  });

  it("buildReviewCardPreview -> Vague action -> UsesForgetBranchAndIncreasesDifficultyByVagueStep", () => {
    // Arrange
    const memory = createMemory({ difficulty: 7 });
    const pRecallNow = calculateRecallProbability(
      memory.half_life_days,
      memory.last_reviewed_at,
      now
    );
    const forgetHalfLifeDays = calForgetHalflife(
      memory.difficulty,
      memory.half_life_days,
      pRecallNow
    );
    const nextDifficulty = clampDifficulty(memory.difficulty + VAGUE_DIFFICULTY_STEP);

    // Act
    const result = buildReviewCardPreview(memory, now);

    // Assert
    expect(result.options.vague).toEqual({
      difficulty: nextDifficulty,
      half_life_days: forgetHalfLifeDays,
      interval_days: lookupSspMmcIntervalDays(nextDifficulty, forgetHalfLifeDays),
      repeat_policy_key: "vague",
    });
  });

  it("buildReviewCardPreview -> Forgot action -> UsesForgetBranchAndIncreasesDifficultyByForgotStep", () => {
    // Arrange
    const memory = createMemory({ difficulty: 7 });
    const pRecallNow = calculateRecallProbability(
      memory.half_life_days,
      memory.last_reviewed_at,
      now
    );
    const forgetHalfLifeDays = calForgetHalflife(
      memory.difficulty,
      memory.half_life_days,
      pRecallNow
    );
    const nextDifficulty = clampDifficulty(memory.difficulty + FORGOT_DIFFICULTY_STEP);

    // Act
    const result = buildReviewCardPreview(memory, now);

    // Assert
    expect(result.options.forgot).toEqual({
      difficulty: nextDifficulty,
      half_life_days: forgetHalfLifeDays,
      interval_days: lookupSspMmcIntervalDays(nextDifficulty, forgetHalfLifeDays),
      repeat_policy_key: "unknown_or_forgot",
    });
  });

  it("buildReviewCardPreview -> Difficulty increase beyond max -> ClampsToMaxDifficulty", () => {
    // Arrange
    const memory = createMemory({ difficulty: DHP_CONFIG.DIFFICULTY_MAX });

    // Act
    const result = buildReviewCardPreview(memory, now);

    // Assert
    expect(result.options.vague.difficulty).toBe(DHP_CONFIG.DIFFICULTY_MAX);
    expect(result.options.forgot?.difficulty).toBe(DHP_CONFIG.DIFFICULTY_MAX);
  });

  it("buildFlashcardSessionPreviewMetadata -> Mixed new and review vocabularies -> ReturnsCorrectMetadataKeyedByVocabularyId", async () => {
    // Arrange
    const newVocabularyId = new Types.ObjectId().toString();
    const reviewVocabularyId = new Types.ObjectId();
    const memory = createMemory({ vocabulary_id: reviewVocabularyId });
    mockLeanMemoryRecords([memory]);

    // Act
    const result = await buildFlashcardSessionPreviewMetadata({
      userId,
      vocabularyIds: [newVocabularyId, reviewVocabularyId.toString()],
      now,
    });

    // Assert
    expect(Object.keys(result.cards)).toEqual([
      newVocabularyId,
      reviewVocabularyId.toString(),
    ]);
    expect(result.cards[newVocabularyId].card_type).toBe("NEW");
    expect(result.cards[reviewVocabularyId.toString()].card_type).toBe("REVIEW");
    expect(mockUserVocabularyMemoryV2.find).toHaveBeenCalledWith({
      user_id: new Types.ObjectId(userId),
      vocabulary_id: {
        $in: [new Types.ObjectId(newVocabularyId), reviewVocabularyId],
      },
    });
  });

  it("buildFlashcardSessionPreviewMetadata -> REVIEW_PENDING without memory -> ThrowsInvalidState", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId().toString();
    const cardStates = new Map<string, FlashcardSessionCardState>([
      [vocabularyId, { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
    ]);

    // Act
    const action = buildFlashcardSessionPreviewMetadata({
      userId,
      vocabularyIds: [vocabularyId],
      cardStates,
      now,
    });

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 409,
      message: "Review memory not found for preview",
    });
  });

  it("buildFlashcardSessionPreviewMetadata -> REVIEW_RESOLVED in active queue -> ThrowsInvalidState", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId().toString();
    const cardStates = new Map<string, FlashcardSessionCardState>([
      [vocabularyId, { phase: "REVIEW_RESOLVED", long_term_committed: true, repeat_count: 0 }],
    ]);

    // Act
    const action = buildFlashcardSessionPreviewMetadata({
      userId,
      vocabularyIds: [vocabularyId],
      cardStates,
      now,
    });

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 409,
      message: "Card state is invalid for active queue",
    });
  });

  it("buildFlashcardSessionPreviewMetadata -> NEW_GRADUATED in active queue -> ThrowsInvalidState", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId().toString();
    const cardStates = new Map<string, FlashcardSessionCardState>([
      [vocabularyId, { phase: "NEW_GRADUATED", long_term_committed: true, repeat_count: 0 }],
    ]);

    // Act
    const action = buildFlashcardSessionPreviewMetadata({
      userId,
      vocabularyIds: [vocabularyId],
      cardStates,
      now,
    });

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 409,
      message: "Card state is invalid for active queue",
    });
  });
});
