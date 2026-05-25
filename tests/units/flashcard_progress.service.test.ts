import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

declare const require: any;
const { createHash } = require("crypto") as { createHash: any };

const mockSave = jest.fn() as any;
const mockMarkModified = jest.fn() as any;
const mockFlashCardProgress: any = Object.assign(
  jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: mockSave,
    markModified: mockMarkModified,
  })),
  {
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    distinct: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    updateOne: jest.fn(),
  }
);

const mockAttemptSave = jest.fn() as any;
const mockFlashCardAttempt: any = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
};

const mockIdempotencyRecord: any = {
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
};

const mockUserVocabularyMemoryV2: any = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
};

const mockVocabulary: any = {
  find: jest.fn(),
  findById: jest.fn(),
};

const mockTopicVocabulary: any = {
  find: jest.fn(),
};

const mockBuildFlashcardSessionPreviewMetadata = jest.fn() as any;
const mockBuildReviewReinforcementCardPreview = jest.fn() as any;

jest.mock("../../src/models/flashcard_progress.model", () => ({
  FlashCardProgress: mockFlashCardProgress,
}));

jest.mock("../../src/models", () => ({
  FlashCardAttempt: mockFlashCardAttempt,
}));

jest.mock("../../src/models/idempotency_record.model", () => ({
  IdempotencyRecord: mockIdempotencyRecord,
}));

jest.mock("../../src/models/user_vocabulary_progress_v2.model", () => ({
  UserVocabularyMemoryV2: mockUserVocabularyMemoryV2,
}));

jest.mock("../../src/models/vocabulary", () => ({
  Vocabulary: mockVocabulary,
}));

jest.mock("../../src/models/topic_vocabulary.model", () => ({
  TopicVocabulary: mockTopicVocabulary,
}));

jest.mock("../../src/services/flashcard_session_preview.service", () => ({
  SHORT_TERM_REPEAT_POLICIES: {
    vague: { ratio: 0.6, min: 2, max: 10 },
    unknown_or_forgot: { ratio: 0.25, min: 1, max: 5 },
  },
  buildFlashcardSessionPreviewMetadata: mockBuildFlashcardSessionPreviewMetadata,
  buildReviewReinforcementCardPreview: mockBuildReviewReinforcementCardPreview,
}));

import {
  answerFlashcardSessionService,
  __test__,
  createFlashcardSessionService,
  finalizeFlashcardSessionService,
  FlashcardAnswerInput,
  getAllSessionActiveByUserService,
  getSession,
  removeFlashcardSessionService,
  startSuggestionReviewSessionService,
} from "../../src/services/flashcard_progress.service";
import { SubmissionType } from "../../src/models/enums/SubmissionType";

const userId = new Types.ObjectId().toString();
const topicVocabularyId = new Types.ObjectId().toString();
const orderQueue = [new Types.ObjectId().toString(), new Types.ObjectId().toString()];
const previewMetadata = {
  repeat_policy: {},
  cards: {
    [orderQueue[0]]: { card_type: "NEW", options: { remember: { interval_days: 1 } } },
  },
};

const getPreviewPhase = (cardStates: any, vocabularyId: string) => {
  if (cardStates instanceof Map) return cardStates.get(vocabularyId)?.phase;
  if (cardStates && typeof cardStates.get === "function") return cardStates.get(vocabularyId)?.phase;
  return cardStates?.[vocabularyId]?.phase;
};

const getTestCardState = (cardStates: any, vocabularyId: string) => {
  if (cardStates instanceof Map) return cardStates.get(vocabularyId);
  if (cardStates && typeof cardStates.get === "function") return cardStates.get(vocabularyId);
  return cardStates?.[vocabularyId];
};

const createPreviewMetadataFromInput = (input: any) => ({
  repeat_policy: {},
  cards: Object.fromEntries(
    (input.vocabularyIds ?? []).map((vocabularyId: string) => {
      const phase = getPreviewPhase(input.cardStates, vocabularyId);
      const cardType =
        phase === "REVIEW_PENDING"
          ? "REVIEW"
          : phase === "REVIEW_REINFORCEMENT"
            ? "REVIEW_REINFORCEMENT"
            : "NEW";
      return [vocabularyId, { card_type: cardType, options: {} }];
    })
  ),
});

const createRecord = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  request_hash: expect.any(String),
  status: "processing",
  ...overrides,
});

const createExistingSession = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  session_id: "existing-session",
  user_id: new Types.ObjectId(userId),
  topic_vocabulary_id: new Types.ObjectId(topicVocabularyId),
  order_queue: [...orderQueue],
  current_index: 0,
  logs: [],
  card_states: new Map([
    [orderQueue[0], { phase: "NEW_LEARNING", long_term_committed: false, repeat_count: 0 }],
    [orderQueue[1], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
  ]),
  last_activity: new Date(),
  status: "active",
  archive_reason: undefined,
  save: mockSave,
  markModified: mockMarkModified,
  ...overrides,
});

const createAttempt = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  session_id: "existing-session",
  results: [],
  accuracy: 0,
  started_at: new Date(),
  finished_at: undefined,
  time_spent: undefined,
  save: mockAttemptSave,
  ...overrides,
});

const createFlashCardProgressFindChain = (items: any[]) => ({
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  lean: (jest.fn() as any).mockResolvedValue(items),
});

const createFlashCardProgressSelectChain = (items: any[]) => ({
  select: (jest.fn() as any).mockResolvedValue(items),
});

const createMemoryFindChain = (items: any[]) => ({
  select: jest.fn().mockReturnValue({
    lean: (jest.fn() as any).mockResolvedValue(items),
  }),
});

const createTopicVocabularyFindChain = (items: any[]) => ({
  select: jest.fn().mockReturnValue({
    lean: (jest.fn() as any).mockResolvedValue(items),
  }),
});

describe("flashcard progress service semantic flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    mockMarkModified.mockReturnValue(undefined);
    mockAttemptSave.mockResolvedValue(undefined);
    mockFlashCardProgress.findOne.mockResolvedValue(null);
    mockFlashCardProgress.distinct.mockResolvedValue([]);
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(null);
    mockFlashCardProgress.findById.mockResolvedValue(null);
    mockFlashCardProgress.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockFlashCardAttempt.findOne.mockResolvedValue(null);
    mockFlashCardAttempt.findById.mockResolvedValue(null);
    mockFlashCardAttempt.create.mockResolvedValue(createAttempt());
    mockFlashCardAttempt.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockIdempotencyRecord.findOne.mockResolvedValue(null);
    mockIdempotencyRecord.create.mockImplementation(async (data: any) => ({
      _id: new Types.ObjectId(),
      ...data,
    }));
    mockIdempotencyRecord.updateOne.mockResolvedValue({ acknowledged: true });
    mockBuildFlashcardSessionPreviewMetadata.mockResolvedValue(previewMetadata);
    mockBuildReviewReinforcementCardPreview.mockReturnValue({
      card_type: "REVIEW_REINFORCEMENT",
      options: { remember: { completion_text: "Hoàn tất lượt ôn" } },
    });
    mockUserVocabularyMemoryV2.find.mockReturnValue(createMemoryFindChain([]));
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(null);
    mockUserVocabularyMemoryV2.create.mockResolvedValue({});
    mockUserVocabularyMemoryV2.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockVocabulary.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: (jest.fn() as any).mockResolvedValue([]),
      }),
    });
    mockVocabulary.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: (jest.fn() as any).mockResolvedValue({ word: "alpha" }),
      }),
    });
    mockTopicVocabulary.find.mockReturnValue(createTopicVocabularyFindChain([]));
  });

  it("createFlashcardSessionService -> New session -> InitializesCardStates", async () => {
    // Arrange
    const idempotencyKey = "new-key";

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      idempotencyKey
    );

    // Assert
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        order_queue: orderQueue,
        card_states: {
          [orderQueue[0]]: {
            phase: "NEW_LEARNING",
            long_term_committed: false,
            repeat_count: 0,
          },
          [orderQueue[1]]: {
            phase: "NEW_LEARNING",
            long_term_committed: false,
            repeat_count: 0,
          },
        },
      })
    );
    expect(mockFlashCardAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: result.sessionId,
        submit_type: SubmissionType.PRACTICE,
        results: [],
      })
    );
  });

  it("createFlashcardSessionService -> existing memory due today -> initializes card as REVIEW_PENDING", async () => {
    // Arrange
    const idempotencyKey = "due-memory-key";
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() - 60 * 1000),
          last_reviewed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      ])
    );

    // Act
    await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      idempotencyKey
    );

    // Assert
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        card_states: expect.objectContaining({
          [orderQueue[0]]: {
            phase: "REVIEW_PENDING",
            long_term_committed: false,
            repeat_count: 0,
          },
          [orderQueue[1]]: {
            phase: "NEW_LEARNING",
            long_term_committed: false,
            repeat_count: 0,
          },
        }),
      })
    );
  });

  it("createFlashcardSessionService -> existing memory due in future -> initializes card as REVIEW_REINFORCEMENT", async () => {
    // Arrange
    const idempotencyKey = "future-memory-key";
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          last_reviewed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
      ])
    );

    // Act
    await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      idempotencyKey
    );

    // Assert
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        card_states: expect.objectContaining({
          [orderQueue[0]]: {
            phase: "REVIEW_REINFORCEMENT",
            long_term_committed: false,
            repeat_count: 0,
          },
        }),
      })
    );
  });

  it("createFlashcardSessionService -> existing memory already reviewed today -> initializes card as REVIEW_REINFORCEMENT", async () => {
    // Arrange
    const idempotencyKey = "reviewed-today-memory-key";
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() - 60 * 1000),
          last_reviewed_at: new Date(),
        },
      ])
    );

    // Act
    await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      idempotencyKey
    );

    // Assert
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        card_states: expect.objectContaining({
          [orderQueue[0]]: {
            phase: "REVIEW_REINFORCEMENT",
            long_term_committed: false,
            repeat_count: 0,
          },
        }),
      })
    );
  });

  it("getAllSessionActiveByUserService -> previous-day active sessions -> archives expired and excludes from result", async () => {
    // Arrange
    const previousDaySession = createExistingSession({
      last_activity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    const sameDaySession = createExistingSession({
      session_id: "same-day-session",
      topic_vocabulary_id: {
        _id: new Types.ObjectId(topicVocabularyId),
        title: "Daily topic",
        description: "Same day topic",
        isPublic: true,
      },
      logs: [{ vocab_id: orderQueue[0] }],
      last_activity: new Date(),
    });
    mockFlashCardProgress.find
      .mockReturnValueOnce(createFlashCardProgressSelectChain([previousDaySession]))
      .mockReturnValueOnce(createFlashCardProgressFindChain([sameDaySession]));
    mockFlashCardProgress.countDocuments.mockResolvedValue(1);

    // Act
    const result = await getAllSessionActiveByUserService(userId, 1, 9);

    // Assert
    expect(previousDaySession.status).toBe("archived");
    expect(previousDaySession.archive_reason).toBe("expired");
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockFlashCardProgress.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        status: "active",
        last_activity: expect.objectContaining({ $gte: expect.any(Date) }),
      })
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].session_id).toBe("same-day-session");
    expect(result.total).toBe(1);
  });

  it("getAllSessionActiveByUserService -> active quick review session -> excludes from result", async () => {
    // Arrange
    const quickReviewSession = createExistingSession({
      session_id: "quick-review-session",
      topic_vocabulary_id: undefined,
      source_type: "SUGGESTION_QUICK_REVIEW",
      source_label: "Ôn tập gợi ý",
    });
    mockFlashCardProgress.find
      .mockReturnValueOnce(createFlashCardProgressSelectChain([]))
      .mockReturnValueOnce(createFlashCardProgressFindChain([]));
    mockFlashCardProgress.countDocuments.mockResolvedValue(0);

    // Act
    const result = await getAllSessionActiveByUserService(userId, 1, 9);

    // Assert
    expect(mockFlashCardProgress.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        topic_vocabulary_id: { $exists: true, $ne: null },
        $or: [
          { source_type: { $exists: false } },
          { source_type: "TOPIC_PRACTICE" },
        ],
      })
    );
    expect(result.items).toEqual([]);
    expect(result.items).not.toContainEqual(quickReviewSession);
  });

  it("getSession -> previous-day active session -> archives expired and returns null progress", async () => {
    // Arrange
    const previousDaySession = createExistingSession({
      last_activity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(previousDaySession);

    // Act
    const result = await getSession(previousDaySession.session_id, userId);

    // Assert
    expect(previousDaySession.status).toBe("archived");
    expect(previousDaySession.archive_reason).toBe("expired");
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ progress: null });
    expect(mockBuildFlashcardSessionPreviewMetadata).not.toHaveBeenCalled();
  });

  it("getSession -> same-day active session -> returns progress", async () => {
    // Arrange
    const sameDaySession = createExistingSession({
      last_activity: new Date(),
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "NEW_LEARNING", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(sameDaySession);

    // Act
    const result = await getSession(sameDaySession.session_id, userId);

    // Assert
    expect(result.progress).toBe(sameDaySession);
    expect(result.preview_metadata).toBe(previewMetadata);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockBuildFlashcardSessionPreviewMetadata).toHaveBeenCalledWith({
      userId,
      vocabularyIds: sameDaySession.order_queue,
      cardStates: {
        [orderQueue[0]]: {
          phase: "NEW_LEARNING",
          long_term_committed: false,
          repeat_count: 0,
        },
      },
    });
  });

  it("createFlashcardSessionService -> previous-day active topic session -> archives old and creates new session", async () => {
    // Arrange
    const previousDaySession = createExistingSession({
      last_activity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(previousDaySession);

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "new-after-expired-key"
    );

    // Assert
    expect(previousDaySession.status).toBe("archived");
    expect(previousDaySession.archive_reason).toBe("expired");
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: new Types.ObjectId(userId),
        topic_vocabulary_id: new Types.ObjectId(topicVocabularyId),
        status: "active",
      })
    );
    expect(result.sessionId).not.toBe(previousDaySession.session_id);
    expect(result.newSession.status).toBe("active");
    expect(mockFlashCardAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: result.sessionId,
      })
    );
  });

  it("createFlashcardSessionService -> same-day active topic session -> returns existing session", async () => {
    // Arrange
    const sameDaySession = createExistingSession({ last_activity: new Date() });
    mockFlashCardProgress.findOne.mockResolvedValue(sameDaySession);

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "same-day-existing-key"
    );

    // Assert
    expect(result.sessionId).toBe(sameDaySession.session_id);
    expect(result.newSession).toBe(sameDaySession);
    expect(mockFlashCardProgress).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockFlashCardAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: sameDaySession.session_id,
      })
    );
  });

  it("startSuggestionReviewSessionService -> due_now mode -> creates quick review session", async () => {
    // Arrange
    mockFlashCardProgress.distinct.mockResolvedValue([new Types.ObjectId(topicVocabularyId)]);
    mockTopicVocabulary.find.mockReturnValue(
      createTopicVocabularyFindChain([
        {
          _id: new Types.ObjectId(topicVocabularyId),
          vocabularies_id: [new Types.ObjectId(orderQueue[0]), new Types.ObjectId(orderQueue[1])],
        },
      ])
    );
    mockUserVocabularyMemoryV2.find
      .mockReturnValueOnce(
        createMemoryFindChain([
          {
            vocabulary_id: new Types.ObjectId(orderQueue[0]),
            due_at: new Date(Date.now() - 60 * 1000),
            last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
            status: "reviewing",
          },
        ])
      )
      .mockReturnValueOnce(
        createMemoryFindChain([
          {
            vocabulary_id: new Types.ObjectId(orderQueue[0]),
            due_at: new Date(Date.now() - 60 * 1000),
            last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        ])
      );

    // Act
    const result = await startSuggestionReviewSessionService(userId, { mode: "due_now" });

    // Assert
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: "SUGGESTION_QUICK_REVIEW",
        source_label: "Ôn tập gợi ý",
        order_queue: [orderQueue[0]],
      })
    );
    expect(mockFlashCardAttempt.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        topic_vocabulary_id: expect.anything(),
      })
    );
    expect(result.sessionId).toEqual(expect.any(String));
    expect(result.preview_metadata).toBe(previewMetadata);
  });

  it("startSuggestionReviewSessionService -> overdue mode -> creates quick review session", async () => {
    // Arrange
    mockFlashCardProgress.distinct.mockResolvedValue([new Types.ObjectId(topicVocabularyId)]);
    mockTopicVocabulary.find.mockReturnValue(
      createTopicVocabularyFindChain([
        {
          _id: new Types.ObjectId(topicVocabularyId),
          vocabularies_id: [new Types.ObjectId(orderQueue[0])],
        },
      ])
    );
    mockUserVocabularyMemoryV2.find
      .mockReturnValueOnce(
        createMemoryFindChain([
          {
            vocabulary_id: new Types.ObjectId(orderQueue[0]),
            due_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
            last_reviewed_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
            status: "reviewing",
          },
        ])
      )
      .mockReturnValueOnce(
        createMemoryFindChain([
          {
            vocabulary_id: new Types.ObjectId(orderQueue[0]),
            due_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
            last_reviewed_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
          },
        ])
      );

    // Act
    const result = await startSuggestionReviewSessionService(userId, { mode: "overdue" });

    // Assert
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: "SUGGESTION_QUICK_REVIEW",
        order_queue: [orderQueue[0]],
      })
    );
    expect(result.sessionId).toEqual(expect.any(String));
  });

  it("startSuggestionReviewSessionService -> custom outside learned scope -> rejects with 400", async () => {
    // Arrange
    mockFlashCardProgress.distinct.mockResolvedValue([new Types.ObjectId(topicVocabularyId)]);
    mockTopicVocabulary.find.mockReturnValue(
      createTopicVocabularyFindChain([
        {
          _id: new Types.ObjectId(topicVocabularyId),
          vocabularies_id: [new Types.ObjectId(orderQueue[0])],
        },
      ])
    );

    // Act
    const action = startSuggestionReviewSessionService(userId, {
      mode: "custom",
      vocabulary_ids: [orderQueue[1]],
    });

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 400,
      message: "No vocabulary available for suggestion review",
    });
    expect(mockFlashCardProgress).not.toHaveBeenCalled();
  });

  it("startSuggestionReviewSessionService -> single outside learned scope -> rejects with 400", async () => {
    // Arrange
    mockFlashCardProgress.distinct.mockResolvedValue([new Types.ObjectId(topicVocabularyId)]);
    mockTopicVocabulary.find.mockReturnValue(
      createTopicVocabularyFindChain([
        {
          _id: new Types.ObjectId(topicVocabularyId),
          vocabularies_id: [new Types.ObjectId(orderQueue[0])],
        },
      ])
    );

    // Act
    const action = startSuggestionReviewSessionService(userId, {
      mode: "single",
      vocabulary_ids: [orderQueue[1]],
    });

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 400,
      message: "No vocabulary available for suggestion review",
    });
    expect(mockFlashCardProgress).not.toHaveBeenCalled();
  });

  it("getCompletedTopicPracticeVocabularyScope -> topicless quick review sessions -> ignored", async () => {
    // Arrange
    mockFlashCardProgress.distinct.mockResolvedValue([new Types.ObjectId(topicVocabularyId)]);
    mockTopicVocabulary.find.mockReturnValue(
      createTopicVocabularyFindChain([
        {
          _id: new Types.ObjectId(topicVocabularyId),
          vocabularies_id: [new Types.ObjectId(orderQueue[0])],
        },
      ])
    );

    // Act
    const result = await __test__.getCompletedTopicPracticeVocabularyScope(new Types.ObjectId(userId));

    // Assert
    expect(mockFlashCardProgress.distinct).toHaveBeenCalledWith(
      "topic_vocabulary_id",
      expect.objectContaining({
        topic_vocabulary_id: { $exists: true, $ne: null },
        $or: [
          { source_type: { $exists: false } },
          { source_type: "TOPIC_PRACTICE" },
        ],
      })
    );
    expect(result.vocabularyIdSet.has(orderQueue[0])).toBe(true);
  });

  it("answerFlashcardSessionService -> previous-day active session -> archives expired and rejects answer", async () => {
    // Arrange
    const previousDaySession = createExistingSession({
      last_activity: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(previousDaySession);

    // Act
    const action = answerFlashcardSessionService(
      userId,
      previousDaySession.session_id,
      {
        vocabulary_id: orderQueue[0],
        action: "remember",
        response_time: 1200,
        attempted_at: "2026-05-18T10:00:00.000Z",
      },
      "expired-answer-key"
    );

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 409,
      message: "Flashcard session has expired. Please start a new session.",
    });
    expect(previousDaySession.status).toBe("archived");
    expect(previousDaySession.archive_reason).toBe("expired");
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockFlashCardAttempt.findOne).not.toHaveBeenCalled();
    expect(mockFlashCardAttempt.updateOne).not.toHaveBeenCalled();
    expect(mockUserVocabularyMemoryV2.create).not.toHaveBeenCalled();
    expect(mockUserVocabularyMemoryV2.updateOne).not.toHaveBeenCalled();
    expect(mockVocabulary.findById).not.toHaveBeenCalled();
    expect(mockFlashCardProgress.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockIdempotencyRecord.updateOne).not.toHaveBeenCalled();
  });

  it("removeFlashcardSessionService -> already archived expired session -> does not overwrite archive reason", async () => {
    // Arrange
    const expiredSession = createExistingSession({
      status: "archived",
      archive_reason: "expired",
    });
    mockFlashCardProgress.findOne.mockResolvedValue(expiredSession);

    // Act
    const result = await removeFlashcardSessionService(expiredSession.session_id, userId);

    // Assert
    expect(result).toBe(expiredSession);
    expect(expiredSession.status).toBe("archived");
    expect(expiredSession.archive_reason).toBe("expired");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("getSession -> Outdated active progress -> Throws409OutdatedSession", async () => {
    // Arrange
    const outdatedSession = createExistingSession({ card_states: undefined });
    mockFlashCardProgress.findOne.mockResolvedValue(outdatedSession);

    // Act
    const action = getSession(outdatedSession.session_id, userId);

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 409,
      message: "Flashcard session is outdated. Please start a new session.",
    });
  });

  it("normalizeStaleReviewPendingCards -> stale REVIEW_PENDING reviewed today -> returns snapshot REVIEW_REINFORCEMENT", async () => {
    // Arrange
    const session = createExistingSession({
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() - 60 * 1000),
          last_reviewed_at: new Date(),
        },
      ])
    );

    // Act
    const result = await __test__.normalizeStaleReviewPendingCards(userId, session);

    // Assert
    expect(result.cardStates[orderQueue[0]]).toEqual({
      phase: "REVIEW_REINFORCEMENT",
      long_term_committed: false,
      repeat_count: 0,
    });
    expect(mockFlashCardProgress.updateOne).toHaveBeenCalledWith(
      { _id: session._id },
      {
        $set: {
          [`card_states.${orderQueue[0]}.phase`]: "REVIEW_REINFORCEMENT",
          [`card_states.${orderQueue[0]}.long_term_committed`]: false,
          [`card_states.${orderQueue[0]}.repeat_count`]: 0,
        },
      }
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("getSession -> stale REVIEW_PENDING reviewed today -> returns REVIEW_REINFORCEMENT progress and preview", async () => {
    // Arrange
    const session = createExistingSession({
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(session);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() - 60 * 1000),
          last_reviewed_at: new Date(),
        },
      ])
    );
    mockBuildFlashcardSessionPreviewMetadata.mockImplementationOnce(async (input: any) =>
      createPreviewMetadataFromInput(input)
    );

    // Act
    const result = await getSession(session.session_id, userId);

    // Assert
    expect(getTestCardState(result.progress?.card_states, orderQueue[0])).toEqual({
      phase: "REVIEW_REINFORCEMENT",
      long_term_committed: false,
      repeat_count: 0,
    });
    expect(result.preview_metadata?.cards[orderQueue[0]].card_type).toBe("REVIEW_REINFORCEMENT");
    expect(mockBuildFlashcardSessionPreviewMetadata).toHaveBeenCalledWith({
      userId,
      vocabularyIds: session.order_queue,
      cardStates: expect.objectContaining({
        [orderQueue[0]]: expect.objectContaining({ phase: "REVIEW_REINFORCEMENT" }),
      }),
    });
    expect(mockFlashCardProgress.updateOne).toHaveBeenCalledWith(
      { _id: session._id },
      {
        $set: {
          [`card_states.${orderQueue[0]}.phase`]: "REVIEW_REINFORCEMENT",
          [`card_states.${orderQueue[0]}.long_term_committed`]: false,
          [`card_states.${orderQueue[0]}.repeat_count`]: 0,
        },
      }
    );
    expect(mockMarkModified).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(result.progress).toBe(session);
  });

  it("getSession -> stale REVIEW_PENDING due in future -> normalizes to REVIEW_REINFORCEMENT", async () => {
    // Arrange
    const session = createExistingSession({
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(session);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() + 60 * 1000),
          last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ])
    );
    mockBuildFlashcardSessionPreviewMetadata.mockImplementationOnce(async (input: any) =>
      createPreviewMetadataFromInput(input)
    );

    // Act
    const result = await getSession(session.session_id, userId);

    // Assert
    expect(getTestCardState(session.card_states, orderQueue[0])).toEqual({
      phase: "REVIEW_REINFORCEMENT",
      long_term_committed: false,
      repeat_count: 0,
    });
    expect(result.preview_metadata?.cards[orderQueue[0]].card_type).toBe("REVIEW_REINFORCEMENT");
    expect(mockFlashCardProgress.updateOne).toHaveBeenCalledWith(
      { _id: session._id },
      {
        $set: {
          [`card_states.${orderQueue[0]}.phase`]: "REVIEW_REINFORCEMENT",
          [`card_states.${orderQueue[0]}.long_term_committed`]: false,
          [`card_states.${orderQueue[0]}.repeat_count`]: 0,
        },
      }
    );
    expect(mockMarkModified).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(result.progress).toBe(session);
  });

  it("getSession -> eligible REVIEW_PENDING due now -> remains REVIEW_PENDING preview REVIEW", async () => {
    // Arrange
    const session = createExistingSession({
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(session);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() - 60 * 1000),
          last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ])
    );
    mockBuildFlashcardSessionPreviewMetadata.mockImplementationOnce(async (input: any) =>
      createPreviewMetadataFromInput(input)
    );

    // Act
    const result = await getSession(session.session_id, userId);

    // Assert
    expect(session.card_states.get(orderQueue[0])).toEqual({
      phase: "REVIEW_PENDING",
      long_term_committed: false,
      repeat_count: 0,
    });
    expect(result.preview_metadata?.cards[orderQueue[0]].card_type).toBe("REVIEW");
    expect(mockMarkModified).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockFlashCardProgress.updateOne).not.toHaveBeenCalled();
    expect(result.progress).toBe(session);
  });

  it("getSession -> REVIEW_REINFORCEMENT due now -> normalizes to REVIEW_PENDING progress and preview", async () => {
    // Arrange
    const session = createExistingSession({
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "REVIEW_REINFORCEMENT", long_term_committed: false, repeat_count: 2 }],
      ]),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(session);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() - 60 * 1000),
          last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ])
    );
    mockBuildFlashcardSessionPreviewMetadata.mockImplementationOnce(async (input: any) =>
      createPreviewMetadataFromInput(input)
    );

    // Act
    const result = await getSession(session.session_id, userId);

    // Assert
    expect(getTestCardState(result.progress?.card_states, orderQueue[0])).toEqual({
      phase: "REVIEW_PENDING",
      long_term_committed: false,
      repeat_count: 2,
    });
    expect(result.preview_metadata?.cards[orderQueue[0]].card_type).toBe("REVIEW");
    expect(mockBuildFlashcardSessionPreviewMetadata).toHaveBeenCalledWith({
      userId,
      vocabularyIds: session.order_queue,
      cardStates: expect.objectContaining({
        [orderQueue[0]]: expect.objectContaining({ phase: "REVIEW_PENDING" }),
      }),
    });
    expect(mockFlashCardProgress.updateOne).toHaveBeenCalledWith(
      { _id: session._id },
      {
        $set: {
          [`card_states.${orderQueue[0]}.phase`]: "REVIEW_PENDING",
          [`card_states.${orderQueue[0]}.long_term_committed`]: false,
          [`card_states.${orderQueue[0]}.repeat_count`]: 2,
        },
      }
    );
  });

  it("getSession -> REVIEW_REINFORCEMENT not due -> remains REVIEW_REINFORCEMENT", async () => {
    // Arrange
    const session = createExistingSession({
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "REVIEW_REINFORCEMENT", long_term_committed: false, repeat_count: 1 }],
      ]),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(session);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() + 60 * 1000),
          last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ])
    );
    mockBuildFlashcardSessionPreviewMetadata.mockImplementationOnce(async (input: any) =>
      createPreviewMetadataFromInput(input)
    );

    // Act
    const result = await getSession(session.session_id, userId);

    // Assert
    expect(getTestCardState(result.progress?.card_states, orderQueue[0])).toEqual({
      phase: "REVIEW_REINFORCEMENT",
      long_term_committed: false,
      repeat_count: 1,
    });
    expect(result.preview_metadata?.cards[orderQueue[0]].card_type).toBe("REVIEW_REINFORCEMENT");
    expect(mockFlashCardProgress.updateOne).not.toHaveBeenCalled();
  });

  it("getSession -> REVIEW_RESOLVED due now -> remains REVIEW_RESOLVED", async () => {
    // Arrange
    const session = createExistingSession({
      order_queue: [orderQueue[0]],
      card_states: new Map([
        [orderQueue[0], { phase: "REVIEW_RESOLVED", long_term_committed: true, repeat_count: 0 }],
      ]),
    });
    mockFlashCardProgress.findOne.mockResolvedValue(session);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          due_at: new Date(Date.now() - 60 * 1000),
          last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ])
    );

    // Act
    const result = await getSession(session.session_id, userId);

    // Assert
    expect(getTestCardState(result.progress?.card_states, orderQueue[0])).toEqual({
      phase: "REVIEW_RESOLVED",
      long_term_committed: true,
      repeat_count: 0,
    });
    expect(mockFlashCardProgress.updateOne).not.toHaveBeenCalled();
  });

  it("answerFlashcardSessionService -> New card remember -> AppendsAttemptCreatesMemoryAndCompletesRecord", async () => {
    // Arrange
    const progress = createExistingSession({ order_queue: [...orderQueue] });
    const attempt = createAttempt({ results: [] });
    const attemptWithResults = createAttempt({
      _id: attempt._id,
      results: [
        {
          answer_event_id: "answer-key-1",
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          action: "remember",
          response_time: 1200,
          attempted_at: new Date("2026-05-18T10:00:00.000Z"),
        },
      ],
    });
    const updatedProgress = createExistingSession({
      order_queue: [orderQueue[1]],
      logs: [
        {
          answer_event_id: "answer-key-1",
          vocab_id: orderQueue[0],
          vocab_word: "alpha",
          action: "remember",
          response_time: 1200,
          attempted_at: "2026-05-18T10:00:00.000Z",
        },
      ],
      card_states: new Map([
        [orderQueue[0], { phase: "NEW_GRADUATED", long_term_committed: true, repeat_count: 0 }],
        [orderQueue[1], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
      ]),
      last_processed_answer_event_id: "answer-key-1",
    });
    mockFlashCardProgress.findOne.mockResolvedValue(progress);
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(updatedProgress);
    mockFlashCardAttempt.findOne.mockResolvedValue(attempt);
    mockFlashCardAttempt.findById.mockResolvedValue(attemptWithResults);

    // Act
    const result = (await answerFlashcardSessionService(
      userId,
      progress.session_id,
      {
        vocabulary_id: orderQueue[0],
        action: "remember",
        response_time: 1200,
        attempted_at: "2026-05-18T10:00:00.000Z",
      },
      "answer-key-1"
    )) as any;

    // Assert
    expect(mockFlashCardAttempt.updateOne).toHaveBeenCalledWith(
      {
        _id: attempt._id,
        "results.answer_event_id": { $ne: "answer-key-1" },
      },
      expect.objectContaining({
        $push: {
          results: expect.objectContaining({
            answer_event_id: "answer-key-1",
            action: "remember",
            response_time: 1200,
          }),
        },
      })
    );
    expect(mockUserVocabularyMemoryV2.create).toHaveBeenCalledWith(
      expect.objectContaining({
        last_remember_count: 1,
        last_vague_count: 0,
        last_unknown_count: 0,
        last_forgot_count: 0,
        last_flashcard_answer_event_id: "answer-key-1",
      })
    );
    expect(result.progress.order_queue).toEqual([orderQueue[1]]);
    expect(result.progress.logs).toEqual([
      expect.objectContaining({
        answer_event_id: "answer-key-1",
        action: "remember",
        vocab_word: "alpha",
      }),
    ]);
    expect(result.preview_metadata_patch).toBeNull();
    expect(mockIdempotencyRecord.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Types.ObjectId) },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "completed",
        }),
      })
    );
  });

  it("answerFlashcardSessionService -> Review pending forgot -> ReturnsReinforcementPreviewPatch", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      difficulty: 5,
      half_life_days: 3,
      last_reviewed_at: new Date("2026-05-01T00:00:00.000Z"),
      due_at: new Date("2026-05-17T00:00:00.000Z"),
      review_count: 1,
      session_count: 1,
    };
    const progress = createExistingSession({
      order_queue: [orderQueue[1]],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    const updatedProgress = createExistingSession({
      order_queue: [orderQueue[1]],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_REINFORCEMENT", long_term_committed: true, repeat_count: 1 }],
      ]),
      logs: [
        {
          answer_event_id: "answer-key-2",
          vocab_id: orderQueue[1],
          vocab_word: "alpha",
          action: "forgot",
          response_time: 2300,
          attempted_at: "2026-05-18T10:00:00.000Z",
        },
      ],
      last_processed_answer_event_id: "answer-key-2",
    });
    const attempt = createAttempt({ results: [] });
    mockFlashCardProgress.findOne.mockResolvedValue(progress);
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(updatedProgress);
    mockFlashCardAttempt.findOne.mockResolvedValue(attempt);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[1]),
          due_at: memory.due_at,
          last_reviewed_at: memory.last_reviewed_at,
        },
      ])
    );
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(memory);

    // Act
    const result = (await answerFlashcardSessionService(
      userId,
      progress.session_id,
      {
        vocabulary_id: orderQueue[1],
        action: "forgot",
        response_time: 2300,
        attempted_at: "2026-05-18T10:00:00.000Z",
      },
      "answer-key-2"
    )) as any;

    // Assert
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledWith(
      {
        _id: memory._id,
        last_flashcard_answer_event_id: { $ne: "answer-key-2" },
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          last_forgot_count: 1,
          last_flashcard_answer_event_id: "answer-key-2",
        }),
        $inc: { session_count: 1, review_count: 1 },
      })
    );
    expect(result.progress.card_states.get(orderQueue[1])).toEqual({
      phase: "REVIEW_REINFORCEMENT",
      long_term_committed: true,
      repeat_count: 1,
    });
    expect(result.preview_metadata_patch).toEqual({
      cards: {
        [orderQueue[1]]: {
          card_type: "REVIEW_REINFORCEMENT",
          options: { remember: { completion_text: "Hoàn tất lượt ôn" } },
        },
      },
    });
  });

  it("answerFlashcardSessionService -> Same idempotency key retry after progress already processed -> ReturnsRecoveredResponse", async () => {
    // Arrange
    const vocabularyId = orderQueue[0];
    const answerEventId = "answer-key-retry";
    const progress = createExistingSession({
      order_queue: [orderQueue[1]],
      card_states: new Map([
        [vocabularyId, { phase: "REVIEW_REINFORCEMENT", long_term_committed: true, repeat_count: 1 }],
      ]),
      last_processed_answer_event_id: answerEventId,
    });
    const body: FlashcardAnswerInput = {
      vocabulary_id: vocabularyId,
      action: "forgot",
      response_time: 900,
      attempted_at: "2026-05-18T10:00:00.000Z",
    };
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ sessionId: progress.session_id, body }))
      .digest("hex");
    const record = {
      _id: new Types.ObjectId(),
      request_hash: requestHash,
      status: "processing",
    };

    mockIdempotencyRecord.findOne.mockResolvedValue(record);
    mockFlashCardProgress.findOne.mockResolvedValue(progress);

    // Act
    const result = (await answerFlashcardSessionService(
      userId,
      progress.session_id,
      body,
      answerEventId
    )) as any;

    // Assert
    expect(result.progress).toBe(progress);
    expect(result.preview_metadata_patch).toEqual({
      cards: {
        [vocabularyId]: {
          card_type: "REVIEW_REINFORCEMENT",
          options: { remember: { completion_text: "Hoàn tất lượt ôn" } },
        },
      },
    });
    expect(mockFlashCardAttempt.findOne).not.toHaveBeenCalled();
    expect(mockFlashCardProgress.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockIdempotencyRecord.updateOne).toHaveBeenCalledWith(
      { _id: record._id },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "completed",
        }),
      })
    );
  });

  it("answerFlashcardSessionService -> stale REVIEW_PENDING reviewed today before answer -> treats as REVIEW_REINFORCEMENT", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      difficulty: 5,
      half_life_days: 3,
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      last_reviewed_at: new Date(),
    };
    const progress = createExistingSession({
      order_queue: [orderQueue[1]],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    const updatedProgress = createExistingSession({
      order_queue: [],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_RESOLVED", long_term_committed: false, repeat_count: 0 }],
      ]),
      logs: [
        {
          answer_event_id: "answer-key-stale-reviewed-today",
          vocab_id: orderQueue[1],
          vocab_word: "alpha",
          action: "remember",
          response_time: 1500,
          attempted_at: "2026-05-18T10:00:00.000Z",
        },
      ],
      last_processed_answer_event_id: "answer-key-stale-reviewed-today",
    });
    const attempt = createAttempt({ results: [] });
    mockFlashCardProgress.findOne.mockResolvedValue(progress);
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(updatedProgress);
    mockFlashCardAttempt.findOne.mockResolvedValue(attempt);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[1]),
          due_at: memory.due_at,
          last_reviewed_at: memory.last_reviewed_at,
        },
      ])
    );
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(memory);

    // Act
    const result = (await answerFlashcardSessionService(
      userId,
      progress.session_id,
      {
        vocabulary_id: orderQueue[1],
        action: "remember",
        response_time: 1500,
        attempted_at: "2026-05-18T10:00:00.000Z",
      },
      "answer-key-stale-reviewed-today"
    )) as any;

    // Assert
    expect(getTestCardState(progress.card_states, orderQueue[1])).toEqual({
      phase: "REVIEW_REINFORCEMENT",
      long_term_committed: false,
      repeat_count: 0,
    });
    expect(mockFlashCardProgress.updateOne).toHaveBeenCalledWith(
      { _id: progress._id },
      {
        $set: {
          [`card_states.${orderQueue[1]}.phase`]: "REVIEW_REINFORCEMENT",
          [`card_states.${orderQueue[1]}.long_term_committed`]: false,
          [`card_states.${orderQueue[1]}.repeat_count`]: 0,
        },
      }
    );
    expect(mockMarkModified).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledTimes(1);
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledWith(
      {
        user_id: new Types.ObjectId(userId),
        vocabulary_id: new Types.ObjectId(orderQueue[1]),
        last_flashcard_answer_event_id: { $ne: "answer-key-stale-reviewed-today" },
      },
      {
        $inc: { review_count: 1 },
        $set: { last_flashcard_answer_event_id: "answer-key-stale-reviewed-today" },
      }
    );
    const memoryUpdate = mockUserVocabularyMemoryV2.updateOne.mock.calls[0][1];
    expect(memoryUpdate.$set).not.toHaveProperty("due_at");
    expect(memoryUpdate.$set).not.toHaveProperty("half_life_days");
    expect(memoryUpdate.$set).not.toHaveProperty("difficulty");
    expect(memoryUpdate.$set).not.toHaveProperty("last_reviewed_at");
    expect(result.progress.card_states.get(orderQueue[1])).toEqual({
      phase: "REVIEW_RESOLVED",
      long_term_committed: false,
      repeat_count: 0,
    });
    expect(result.preview_metadata_patch).toBeNull();
  });

  it("answerFlashcardSessionService -> REVIEW_REINFORCEMENT becomes due before answer -> treats as REVIEW_PENDING", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      difficulty: 5,
      half_life_days: 3,
      last_reviewed_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
      due_at: new Date(Date.now() - 60 * 1000),
      review_count: 1,
      session_count: 1,
    };
    const progress = createExistingSession({
      order_queue: [orderQueue[1]],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_REINFORCEMENT", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    const updatedProgress = createExistingSession({
      order_queue: [],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_RESOLVED", long_term_committed: true, repeat_count: 0 }],
      ]),
      logs: [
        {
          answer_event_id: "answer-key-reinforcement-due",
          vocab_id: orderQueue[1],
          vocab_word: "alpha",
          action: "remember",
          response_time: 1500,
          attempted_at: "2026-05-18T10:00:00.000Z",
        },
      ],
      last_processed_answer_event_id: "answer-key-reinforcement-due",
    });
    const attempt = createAttempt({ results: [] });
    mockFlashCardProgress.findOne.mockResolvedValue(progress);
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(updatedProgress);
    mockFlashCardAttempt.findOne.mockResolvedValue(attempt);
    mockUserVocabularyMemoryV2.find.mockReturnValue(
      createMemoryFindChain([
        {
          vocabulary_id: new Types.ObjectId(orderQueue[1]),
          due_at: memory.due_at,
          last_reviewed_at: memory.last_reviewed_at,
        },
      ])
    );
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(memory);

    // Act
    const result = (await answerFlashcardSessionService(
      userId,
      progress.session_id,
      {
        vocabulary_id: orderQueue[1],
        action: "remember",
        response_time: 1500,
        attempted_at: "2026-05-18T10:00:00.000Z",
      },
      "answer-key-reinforcement-due"
    )) as any;

    // Assert
    expect(getTestCardState(progress.card_states, orderQueue[1])).toEqual({
      phase: "REVIEW_PENDING",
      long_term_committed: false,
      repeat_count: 0,
    });
    expect(mockFlashCardProgress.updateOne).toHaveBeenCalledWith(
      { _id: progress._id },
      {
        $set: {
          [`card_states.${orderQueue[1]}.phase`]: "REVIEW_PENDING",
          [`card_states.${orderQueue[1]}.long_term_committed`]: false,
          [`card_states.${orderQueue[1]}.repeat_count`]: 0,
        },
      }
    );
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledTimes(1);
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledWith(
      {
        _id: memory._id,
        last_flashcard_answer_event_id: { $ne: "answer-key-reinforcement-due" },
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          last_reviewed_at: expect.any(Date),
          due_at: expect.any(Date),
          last_flashcard_answer_event_id: "answer-key-reinforcement-due",
        }),
        $inc: { session_count: 1, review_count: 1 },
      })
    );
    expect(result.progress.card_states.get(orderQueue[1])).toEqual({
      phase: "REVIEW_RESOLVED",
      long_term_committed: true,
      repeat_count: 0,
    });
    expect(result.preview_metadata_patch).toBeNull();
  });

  it("answerFlashcardSessionService -> non-due review reinforcement answer -> does not update long-term memory fields", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      difficulty: 5,
      half_life_days: 3,
      due_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      last_reviewed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    };
    const progress = createExistingSession({
      order_queue: [orderQueue[1]],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_REINFORCEMENT", long_term_committed: false, repeat_count: 0 }],
      ]),
    });
    const updatedProgress = createExistingSession({
      order_queue: [],
      card_states: new Map([
        [orderQueue[1], { phase: "REVIEW_RESOLVED", long_term_committed: false, repeat_count: 0 }],
      ]),
      logs: [
        {
          answer_event_id: "answer-key-reinforcement",
          vocab_id: orderQueue[1],
          vocab_word: "alpha",
          action: "remember",
          response_time: 1500,
          attempted_at: "2026-05-18T10:00:00.000Z",
        },
      ],
      last_processed_answer_event_id: "answer-key-reinforcement",
    });
    const attempt = createAttempt({ results: [] });
    mockFlashCardProgress.findOne.mockResolvedValue(progress);
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(updatedProgress);
    mockFlashCardAttempt.findOne.mockResolvedValue(attempt);
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(memory);

    // Act
    const result = (await answerFlashcardSessionService(
      userId,
      progress.session_id,
      {
        vocabulary_id: orderQueue[1],
        action: "remember",
        response_time: 1500,
        attempted_at: "2026-05-18T10:00:00.000Z",
      },
      "answer-key-reinforcement"
    )) as any;

    // Assert
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledWith(
      {
        user_id: new Types.ObjectId(userId),
        vocabulary_id: new Types.ObjectId(orderQueue[1]),
        last_flashcard_answer_event_id: { $ne: "answer-key-reinforcement" },
      },
      {
        $inc: { review_count: 1 },
        $set: { last_flashcard_answer_event_id: "answer-key-reinforcement" },
      }
    );
    const memoryUpdate = mockUserVocabularyMemoryV2.updateOne.mock.calls[0][1];
    expect(memoryUpdate.$set).not.toHaveProperty("due_at");
    expect(memoryUpdate.$set).not.toHaveProperty("half_life_days");
    expect(memoryUpdate.$set).not.toHaveProperty("difficulty");
    expect(memoryUpdate.$set).not.toHaveProperty("last_reviewed_at");
    expect(result.preview_metadata_patch).toBeNull();
  });

  it("appendAttemptResultIfNeeded -> Same answer_event_id already exists -> DoesNotAppendDuplicateResult", async () => {
    // Arrange
    mockFlashCardAttempt.updateOne.mockResolvedValue({ modifiedCount: 0 });

    // Act
    const appended = await __test__.appendAttemptResultIfNeeded({
      attemptId: new Types.ObjectId(),
      answerEventId: "answer-key-dup",
      vocabularyId: new Types.ObjectId().toString(),
      action: "remember",
      responseTime: 1000,
      attemptedAt: new Date("2026-05-18T10:00:00.000Z"),
    });

    // Assert
    expect(appended).toBe(false);
    expect(mockFlashCardAttempt.updateOne).toHaveBeenCalledWith(
      {
        _id: expect.any(Types.ObjectId),
        "results.answer_event_id": { $ne: "answer-key-dup" },
      },
      expect.objectContaining({
        $push: {
          results: expect.objectContaining({
            answer_event_id: "answer-key-dup",
          }),
        },
      })
    );
  });

  it("mutateProgressForAnswer -> Same answer_event_id already processed -> ReturnsPersistedProgress", async () => {
    // Arrange
    const vocabularyId = orderQueue[0];
    const progress = createExistingSession({ order_queue: [vocabularyId, orderQueue[1]] });
    const persisted = createExistingSession({
      _id: progress._id,
      order_queue: [orderQueue[1]],
      logs: [
        {
          answer_event_id: "answer-key-3",
          vocab_id: vocabularyId,
          vocab_word: "alpha",
          action: "remember",
          response_time: 800,
          attempted_at: "2026-05-18T10:00:00.000Z",
        },
      ],
      last_processed_answer_event_id: "answer-key-3",
    });
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(null);
    mockFlashCardProgress.findById.mockResolvedValue(persisted);

    // Act
    const result = await __test__.mutateProgressForAnswer({
      progress: progress as any,
      vocabularyId,
      vocabularyWord: "alpha",
      action: "remember",
      responseTime: 800,
      attemptedAt: new Date("2026-05-18T10:00:00.000Z"),
      answerEventId: "answer-key-3",
      nextState: { phase: "NEW_GRADUATED", long_term_committed: true, repeat_count: 0 },
      processedAt: new Date("2026-05-18T10:00:01.000Z"),
    });

    // Assert
    expect(result).toBe(persisted);
    expect(mockFlashCardProgress.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: progress._id,
        last_processed_answer_event_id: { $ne: "answer-key-3" },
        "order_queue.0": vocabularyId,
      }),
      expect.any(Object),
      expect.objectContaining({ new: true })
    );
  });

  it("applyReviewPendingMemory -> Same answer_event_id already applied -> DoesNotDoubleIncrement", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      difficulty: 6,
      half_life_days: 4,
      last_reviewed_at: new Date("2026-05-01T00:00:00.000Z"),
      due_at: new Date("2026-05-17T00:00:00.000Z"),
      last_flashcard_answer_event_id: "answer-key-4",
    };
    mockUserVocabularyMemoryV2.findOne
      .mockResolvedValueOnce(memory)
      .mockResolvedValueOnce(memory);
    mockUserVocabularyMemoryV2.updateOne.mockResolvedValue({ modifiedCount: 0 });

    // Act
    await __test__.applyReviewPendingMemory({
      userId,
      vocabularyId: orderQueue[0],
      action: "remember",
      answerEventId: "answer-key-4",
      responseTime: 1000,
      processedAt: new Date("2026-05-18T10:00:00.000Z"),
    });

    // Assert
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledWith(
      {
        _id: memory._id,
        last_flashcard_answer_event_id: { $ne: "answer-key-4" },
      },
      expect.objectContaining({
        $inc: { session_count: 1, review_count: 1 },
        $set: expect.objectContaining({
          last_flashcard_answer_event_id: "answer-key-4",
        }),
      })
    );
  });

  it("applyReviewPendingMemory -> memory due in future -> skips long-term update", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      difficulty: 6,
      half_life_days: 4,
      due_at: new Date("2026-05-19T10:00:00.000Z"),
      last_reviewed_at: new Date("2026-05-01T00:00:00.000Z"),
    };
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(memory);

    // Act
    await __test__.applyReviewPendingMemory({
      userId,
      vocabularyId: orderQueue[0],
      action: "remember",
      answerEventId: "answer-key-future-due",
      responseTime: 1000,
      processedAt: new Date("2026-05-18T10:00:00.000Z"),
    });

    // Assert
    expect(mockUserVocabularyMemoryV2.updateOne).not.toHaveBeenCalled();
  });

  it("applyReviewPendingMemory -> memory already reviewed today -> skips long-term update", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      difficulty: 6,
      half_life_days: 4,
      due_at: new Date("2026-05-18T09:00:00.000Z"),
      last_reviewed_at: new Date("2026-05-18T02:00:00.000Z"),
    };
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(memory);

    // Act
    await __test__.applyReviewPendingMemory({
      userId,
      vocabularyId: orderQueue[0],
      action: "remember",
      answerEventId: "answer-key-reviewed-today",
      responseTime: 1000,
      processedAt: new Date("2026-05-18T10:00:00.000Z"),
    });

    // Assert
    expect(mockUserVocabularyMemoryV2.updateOne).not.toHaveBeenCalled();
  });

  it("applyReviewReinforcementMemory -> Same answer_event_id already applied -> DoesNotDoubleIncrement", async () => {
    // Arrange
    const memory = {
      _id: new Types.ObjectId(),
      last_flashcard_answer_event_id: "answer-key-5",
    };
    mockUserVocabularyMemoryV2.findOne
      .mockResolvedValueOnce(memory)
      .mockResolvedValueOnce(memory);
    mockUserVocabularyMemoryV2.updateOne.mockResolvedValue({ modifiedCount: 0 });

    // Act
    await __test__.applyReviewReinforcementMemory({
      userId,
      vocabularyId: orderQueue[0],
      answerEventId: "answer-key-5",
    });

    // Assert
    expect(mockUserVocabularyMemoryV2.updateOne).toHaveBeenCalledWith(
      {
        user_id: new Types.ObjectId(userId),
        vocabulary_id: new Types.ObjectId(orderQueue[0]),
        last_flashcard_answer_event_id: { $ne: "answer-key-5" },
      },
      {
        $inc: { review_count: 1 },
        $set: { last_flashcard_answer_event_id: "answer-key-5" },
      }
    );
  });

  it("applyNewCardMemory -> Duplicate key with same answer_event_id -> TreatsAsRecovered", async () => {
    // Arrange
    const attempt = createAttempt({
      results: [
        {
          answer_event_id: "answer-key-6",
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          action: "remember",
          response_time: 1200,
          attempted_at: new Date("2026-05-18T10:00:00.000Z"),
        },
      ],
    });
    const recoveredMemory = {
      last_flashcard_answer_event_id: "answer-key-6",
    };
    mockUserVocabularyMemoryV2.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(recoveredMemory);
    const duplicateError = Object.assign(new Error("duplicate"), { code: 11000 });
    mockUserVocabularyMemoryV2.create.mockRejectedValue(duplicateError);

    // Act
    await __test__.applyNewCardMemory({
      userId,
      attempt,
      vocabularyId: orderQueue[0],
      answerEventId: "answer-key-6",
      processedAt: new Date("2026-05-18T10:00:00.000Z"),
    });

    // Assert
    expect(mockUserVocabularyMemoryV2.create).toHaveBeenCalled();
  });

  it("applyNewCardMemory -> Existing memory belongs to another answer event -> ThrowsConflict", async () => {
    // Arrange
    const attempt = createAttempt({
      results: [
        {
          answer_event_id: "answer-key-7",
          vocabulary_id: new Types.ObjectId(orderQueue[0]),
          action: "remember",
          response_time: 1200,
          attempted_at: new Date("2026-05-18T10:00:00.000Z"),
        },
      ],
    });

    const existingMemory = {
      last_flashcard_answer_event_id: "some-other-answer-event",
    };

    mockUserVocabularyMemoryV2.findOne.mockResolvedValueOnce(existingMemory);

    // Act
    const action = __test__.applyNewCardMemory({
      userId,
      attempt,
      vocabularyId: orderQueue[0],
      answerEventId: "answer-key-7",
      processedAt: new Date("2026-05-18T10:00:00.000Z"),
    });

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 409,
      message: "Unexpected existing memory for new card",
    });

    expect(mockUserVocabularyMemoryV2.create).not.toHaveBeenCalled();
  });

  it("finalizeFlashcardSessionService -> Empty queue -> UpdatesExistingAttemptAndArchivesProgress", async () => {
    // Arrange
    const progress = createExistingSession({ order_queue: [] });
    const attempt = createAttempt();
    mockFlashCardProgress.findOne.mockResolvedValue(progress);
    mockFlashCardAttempt.findOne.mockResolvedValue(attempt);

    // Act
    const result = await finalizeFlashcardSessionService(
      userId,
      progress.session_id,
      90,
      2,
      3,
      "2026-05-18T10:00:00.000Z",
      "2026-05-18T10:02:00.000Z"
    );

    // Assert
    expect(mockFlashCardAttempt.create).not.toHaveBeenCalled();
    expect(attempt.accuracy).toBe(90);
    expect(progress.status).toBe("archived");
    expect(progress.archive_reason).toBe("completed");
    expect(result.memoryUpdates).toEqual([]);
  });

});
