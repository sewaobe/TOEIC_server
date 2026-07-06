import mongoose, { Types } from "mongoose";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTopicVocabulary: any = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
};

const mockVocabulary: any = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
};

const mockQuestion: any = {
  findById: jest.fn(),
};

const mockUserTest: any = {
  findOne: jest.fn(),
};

const mockGenerateFromPromptWithMeta = jest.fn() as any;

jest.mock("../../src/models", () => ({
  Question: mockQuestion,
  TopicVocabulary: mockTopicVocabulary,
  UserTest: mockUserTest,
  Vocabulary: mockVocabulary,
}));

jest.mock("../../src/core/llm", () => ({
  generateFromPromptWithMeta: mockGenerateFromPromptWithMeta,
}));

import {
  __test__,
  createFlashcardSupplyDeck,
} from "../../src/services/flashcard_supply.service";
import { CHAT_INTENT_EXAMPLES } from "../../src/services/chat_intent_examples.data";

const leanChain = (value: any) => ({
  lean: (jest.fn() as any).mockResolvedValue(value),
});

const selectLeanChain = (value: any) => ({
  select: jest.fn().mockReturnValue({
    lean: (jest.fn() as any).mockResolvedValue(value),
  }),
});

const sessionChain = (value: any) => ({
  session: (jest.fn() as any).mockResolvedValue(value),
});

const geminiResult = (items: any[]) => ({
  model: "gemini-test",
  text: JSON.stringify(items),
});

const createRawWord = (word: string, definition: string, type = "noun") => ({
  word,
  type,
  definition,
  examples: [{ en: `The ${word} is clean.`, vi: "" }],
  tags: [],
  cefrLevel: "A2",
});

describe("flashcard supply topic relevance", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    delete process.env.FLASHCARD_SYSTEM_CATALOG_TOPIC_IDS;

    mockTopicVocabulary.findOne.mockReturnValue(leanChain(null));
    mockTopicVocabulary.find.mockReturnValue(selectLeanChain([]));
    mockTopicVocabulary.create.mockImplementation(async ([payload]: any[]) => [
      { _id: new Types.ObjectId(), ...payload },
    ]);

    mockVocabulary.find.mockReturnValue(leanChain([]));
    mockVocabulary.findOne.mockReturnValue(sessionChain(null));
    mockVocabulary.create.mockImplementation(async ([payload]: any[]) => [
      { _id: new Types.ObjectId(), ...payload },
    ]);
    mockVocabulary.deleteMany.mockResolvedValue({ deletedCount: 0 });

    const fakeSession = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
      endSession: (jest.fn() as any).mockResolvedValue(undefined),
    };
    (jest.spyOn(mongoose, "startSession") as any).mockResolvedValue(fakeSession);
  });

  it("resolveFlashcardTopicProfile -> house aliases map to home_household unless real-estate is explicit", () => {
    expect(
      __test__.resolveFlashcardTopicProfile({ kind: "topic", topic: "house" })?.id
    ).toBe("home_household");
    expect(
      __test__.resolveFlashcardTopicProfile({ kind: "topic", topic: "home" })?.id
    ).toBe("home_household");
    expect(
      __test__.resolveFlashcardTopicProfile({ kind: "topic", topic: "nh\u00e0 c\u1eeda" })?.id
    ).toBe("home_household");
    expect(
      __test__.resolveFlashcardTopicProfile({ kind: "topic", topic: "real estate property" })
    ).toBeUndefined();
  });

  it("chat intent seed keeps house flashcard request under flashcard.create", () => {
    const flashcardCreate = CHAT_INTENT_EXAMPLES.find(
      (entry) => entry.intentId === "flashcard.create"
    );

    expect(flashcardCreate?.examples).toContain("tao cho toi 10 tu vung cho chu de house");
  });

  it("validateDrafts -> rejects real-estate terms and accepts concrete house words", () => {
    const profile = __test__.resolveFlashcardTopicProfile({ kind: "topic", topic: "house" });
    const validation = __test__.validateDrafts(
      [
        createRawWord("premises", "Buildings and land used for a business."),
        createRawWord("facility", "A place or service provided for a particular purpose."),
        createRawWord("accommodation", "A place to stay, often in a hotel."),
        createRawWord("kitchen", "A room where food is prepared."),
        createRawWord("bedroom", "A room used for sleeping."),
        createRawWord("roof", "The top covering of a house."),
      ],
      new Set<string>(),
      [],
      profile
    );

    expect(validation.rejectedWords).toEqual(
      expect.arrayContaining(["premises", "facility", "accommodation"])
    );
    expect(validation.accepted.map((candidate: any) => candidate.payload.word)).toEqual([
      "kitchen",
      "bedroom",
      "roof",
    ]);
  });

  it("createFlashcardSupplyDeck -> filters off-topic Gemini words and retries with rejected words blocked", async () => {
    mockGenerateFromPromptWithMeta
      .mockResolvedValueOnce(
        geminiResult([
          createRawWord("premises", "Buildings and land used for a business."),
          createRawWord("facility", "A place or service provided for a particular purpose."),
          createRawWord("accommodation", "A place to stay, often in a hotel."),
          createRawWord("kitchen", "A room where food is prepared."),
          createRawWord("bedroom", "A room used for sleeping."),
        ])
      )
      .mockResolvedValueOnce(
        geminiResult([
          createRawWord("roof", "The top covering of a house."),
          createRawWord("door", "A movable panel used to enter a room."),
          createRawWord("window", "An opening in a wall that lets in light."),
        ])
      );

    const result = await createFlashcardSupplyDeck({
      userId: new Types.ObjectId().toString(),
      request: {
        clientRequestId: "house-topic-test",
        count: 5,
        source: { kind: "topic", topic: "house" },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected flashcard supply to succeed");

    expect(mockGenerateFromPromptWithMeta).toHaveBeenCalledTimes(2);
    expect(mockGenerateFromPromptWithMeta.mock.calls[0][0]).toContain("home/household vocabulary");
    expect(mockGenerateFromPromptWithMeta.mock.calls[1][0]).toContain("premises");
    expect(mockGenerateFromPromptWithMeta.mock.calls[1][0]).toContain("facility");
    expect(mockGenerateFromPromptWithMeta.mock.calls[1][0]).toContain("accommodation");
    expect(result.data.suppliedBy).toEqual({ systemCatalog: 0, gemini: 5 });
    expect(result.data.words.map((word) => word.word)).toEqual([
      "kitchen",
      "bedroom",
      "roof",
      "door",
      "window",
    ]);
  });
});
