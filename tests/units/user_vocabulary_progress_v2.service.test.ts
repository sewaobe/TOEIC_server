import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUserVocabularyMemoryV2: any = {
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockFlashCardProgress: any = {
  distinct: jest.fn(),
};

const mockTopicVocabulary: any = {
  find: jest.fn(),
};

const mockVocabulary: any = {
  find: jest.fn(),
  findById: jest.fn(),
};

jest.mock("../../src/models/user_vocabulary_progress_v2.model", () => ({
  UserVocabularyMemoryV2: mockUserVocabularyMemoryV2,
}));

jest.mock("../../src/models/flashcard_progress.model", () => ({
  FlashCardProgress: mockFlashCardProgress,
}));

jest.mock("../../src/models/topic_vocabulary.model", () => ({
  TopicVocabulary: mockTopicVocabulary,
}));

jest.mock("../../src/models/vocabulary", () => ({
  Vocabulary: mockVocabulary,
}));

import {
  getSuggestedVocabulary,
  getTodayReviewSummary,
} from "../../src/services/user_vocabulary_progress_v2.service";

const userId = new Types.ObjectId();
const topicId = new Types.ObjectId();
const fixedNow = new Date("2026-05-23T05:00:00.000Z");
const overdueDueAt = new Date("2026-05-22T16:59:59.000Z");
const dueEarlierTodayAt = new Date("2026-05-23T04:00:00.000Z");
const upcomingTodayAt = new Date("2026-05-23T06:00:00.000Z");
const futureDueAt = new Date("2026-05-24T01:00:00.000Z");

const createLeanChain = (items: any[]) => ({
  lean: (jest.fn() as any).mockResolvedValue(items),
});

const createTopicFindChain = (items: any[]) => ({
  select: jest.fn().mockReturnValue({
    lean: (jest.fn() as any).mockResolvedValue(items),
  }),
});

const createMemory = (vocabularyId: Types.ObjectId, dueAt: Date, overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  user_id: userId,
  vocabulary_id: vocabularyId,
  difficulty: 6,
  half_life_days: 4,
  last_reviewed_at: new Date("2026-05-20T00:00:00.000Z"),
  due_at: dueAt,
  status: "reviewing",
  review_count: 2,
  session_count: 1,
  ...overrides,
});

const createVocabulary = (vocabularyId: Types.ObjectId, word: string) => ({
  _id: vocabularyId,
  word,
  phonetic: `/${word}/`,
  definition: `${word} definition`,
  type: "noun",
});

const arrangeCompletedTopicScope = (vocabularyIds: Types.ObjectId[]) => {
  mockFlashCardProgress.distinct.mockResolvedValue([topicId]);
  mockTopicVocabulary.find.mockReturnValue(
    createTopicFindChain([
      {
        _id: topicId,
        title: "Business",
        level: "A2",
        vocabularies_id: vocabularyIds,
      },
    ])
  );
};

const arrangeMemories = (memories: any[]) => {
  mockUserVocabularyMemoryV2.find.mockReturnValue(createLeanChain(memories));
};

const arrangeVocabularies = (vocabularies: any[]) => {
  mockVocabulary.find.mockReturnValue(createLeanChain(vocabularies));
};

describe("user vocabulary progress v2 service", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedNow);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("getTodayReviewSummary -> overdue memory -> counts overdue", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId();
    arrangeCompletedTopicScope([vocabularyId]);
    arrangeMemories([createMemory(vocabularyId, overdueDueAt)]);

    // Act
    const result = await getTodayReviewSummary(userId);

    // Assert
    expect(result).toEqual({
      total: 1,
      dueToday: 0,
      dueNow: 0,
      upcomingToday: 0,
      overdue: 1,
      primaryReviewCount: 0,
      overdueReviewCount: 1,
    });
  });

  it("getTodayReviewSummary -> due earlier today -> counts dueNow", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId();
    arrangeCompletedTopicScope([vocabularyId]);
    arrangeMemories([createMemory(vocabularyId, dueEarlierTodayAt)]);

    // Act
    const result = await getTodayReviewSummary(userId);

    // Assert
    expect(result).toEqual({
      total: 1,
      dueToday: 1,
      dueNow: 1,
      upcomingToday: 0,
      overdue: 0,
      primaryReviewCount: 1,
      overdueReviewCount: 0,
    });
  });

  it("getTodayReviewSummary -> due later today -> counts upcomingToday", async () => {
    // Arrange
    const vocabularyId = new Types.ObjectId();
    arrangeCompletedTopicScope([vocabularyId]);
    arrangeMemories([createMemory(vocabularyId, upcomingTodayAt)]);

    // Act
    const result = await getTodayReviewSummary(userId);

    // Assert
    expect(result).toEqual({
      total: 1,
      dueToday: 1,
      dueNow: 0,
      upcomingToday: 1,
      overdue: 0,
      primaryReviewCount: 0,
      overdueReviewCount: 0,
    });
  });

  it("getTodayReviewSummary -> mixed memories -> total equals overdue + dueNow + upcomingToday", async () => {
    // Arrange
    const overdueVocabularyId = new Types.ObjectId();
    const dueNowVocabularyId = new Types.ObjectId();
    const upcomingVocabularyId = new Types.ObjectId();
    const futureVocabularyId = new Types.ObjectId();
    const masteredVocabularyId = new Types.ObjectId();
    arrangeCompletedTopicScope([
      overdueVocabularyId,
      dueNowVocabularyId,
      upcomingVocabularyId,
      futureVocabularyId,
      masteredVocabularyId,
    ]);
    arrangeMemories([
      createMemory(overdueVocabularyId, overdueDueAt),
      createMemory(dueNowVocabularyId, dueEarlierTodayAt),
      createMemory(upcomingVocabularyId, upcomingTodayAt),
      createMemory(futureVocabularyId, futureDueAt),
      createMemory(masteredVocabularyId, dueEarlierTodayAt, { status: "mastered" }),
    ]);

    // Act
    const result = await getTodayReviewSummary(userId);

    // Assert
    expect(result.overdue).toBe(1);
    expect(result.dueNow).toBe(1);
    expect(result.upcomingToday).toBe(1);
    expect(result.dueToday).toBe(2);
    expect(result.total).toBe(result.overdue + result.dueNow + result.upcomingToday);
    expect(result.primaryReviewCount).toBe(result.dueNow);
    expect(result.overdueReviewCount).toBe(result.overdue);
  });

  it("getSuggestedVocabulary -> bucket due_now -> returns only currently due items", async () => {
    // Arrange
    const dueNowVocabularyId = new Types.ObjectId();
    const upcomingVocabularyId = new Types.ObjectId();
    arrangeCompletedTopicScope([dueNowVocabularyId, upcomingVocabularyId]);
    arrangeMemories([
      createMemory(dueNowVocabularyId, dueEarlierTodayAt),
      createMemory(upcomingVocabularyId, upcomingTodayAt),
    ]);
    arrangeVocabularies([
      createVocabulary(dueNowVocabularyId, "invoice"),
      createVocabulary(upcomingVocabularyId, "deadline"),
    ]);

    // Act
    const result = await getSuggestedVocabulary(userId, { bucket: "due_now" });

    // Assert
    expect(result.items).toHaveLength(1);
    expect(result.items[0].vocabularyId).toBe(String(dueNowVocabularyId));
    expect(result.counters.dueNow).toBe(1);
    expect(result.counters.upcomingToday).toBe(1);
    expect(result.counters.dueToday).toBe(2);
  });

  it("getSuggestedVocabulary -> bucket upcoming_today -> returns only later-today items", async () => {
    // Arrange
    const dueNowVocabularyId = new Types.ObjectId();
    const upcomingVocabularyId = new Types.ObjectId();
    arrangeCompletedTopicScope([dueNowVocabularyId, upcomingVocabularyId]);
    arrangeMemories([
      createMemory(dueNowVocabularyId, dueEarlierTodayAt),
      createMemory(upcomingVocabularyId, upcomingTodayAt),
    ]);
    arrangeVocabularies([
      createVocabulary(dueNowVocabularyId, "invoice"),
      createVocabulary(upcomingVocabularyId, "deadline"),
    ]);

    // Act
    const result = await getSuggestedVocabulary(userId, { bucket: "upcoming_today" });

    // Assert
    expect(result.items).toHaveLength(1);
    expect(result.items[0].vocabularyId).toBe(String(upcomingVocabularyId));
    expect(result.counters.dueNow).toBe(1);
    expect(result.counters.upcomingToday).toBe(1);
    expect(result.counters.dueToday).toBe(2);
  });
});
