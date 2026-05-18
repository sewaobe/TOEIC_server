import { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

declare const require: any;
const { createHash } = require("crypto") as { createHash: any };

const mockSave = jest.fn() as any;
const mockFlashCardProgress: any = Object.assign(
  jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: mockSave,
  })),
  {
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
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
  findById: jest.fn(),
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
  getSession,
  updateFlashcardProgressService,
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

describe("flashcard progress service semantic flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    mockAttemptSave.mockResolvedValue(undefined);
    mockFlashCardProgress.findOne.mockResolvedValue(null);
    mockFlashCardProgress.findOneAndUpdate.mockResolvedValue(null);
    mockFlashCardProgress.findById.mockResolvedValue(null);
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
    mockUserVocabularyMemoryV2.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: (jest.fn() as any).mockResolvedValue([]),
      }),
    });
    mockUserVocabularyMemoryV2.findOne.mockResolvedValue(null);
    mockUserVocabularyMemoryV2.create.mockResolvedValue({});
    mockUserVocabularyMemoryV2.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockVocabulary.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: (jest.fn() as any).mockResolvedValue({ word: "alpha" }),
      }),
    });
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
      [],
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

  it("updateFlashcardProgressService -> Deprecated snapshot update -> Throws410Gone", async () => {
    // Arrange

    // Act
    const action = updateFlashcardProgressService();

    // Assert
    await expect(action).rejects.toMatchObject({
      status: 410,
      message: "Snapshot-based flashcard progress updates are deprecated. Use the answer endpoint.",
    });
  });
});
