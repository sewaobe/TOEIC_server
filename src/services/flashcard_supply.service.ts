import mongoose, { ClientSession, Types } from "mongoose";
import { Question, TopicVocabulary, UserTest, Vocabulary } from "../models";
import { ChatRouteContext } from "../types/chat.types";
import { generateFromPromptWithMeta } from "../core/llm";

export type FlashcardSupplyPolicyReason =
  | "DB_ENOUGH"
  | "FILL_FROM_GEMINI"
  | "STRICT_SOURCE_LIMIT"
  | "PARTIAL_DB_ONLY"
  | "PARTIAL_AFTER_GENERATION"
  | "REUSED_EXISTING_DECK";

export type FlashcardSupplyRequest = {
  clientRequestId: string;
  count?: number;
  source: {
    kind: "topic" | "question_error";
    topic?: string;
    questionId?: string;
  };
  expansion?: "strict" | "related";
};

export type FlashcardSupplyResponse = {
  topicVocabularyId: string;
  title: string;
  requestedCount: number;
  returnedCount: number;
  suppliedBy: {
    systemCatalog: number;
    gemini: number;
  };
  policyReason: FlashcardSupplyPolicyReason;
  source: FlashcardSupplyRequest["source"];
  expansion: "strict" | "related";
  words: Array<{
    id: string;
    word: string;
    type?: string;
    definition?: string;
    source: "systemCatalog" | "gemini";
  }>;
};

type VocabularyDraft = {
  word: string;
  phonetic?: string;
  type?: string;
  definition: string;
  examples?: Array<{ en?: string; vi?: string }>;
  tags?: string[];
  notes?: string;
  cefrLevel?: string;
};

type FinalVocabCandidate = {
  source: "systemCatalog" | "gemini";
  normalizedWord: string;
  type: string;
  payload: VocabularyDraft;
  existingId?: Types.ObjectId;
};

type FlashcardTopicProfile = {
  id: "home_household";
  canonicalTopic: string;
  searchTerms: readonly string[];
  promptInstructions: readonly string[];
  tags: readonly string[];
  allowedWords: readonly string[];
  allowedTextTerms: readonly string[];
  deniedWords: readonly string[];
  deniedTextTerms: readonly string[];
};

const DEFAULT_COUNT = 20;
const MIN_COUNT = 5;
const MAX_COUNT = 30;
const MAX_GEMINI_ATTEMPTS = 2;

const HOME_TOPIC_ALIASES = [
  "house",
  "home",
  "household",
  "household items",
  "home appliances",
  "nha",
  "nha cua",
  "ngoi nha",
  "can nha",
  "do dung gia dinh",
  "do dung trong nha",
  "noi that",
];

const REAL_ESTATE_TOPIC_TERMS = [
  "real estate",
  "property",
  "housing market",
  "rental",
  "rent",
  "lease",
  "landlord",
  "tenant",
  "hotel",
  "lodging",
  "accommodation",
  "premises",
  "facility",
  "building management",
  "bat dong san",
  "cho thue",
  "thue nha",
  "khach san",
  "co so vat chat",
  "nha hang",
];

const HOME_HOUSEHOLD_PROFILE: FlashcardTopicProfile = {
  id: "home_household",
  canonicalTopic: "home/household vocabulary",
  searchTerms: [
    "home",
    "household",
    "room",
    "furniture",
    "appliance",
    "kitchen",
    "bedroom",
    "bathroom",
    "living room",
    "door",
    "window",
    "roof",
    "garden",
    "garage",
    "chores",
  ],
  promptInstructions: [
    "Interpret the topic as a home or household vocabulary set.",
    "Generate concrete words for rooms, furniture, fixtures, appliances, household objects, home areas, and common chores.",
    "Do not broaden this topic into real estate, rental, hotel, corporate premises, public facilities, institutions, or accommodation vocabulary.",
    "Avoid words such as premises, facility, accommodation, institution, property, real estate, tenant, landlord, and lease unless the user explicitly asked for real estate or lodging.",
  ],
  tags: ["home", "household"],
  allowedWords: [
    "air conditioner",
    "appliance",
    "armchair",
    "attic",
    "balcony",
    "basement",
    "bathroom",
    "bed",
    "bedroom",
    "blanket",
    "bookshelf",
    "broom",
    "cabinet",
    "carpet",
    "ceiling",
    "chair",
    "closet",
    "couch",
    "cupboard",
    "curtain",
    "desk",
    "dishwasher",
    "door",
    "drawer",
    "driveway",
    "faucet",
    "floor",
    "fridge",
    "furniture",
    "garage",
    "garden",
    "hallway",
    "home",
    "house",
    "household",
    "kettle",
    "key",
    "kitchen",
    "lamp",
    "laundry",
    "lawn",
    "living room",
    "lock",
    "microwave",
    "mirror",
    "mop",
    "oven",
    "pillow",
    "porch",
    "refrigerator",
    "roof",
    "room",
    "shelf",
    "sink",
    "sofa",
    "stairs",
    "stove",
    "table",
    "toilet",
    "vacuum cleaner",
    "wall",
    "wardrobe",
    "washing machine",
    "window",
    "yard",
  ],
  allowedTextTerms: [
    "air conditioner",
    "appliance",
    "attic",
    "balcony",
    "basement",
    "bathroom",
    "bedroom",
    "blanket",
    "cabinet",
    "carpet",
    "ceiling",
    "clean the house",
    "closet",
    "cupboard",
    "curtain",
    "dishwasher",
    "door",
    "drawer",
    "faucet",
    "floor",
    "fridge",
    "furniture",
    "garage",
    "garden",
    "hallway",
    "home appliance",
    "household chore",
    "household item",
    "kitchen",
    "laundry",
    "living room",
    "microwave",
    "mirror",
    "oven",
    "pillow",
    "porch",
    "refrigerator",
    "roof",
    "sink",
    "sofa",
    "stairs",
    "stove",
    "vacuum",
    "wall",
    "wardrobe",
    "washing machine",
    "window",
    "yard",
    "can phong",
    "cua so",
    "cua ra vao",
    "do gia dung",
    "do noi that",
    "may giat",
    "may hut bui",
    "mai nha",
    "nha bep",
    "phong",
    "phong khach",
    "phong ngu",
    "san nha",
    "tu lanh",
  ],
  deniedWords: [
    "accommodation",
    "estate",
    "facility",
    "institution",
    "landlord",
    "lease",
    "lodging",
    "premises",
    "property",
    "real estate",
    "rental",
    "tenant",
  ],
  deniedTextTerms: [
    "accommodation",
    "business property",
    "company",
    "commercial property",
    "conference room",
    "corporate premises",
    "facility",
    "hotel",
    "institution",
    "landlord",
    "lease",
    "lodging",
    "meeting room",
    "office building",
    "premises",
    "property market",
    "public facility",
    "real estate",
    "rental agreement",
    "tenant",
    "workplace",
  ],
};

export function normalizeVocabularyWord(word?: string) {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeTopicText(text = "") {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNormalizedTerm(text: string, term: string) {
  const normalizedText = normalizeTopicText(text);
  const normalizedTerm = normalizeTopicText(term);
  if (!normalizedText || !normalizedTerm) return false;
  const pattern = escapeRegex(normalizedTerm).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`).test(normalizedText);
}

function containsAnyNormalizedTerm(text: string, terms: readonly string[]) {
  return terms.some((term) => containsNormalizedTerm(text, term));
}

function resolveFlashcardTopicProfile(source: FlashcardSupplyRequest["source"]) {
  if (source.kind !== "topic") return undefined;
  const topic = source.topic ?? "";
  if (!topic.trim()) return undefined;
  if (containsAnyNormalizedTerm(topic, REAL_ESTATE_TOPIC_TERMS)) return undefined;
  if (containsAnyNormalizedTerm(topic, HOME_TOPIC_ALIASES)) return HOME_HOUSEHOLD_PROFILE;
  return undefined;
}

function serializeChoices(choices: any) {
  if (!choices) return {};
  if (choices instanceof Map) return Object.fromEntries(choices.entries());
  if (typeof choices.toObject === "function") return choices.toObject();
  return choices;
}

function normalizeType(type?: string) {
  const value = String(type ?? "").trim().toLowerCase();
  return value || "word";
}

function keyFor(word?: string, type?: string) {
  return `${normalizeVocabularyWord(word)}::${normalizeType(type)}`;
}

function clampCount(count?: number) {
  const numeric = Number(count);
  if (!Number.isFinite(numeric)) return DEFAULT_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(numeric)));
}

function splitConfiguredIds(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => Types.ObjectId.isValid(item));
}

function configuredSystemTopicIds() {
  return splitConfiguredIds(process.env.FLASHCARD_SYSTEM_CATALOG_TOPIC_IDS);
}

function extractWords(text = "") {
  return Array.from(
    new Set(
      normalizeTopicText(text)
        .match(/\b[a-z][a-z'-]{1,}\b/g) ?? []
    )
  );
}

function buildAllowedTermsFromQuestion(question: any) {
  const choices = serializeChoices(question?.choices);
  const correctAnswer = String(question?.correctAnswer ?? "");
  const selectedExplanation = String(question?.explanation ?? "");
  const raw = [
    question?.textQuestion,
    ...Object.values(choices),
    choices?.[correctAnswer],
    selectedExplanation,
  ]
    .filter(Boolean)
    .join(" ");
  return new Set(extractWords(raw).map(normalizeVocabularyWord));
}

function topicSearchTokens(topic = "", topicProfile?: FlashcardTopicProfile) {
  const profileTerms = topicProfile?.searchTerms.join(" ") ?? "";
  return extractWords(`${topic} ${profileTerms}`).filter((token) => token.length >= 3);
}

function candidateMatchesTopic(vocabulary: any, tokens: string[], questionTags: string[]) {
  if (!tokens.length && !questionTags.length) return true;
  const word = normalizeTopicText(vocabulary.word);
  const definition = normalizeTopicText(vocabulary.definition ?? "");
  const tags = (Array.isArray(vocabulary.tags) ? vocabulary.tags : [])
    .map((tag: string) => normalizeTopicText(tag));
  const tagText = tags.join(" ");
  return [...tokens, ...questionTags.map((tag) => normalizeTopicText(tag))].some((token) =>
    word.includes(token) || definition.includes(token) || tagText.includes(token)
  );
}

function rankCandidate(vocabulary: any, tokens: string[], allowedTerms: Set<string>) {
  const normalized = normalizeVocabularyWord(vocabulary.word);
  let score = 0;
  if (allowedTerms.has(normalized)) score += 10;
  if (tokens.some((token) => normalized.includes(token))) score += 4;
  const tagText = normalizeTopicText((vocabulary.tags ?? []).join(" "));
  if (tokens.some((token) => tagText.includes(token))) score += 3;
  score += 1 - Math.min(1, Math.max(0, Number(vocabulary.weight ?? 0.5)));
  return score;
}

function dedupeCandidates(candidates: FinalVocabCandidate[], limit: number) {
  const seen = new Set<string>();
  const result: FinalVocabCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.normalizedWord}::${candidate.type}`;
    if (!candidate.normalizedWord || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
    if (result.length >= limit) break;
  }
  return result;
}

function extractJsonArray(text = "") {
  const cleaned = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function draftSearchText(draft: VocabularyDraft) {
  const exampleText = (draft.examples ?? [])
    .map((example) => `${example.en ?? ""} ${example.vi ?? ""}`)
    .join(" ");
  return [
    draft.word,
    draft.type,
    draft.definition,
    exampleText,
    ...(draft.tags ?? []),
    draft.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

function isDraftRelevantToTopicProfile(draft: VocabularyDraft, topicProfile?: FlashcardTopicProfile) {
  if (!topicProfile) return true;

  const normalizedWord = normalizeTopicText(draft.word);
  if (topicProfile.deniedWords.some((word) => normalizedWord === normalizeTopicText(word))) {
    return false;
  }

  const searchText = draftSearchText(draft);
  if (containsAnyNormalizedTerm(searchText, topicProfile.deniedTextTerms)) {
    return false;
  }

  if (topicProfile.allowedWords.some((word) => normalizedWord === normalizeTopicText(word))) {
    return true;
  }

  return containsAnyNormalizedTerm(searchText, topicProfile.allowedTextTerms);
}

function generatedSourceTags(
  source: FlashcardSupplyRequest["source"],
  questionTags: string[],
  topicProfile?: FlashcardTopicProfile
) {
  if (source.kind !== "topic") return questionTags;
  return Array.from(
    new Set([
      ...topicSearchTokens(source.topic ?? "", topicProfile),
      ...(topicProfile?.tags ?? []),
    ])
  ).slice(0, 8);
}

function validateDrafts(
  rawItems: any[],
  blockedKeys: Set<string>,
  sourceTags: string[],
  topicProfile?: FlashcardTopicProfile
): { accepted: FinalVocabCandidate[]; rejectedWords: string[] } {
  const accepted: FinalVocabCandidate[] = [];
  const rejectedWords: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawItems) {
    const word = String(raw?.word ?? "").trim();
    const definition = String(raw?.definition ?? "").trim();
    const type = normalizeType(raw?.type);
    const normalizedWord = normalizeVocabularyWord(word);
    const key = `${normalizedWord}::${type}`;
    if (!word || word.length > 80 || !definition || definition.length < 2) continue;
    if (blockedKeys.has(key) || seen.has(key)) continue;

    const draft: VocabularyDraft = {
      word,
      phonetic: String(raw?.phonetic ?? "").trim(),
      type,
      definition,
      examples: Array.isArray(raw?.examples)
        ? raw.examples
            .slice(0, 3)
            .map((example: any) => ({
              en: String(example?.en ?? "").trim(),
              vi: String(example?.vi ?? "").trim(),
            }))
            .filter((example: any) => example.en || example.vi)
        : [],
      tags: Array.from(
        new Set([
          ...sourceTags,
          ...(Array.isArray(raw?.tags) ? raw.tags.map((tag: any) => String(tag).trim()) : []),
        ].filter(Boolean))
      ).slice(0, 8),
      notes: String(raw?.notes ?? "").trim(),
      cefrLevel: String(raw?.cefrLevel ?? "").trim(),
    };

    if (!isDraftRelevantToTopicProfile(draft, topicProfile)) {
      rejectedWords.push(normalizedWord);
      seen.add(key);
      continue;
    }

    seen.add(key);
    accepted.push({
      source: "gemini",
      normalizedWord,
      type,
      payload: draft,
    });
  }
  return { accepted, rejectedWords };
}

function cefrToWeight(level?: string) {
  const normalized = String(level ?? "").toUpperCase();
  if (normalized === "A1") return 0.1;
  if (normalized === "A2") return 0.25;
  if (normalized === "B1") return 0.45;
  if (normalized === "B2") return 0.65;
  if (normalized === "C1") return 0.82;
  if (normalized === "C2") return 0.95;
  return 0.45;
}

async function loadQuestionContext(userId: string, questionId?: string, routeContext?: ChatRouteContext) {
  if (!questionId || !Types.ObjectId.isValid(questionId)) return null;
  const attemptId = routeContext?.attemptId;
  if (!attemptId || !Types.ObjectId.isValid(attemptId)) return null;

  const questionObjectId = new Types.ObjectId(questionId);
  const question = await Question.findById(questionObjectId).lean();
  if (!question) return null;

  const attempt = await UserTest.findOne({
    _id: new Types.ObjectId(attemptId),
    user_id: userId,
    "answers.question_id": questionObjectId,
  }).lean();
  if (!attempt) return null;

  return {
    question,
    allowedTerms: buildAllowedTermsFromQuestion(question),
    tags: Array.isArray(question.tags) ? question.tags.map((tag: string) => String(tag)) : [],
  };
}

async function loadSystemCandidates(params: {
  source: FlashcardSupplyRequest["source"];
  questionTags: string[];
  allowedTerms: Set<string>;
  topicProfile?: FlashcardTopicProfile;
  limit: number;
}) {
  const topicIds = configuredSystemTopicIds();
  if (!topicIds.length) return [];

  const topics = await TopicVocabulary.find({
    _id: { $in: topicIds.map((id) => new Types.ObjectId(id)) },
  })
    .select("title tags vocabularies_id")
    .lean();
  const vocabularyIds = Array.from(
    new Set(
      topics.flatMap((topic: any) =>
        (topic.vocabularies_id ?? []).map((id: any) => String(id))
      )
    )
  )
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (!vocabularyIds.length) return [];

  const vocabularies = await Vocabulary.find({ _id: { $in: vocabularyIds } }).lean();
  const tokens = topicSearchTokens(params.source.topic ?? "", params.topicProfile);
  return vocabularies
    .filter((vocabulary: any) =>
      candidateMatchesTopic(vocabulary, tokens, params.questionTags)
    )
    .sort((a: any, b: any) =>
      rankCandidate(b, tokens, params.allowedTerms) - rankCandidate(a, tokens, params.allowedTerms)
    )
    .map((vocabulary: any) => ({
      source: "systemCatalog" as const,
      normalizedWord: normalizeVocabularyWord(vocabulary.normalized_word ?? vocabulary.word),
      type: normalizeType(vocabulary.type),
      existingId: vocabulary._id,
      payload: {
        word: vocabulary.word,
        phonetic: vocabulary.phonetic,
        type: normalizeType(vocabulary.type),
        definition: vocabulary.definition,
        examples: vocabulary.examples ?? [],
        tags: vocabulary.tags ?? [],
        notes: vocabulary.notes,
      },
    }))
    .filter((candidate) => isDraftRelevantToTopicProfile(candidate.payload, params.topicProfile))
    .slice(0, params.limit * 2);
}

function buildGeminiPrompt(params: {
  needed: number;
  source: FlashcardSupplyRequest["source"];
  expansion: "related";
  blockedWords: string[];
  questionText?: string;
  questionTags: string[];
  topicProfile?: FlashcardTopicProfile;
}) {
  const topicText =
    params.source.kind === "topic"
      ? params.topicProfile
        ? [
            `User topic: ${params.source.topic}`,
            `Interpreted topic: ${params.topicProfile.canonicalTopic}`,
            "Keep topic fit as the first priority and TOEIC plausibility as the second priority.",
            ...params.topicProfile.promptInstructions,
          ].join("\n")
        : [
            `User topic: ${params.source.topic}`,
            "Keep the user's topic as the primary constraint; do not broaden it to unrelated business, travel, service, or office vocabulary.",
            "For casual or daily-life topics, choose concrete topic words that can realistically appear in simple TOEIC notices, conversations, emails, travel, service, or workplace contexts.",
          ].join("\n")
      : [
          `Question context: ${params.questionText ?? ""}`,
          `Tags: ${params.questionTags.join(", ")}`,
          "Prefer vocabulary that helps answer TOEIC question stems, options, notices, emails, conversations, announcements, schedules, and workplace/travel situations.",
        ].join("\n");
  return `
Return ONLY a JSON array of ${params.needed} TOEIC vocabulary objects.
${topicText}
Do not include these normalized words: ${params.blockedWords.join(", ")}
Each object must match:
{
  "word": "agenda",
  "phonetic": "/əˈdʒendə/",
  "type": "noun",
  "definition": "Vietnamese meaning or concise bilingual meaning",
  "examples": [{ "en": "The agenda was updated.", "vi": "Lịch trình đã được cập nhật." }],
  "tags": ["office", "toeic"],
  "notes": "",
  "cefrLevel": "A2"
}
Rules:
- Every word must directly fit the requested topic or question context.
- Every word must still be plausible in TOEIC Reading or Listening.
- Do not replace a daily-life topic with adjacent business, real-estate, travel, or hospitality vocabulary unless the user explicitly requested that adjacent domain.
- Avoid broad category labels when a concrete topic word would be more useful.
- Examples must sound like TOEIC sentences, such as notices, emails, schedules, reservations, staff instructions, or customer-service conversations.
- Keep definitions concise in Vietnamese or bilingual Vietnamese-English.
- Avoid duplicates.`;
}

async function generateMissingCandidates(params: {
  needed: number;
  source: FlashcardSupplyRequest["source"];
  questionText?: string;
  questionTags: string[];
  blockedKeys: Set<string>;
  topicProfile?: FlashcardTopicProfile;
}) {
  const accepted: FinalVocabCandidate[] = [];
  const rejectedWords = new Set<string>();
  let model: string | undefined;
  for (let attempt = 0; attempt < MAX_GEMINI_ATTEMPTS && accepted.length < params.needed; attempt += 1) {
    const blockedWords = Array.from(params.blockedKeys)
      .map((key) => key.split("::")[0])
      .concat(accepted.map((candidate) => candidate.normalizedWord), Array.from(rejectedWords));
    const prompt = buildGeminiPrompt({
      needed: params.needed - accepted.length,
      source: params.source,
      expansion: "related",
      blockedWords,
      questionText: params.questionText,
      questionTags: params.questionTags,
      topicProfile: params.topicProfile,
    });
    const result = await generateFromPromptWithMeta(prompt);
    model = result.model;
    const parsed = extractJsonArray(result.text);
    const blocked = new Set([
      ...params.blockedKeys,
      ...accepted.map((candidate) => `${candidate.normalizedWord}::${candidate.type}`),
    ]);
    const validation = validateDrafts(
      parsed,
      blocked,
      generatedSourceTags(params.source, params.questionTags, params.topicProfile),
      params.topicProfile
    );
    accepted.push(...validation.accepted);
    for (const word of validation.rejectedWords) {
      if (word) rejectedWords.add(word);
    }
  }
  return { candidates: accepted.slice(0, params.needed), model };
}

async function createOrReuseVocabularies(
  candidates: FinalVocabCandidate[],
  session?: ClientSession
) {
  const ids: Types.ObjectId[] = [];
  const createdIds: Types.ObjectId[] = [];

  for (const candidate of candidates) {
    if (candidate.existingId) {
      ids.push(candidate.existingId);
      continue;
    }

    const existing = await Vocabulary.findOne({
      normalized_word: candidate.normalizedWord,
      type: candidate.type,
    }).session(session ?? null);
    if (existing?._id) {
      ids.push(existing._id as Types.ObjectId);
      continue;
    }

    try {
      const docs = await Vocabulary.create(
        [
          {
            word: candidate.payload.word,
            normalized_word: candidate.normalizedWord,
            phonetic: candidate.payload.phonetic ?? "",
            type: candidate.type,
            definition: candidate.payload.definition,
            examples: candidate.payload.examples ?? [],
            image: "",
            audio: "",
            part_type: "reading",
            weight: cefrToWeight(candidate.payload.cefrLevel),
            tags: candidate.payload.tags ?? [],
            notes: candidate.payload.notes ?? "",
          },
        ],
        session ? { session } : {}
      );
      const id = docs[0]._id as Types.ObjectId;
      ids.push(id);
      createdIds.push(id);
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
      const recovered = await Vocabulary.findOne({
        normalized_word: candidate.normalizedWord,
        type: candidate.type,
      }).session(session ?? null);
      if (!recovered?._id) throw err;
      ids.push(recovered._id as Types.ObjectId);
    }
  }

  return { ids, createdIds };
}

async function createDeck(params: {
  userId: string;
  request: FlashcardSupplyRequest;
  title: string;
  tags: string[];
  vocabularyIds: Types.ObjectId[];
  session?: ClientSession;
}) {
  return TopicVocabulary.create(
    [
      {
        title: params.title,
        description: "Created from chatbot flashcard request",
        tags: params.tags,
        vocabularies_id: params.vocabularyIds,
        created_by: new Types.ObjectId(params.userId),
        isPublic: false,
        generation_request_id: params.request.clientRequestId,
        topic: [],
        isCollaborator: false,
      },
    ],
    params.session ? { session: params.session } : {}
  );
}

function isTransactionUnsupported(err: any) {
  const message = String(err?.message ?? "").toLowerCase();
  return message.includes("transaction numbers") || message.includes("replica set") || message.includes("standalone");
}

async function persistDeckWithFallback(params: {
  userId: string;
  request: FlashcardSupplyRequest;
  title: string;
  tags: string[];
  candidates: FinalVocabCandidate[];
}) {
  const session = await mongoose.startSession();
  try {
    let result: { topicId: Types.ObjectId; createdIds: Types.ObjectId[] } | null = null;
    await session.withTransaction(async () => {
      const vocab = await createOrReuseVocabularies(params.candidates, session);
      const deck = await createDeck({
        userId: params.userId,
        request: params.request,
        title: params.title,
        tags: params.tags,
        vocabularyIds: vocab.ids,
        session,
      });
      result = { topicId: deck[0]._id as Types.ObjectId, createdIds: vocab.createdIds };
    });
    if (!result) throw new Error("Unable to create flashcard deck");
    return result;
  } catch (err: any) {
    if (!isTransactionUnsupported(err)) throw err;
  } finally {
    await session.endSession();
  }

  const vocab = await createOrReuseVocabularies(params.candidates);
  try {
    const deck = await createDeck({
      userId: params.userId,
      request: params.request,
      title: params.title,
      tags: params.tags,
      vocabularyIds: vocab.ids,
    });
    return { topicId: deck[0]._id as Types.ObjectId, createdIds: vocab.createdIds };
  } catch (err) {
    if (vocab.createdIds.length) {
      await Vocabulary.deleteMany({ _id: { $in: vocab.createdIds } });
    }
    throw err;
  }
}

function duplicateKey(err: any) {
  return err?.code === 11000;
}

function buildTitle(request: FlashcardSupplyRequest, returnedCount: number) {
  if (request.source.kind === "topic") {
    return `${request.source.topic} Vocabulary - ${returnedCount} words`;
  }
  return `Question Review Vocabulary - ${returnedCount} words`;
}

function softFailure(message: string) {
  return {
    ok: false as const,
    errorType: "NO_DATA" as const,
    outcome: "no_data" as const,
    fallback: message,
  };
}

export async function createFlashcardSupplyDeck(params: {
  userId: string;
  request: FlashcardSupplyRequest;
  routeContext?: ChatRouteContext;
}): Promise<{ ok: true; data: FlashcardSupplyResponse } | ReturnType<typeof softFailure>> {
  const userObjectId = new Types.ObjectId(params.userId);
  const request = {
    ...params.request,
    count: clampCount(params.request.count),
    expansion: params.request.expansion ?? "related",
  } as FlashcardSupplyRequest & { count: number; expansion: "strict" | "related" };
  const topicProfile = resolveFlashcardTopicProfile(request.source);

  const existing = await TopicVocabulary.findOne({
    created_by: userObjectId,
    generation_request_id: request.clientRequestId,
  }).lean();
  if (existing) {
    return {
      ok: true,
      data: {
        topicVocabularyId: String(existing._id),
        title: existing.title,
        requestedCount: request.count,
        returnedCount: existing.vocabularies_id?.length ?? 0,
        suppliedBy: { systemCatalog: 0, gemini: 0 },
        policyReason: "REUSED_EXISTING_DECK",
        source: request.source,
        expansion: request.expansion,
        words: [],
      },
    };
  }

  if (request.source.kind === "topic" && !request.source.topic?.trim()) {
    return softFailure("Minh can biet chu de de tao flashcard.");
  }

  const resolvedQuestionId =
    request.source.kind === "question_error"
      ? request.source.questionId ?? params.routeContext?.questionId
      : undefined;
  const questionContext =
    request.source.kind === "question_error"
      ? await loadQuestionContext(params.userId, resolvedQuestionId, params.routeContext)
      : null;
  if (request.source.kind === "question_error" && !questionContext) {
    return softFailure("Minh chua xac thuc duoc cau hoi trong ngu canh hien tai de tao flashcard.");
  }

  const allowedTerms = questionContext?.allowedTerms ?? new Set<string>();
  const questionTags = questionContext?.tags ?? [];
  const directQuestionText = questionContext
    ? [
        questionContext.question.textQuestion,
        ...Object.values(serializeChoices(questionContext.question.choices)),
        questionContext.question.explanation,
      ].filter(Boolean).join(" ")
    : undefined;

  const systemCandidates = await loadSystemCandidates({
    source: request.source,
    questionTags,
    allowedTerms,
    topicProfile,
    limit: request.count,
  });

  const filteredSystem =
    request.expansion === "strict"
      ? systemCandidates.filter((candidate) => allowedTerms.has(candidate.normalizedWord))
      : systemCandidates;
  let finalCandidates = dedupeCandidates(filteredSystem, request.count);
  let policyReason: FlashcardSupplyPolicyReason =
    finalCandidates.length >= request.count ? "DB_ENOUGH" : "FILL_FROM_GEMINI";
  let geminiCount = 0;

  if (request.expansion === "strict") {
    if (!finalCandidates.length) {
      return softFailure("Minh chua tim thay tu hop le nam trong cau hoi nay de tao flashcard.");
    }
    policyReason = "STRICT_SOURCE_LIMIT";
  } else if (finalCandidates.length < request.count) {
    const blockedKeys = new Set(finalCandidates.map((candidate) => `${candidate.normalizedWord}::${candidate.type}`));
    try {
      const generated = await generateMissingCandidates({
        needed: request.count - finalCandidates.length,
        source: request.source,
        questionText: directQuestionText,
        questionTags,
        blockedKeys,
        topicProfile,
      });
      geminiCount = generated.candidates.length;
      finalCandidates = dedupeCandidates([...finalCandidates, ...generated.candidates], request.count);
      policyReason = finalCandidates.length >= request.count ? "FILL_FROM_GEMINI" : "PARTIAL_AFTER_GENERATION";
    } catch (err) {
      console.warn("Flashcard supply Gemini generation failed:", err);
      policyReason = "PARTIAL_DB_ONLY";
    }
  }

  if (finalCandidates.length < MIN_COUNT) {
    return softFailure("Minh chua co du tu hop le de tao bo flashcard huu ich.");
  }

  const tags = Array.from(
    new Set([
      ...(request.source.topic ? topicSearchTokens(request.source.topic, topicProfile) : []),
      ...(topicProfile?.tags ?? []),
      ...questionTags,
      "chatbot",
    ])
  ).slice(0, 8);
  const title = buildTitle(request, finalCandidates.length);

  try {
    const persisted = await persistDeckWithFallback({
      userId: params.userId,
      request,
      title,
      tags,
      candidates: finalCandidates,
    });
    const systemCount = finalCandidates.filter((candidate) => candidate.source === "systemCatalog").length;
    const persistedVocabs = await Vocabulary.find({
      _id: { $in: finalCandidates.map((candidate) => candidate.existingId).filter(Boolean) },
    }).lean();
    const persistedById = new Map(persistedVocabs.map((item: any) => [String(item._id), item]));
    return {
      ok: true,
      data: {
        topicVocabularyId: String(persisted.topicId),
        title,
        requestedCount: request.count,
        returnedCount: finalCandidates.length,
        suppliedBy: { systemCatalog: systemCount, gemini: geminiCount },
        policyReason,
        source: request.source,
        expansion: request.expansion,
        words: finalCandidates.slice(0, 10).map((candidate) => {
          const existing = candidate.existingId ? persistedById.get(String(candidate.existingId)) : null;
          return {
            id: String(candidate.existingId ?? ""),
            word: existing?.word ?? candidate.payload.word,
            type: existing?.type ?? candidate.type,
            definition: existing?.definition ?? candidate.payload.definition,
            source: candidate.source,
          };
        }),
      },
    };
  } catch (err: any) {
    if (duplicateKey(err)) {
      const recovered = await TopicVocabulary.findOne({
        created_by: userObjectId,
        generation_request_id: request.clientRequestId,
      }).lean();
      if (recovered) {
        return {
          ok: true,
          data: {
            topicVocabularyId: String(recovered._id),
            title: recovered.title,
            requestedCount: request.count,
            returnedCount: recovered.vocabularies_id?.length ?? 0,
            suppliedBy: { systemCatalog: 0, gemini: 0 },
            policyReason: "REUSED_EXISTING_DECK",
            source: request.source,
            expansion: request.expansion,
            words: [],
          },
        };
      }
    }
    throw err;
  }
}

export const __test__ = {
  buildGeminiPrompt,
  generatedSourceTags,
  isDraftRelevantToTopicProfile,
  normalizeTopicText,
  resolveFlashcardTopicProfile,
  topicSearchTokens,
  validateDrafts,
};
