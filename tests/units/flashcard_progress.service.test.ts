import { Types } from "mongoose";

const mockSave = jest.fn();
const mockFlashCardProgress = Object.assign(
  jest.fn().mockImplementation((data) => ({
    ...data,
    save: mockSave,
  })),
  {
    findOne: jest.fn(),
  }
);

const mockFlashCardAttempt = {
  findOne: jest.fn(),
  create: jest.fn(),
};

const mockIdempotencyRecord = {
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
};

const mockBuildFlashcardSessionPreviewMetadata = jest.fn();

jest.mock("../../src/models/flashcard_progress.model", () => ({
  FlashCardProgress: mockFlashCardProgress,
}));

jest.mock("../../src/models", () => ({
  FlashCardAttempt: mockFlashCardAttempt,
}));

jest.mock("../../src/models/idempotency_record.model", () => ({
  IdempotencyRecord: mockIdempotencyRecord,
}));

jest.mock("../../src/services/user_vocabulary_progress_v2.service", () => ({
  updateVocabularyMemoryV2AfterFlashcardSession: jest.fn(),
}));

jest.mock("../../src/services/flashcard_session_preview.service", () => ({
  buildFlashcardSessionPreviewMetadata: mockBuildFlashcardSessionPreviewMetadata,
}));

import {
  createFlashcardSessionService,
  getSession,
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
  order_queue: orderQueue,
  current_index: 0,
  logs: [],
  status: "active",
  ...overrides,
});

describe("createFlashcardSessionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    mockFlashCardProgress.findOne.mockResolvedValue(null);
    mockFlashCardAttempt.findOne.mockResolvedValue(null);
    mockFlashCardAttempt.create.mockResolvedValue({ _id: new Types.ObjectId() });
    mockIdempotencyRecord.findOne.mockResolvedValue(null);
    mockIdempotencyRecord.create.mockImplementation(async (data) => ({
      _id: new Types.ObjectId(),
      ...data,
    }));
    mockIdempotencyRecord.updateOne.mockResolvedValue({ acknowledged: true });
    mockBuildFlashcardSessionPreviewMetadata.mockResolvedValue(previewMetadata);
  });

  it("createFlashcardSessionService -> New key -> CreatesProgressAttemptAndCompletesRecord", async () => {
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
    expect(mockIdempotencyRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "flashcard.session.start",
        key: idempotencyKey,
        status: "processing",
      })
    );
    expect(mockFlashCardProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: expect.any(String),
        order_queue: orderQueue,
        current_index: 0,
        logs: [],
        status: "active",
      })
    );
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockFlashCardAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: result.sessionId,
        submit_type: SubmissionType.PRACTICE,
        results: [],
        accuracy: 0,
      })
    );
    expect(mockIdempotencyRecord.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Types.ObjectId) },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "completed",
          resource_type: "FlashCardProgress",
          resource_id: result.sessionId,
          response_payload: result,
        }),
      })
    );
  });

  it("createFlashcardSessionService -> Completed same key -> ReturnsStoredPayload", async () => {
    // Arrange
    const firstResult = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "seed-key"
    );
    const requestHash = mockIdempotencyRecord.create.mock.calls[0][0].request_hash;
    jest.clearAllMocks();
    mockIdempotencyRecord.findOne.mockResolvedValue(
      createRecord({
        request_hash: requestHash,
        status: "completed",
        response_payload: firstResult,
      })
    );

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "seed-key"
    );

    // Assert
    expect(result).toEqual(firstResult);
    expect(mockFlashCardProgress.findOne).not.toHaveBeenCalled();
    expect(mockFlashCardAttempt.create).not.toHaveBeenCalled();
    expect(mockIdempotencyRecord.updateOne).not.toHaveBeenCalled();
  });

  it("createFlashcardSessionService -> Same key different hash -> Throws409Conflict", async () => {
    // Arrange
    mockIdempotencyRecord.findOne.mockResolvedValue(
      createRecord({
        request_hash: "different-hash",
        status: "processing",
      })
    );

    // Act
    const action = createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "reused-key"
    );

    // Assert
    await expect(action).rejects.toMatchObject({
      message: "Idempotency-Key was already used with a different request",
      status: 409,
    });
    expect(mockFlashCardProgress.findOne).not.toHaveBeenCalled();
    expect(mockFlashCardAttempt.create).not.toHaveBeenCalled();
  });

  it("createFlashcardSessionService -> Duplicate active progress -> ReturnsExistingProgressAndEnsuresAttempt", async () => {
    // Arrange
    const existingSession = createExistingSession();
    mockFlashCardProgress.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingSession);
    mockSave.mockRejectedValueOnce({ code: 11000 });

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "duplicate-key"
    );

    // Assert
    expect(result).toEqual({
      sessionId: existingSession.session_id,
      newSession: existingSession,
      preview_metadata: previewMetadata,
    });
    expect(mockFlashCardAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: existingSession.session_id,
        results: [],
        accuracy: 0,
      })
    );
    expect(mockIdempotencyRecord.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Types.ObjectId) },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "completed",
          resource_id: existingSession.session_id,
        }),
      })
    );
  });

  it("createFlashcardSessionService -> Processing record with existing progress -> ResumesAndCompletesRecord", async () => {
    // Arrange
    const firstResult = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "hash-source-key"
    );
    const requestHash = mockIdempotencyRecord.create.mock.calls[0][0].request_hash;
    const existingSession = createExistingSession({
      session_id: firstResult.sessionId,
    });
    jest.clearAllMocks();
    mockIdempotencyRecord.findOne.mockResolvedValue(
      createRecord({
        request_hash: requestHash,
        status: "processing",
      })
    );
    mockFlashCardProgress.findOne.mockResolvedValue(existingSession);
    mockFlashCardAttempt.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "hash-source-key"
    );

    // Assert
    expect(result).toEqual({
      sessionId: existingSession.session_id,
      newSession: existingSession,
      preview_metadata: previewMetadata,
    });
    expect(mockFlashCardAttempt.create).not.toHaveBeenCalled();
    expect(mockIdempotencyRecord.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Types.ObjectId) },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "completed",
          resource_id: existingSession.session_id,
        }),
      })
    );
  });

  it("createFlashcardSessionService -> New session -> ResponseIncludesPreviewMetadata", async () => {
    // Arrange
    const idempotencyKey = "preview-new-key";

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      idempotencyKey
    );

    // Assert
    expect(mockBuildFlashcardSessionPreviewMetadata).toHaveBeenCalledWith({
      userId,
      vocabularyIds: orderQueue,
    });
    expect(result.preview_metadata).toBe(previewMetadata);
    expect(mockIdempotencyRecord.updateOne).toHaveBeenCalledWith(
      { _id: expect.any(Types.ObjectId) },
      expect.objectContaining({
        $set: expect.objectContaining({
          response_payload: expect.objectContaining({
            preview_metadata: previewMetadata,
          }),
        }),
      })
    );
  });

  it("createFlashcardSessionService -> Reuse existing active session -> ResponseIncludesPreviewMetadata", async () => {
    // Arrange
    const existingSession = createExistingSession();
    mockFlashCardProgress.findOne.mockResolvedValue(existingSession);

    // Act
    const result = await createFlashcardSessionService(
      userId,
      topicVocabularyId,
      orderQueue,
      "preview-existing-key"
    );

    // Assert
    expect(result).toEqual({
      sessionId: existingSession.session_id,
      newSession: existingSession,
      preview_metadata: previewMetadata,
    });
    expect(mockBuildFlashcardSessionPreviewMetadata).toHaveBeenCalledWith({
      userId,
      vocabularyIds: existingSession.order_queue,
    });
  });

  it("getSession -> Existing progress -> ReturnsPreviewMetadata", async () => {
    // Arrange
    const existingSession = createExistingSession();
    mockFlashCardProgress.findOne.mockResolvedValue(existingSession);

    // Act
    const result = await getSession(existingSession.session_id, userId);

    // Assert
    expect(result).toEqual({
      progress: existingSession,
      preview_metadata: previewMetadata,
    });
    expect(mockBuildFlashcardSessionPreviewMetadata).toHaveBeenCalledWith({
      userId,
      vocabularyIds: existingSession.order_queue,
    });
  });

  it("getSession -> Missing progress -> PreservesCurrentNotFoundBehavior", async () => {
    // Arrange
    mockFlashCardProgress.findOne.mockResolvedValue(null);

    // Act
    const result = await getSession("missing-session", userId);

    // Assert
    expect(result).toEqual({ progress: null });
    expect(mockBuildFlashcardSessionPreviewMetadata).not.toHaveBeenCalled();
  });
});
