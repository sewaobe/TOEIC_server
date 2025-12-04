import { Types } from "mongoose";
import { generateToeicPlan, generateWeeklyPlanWithRAG } from "./gemini.service";
import {
  retrieveContentByMentor,
  formatContentForPrompt,
  constructSearchQuery,
  retrieveRelevantContentFromChroma,
  RetrievedContent,
  ingestMentorToChroma,
} from "./learningPath.retriever";
import { updateUserProgress } from "./user_progress.service";
import {
  Lesson,
  LessonSection,
  TopicVocabulary,
  Vocabulary,
  Quiz,
  Question,
  LearningPath,
  WeekStudy,
  DayStudy,
  Media,
  User,
  Role,
  GroupUser,
  UserProgress,
} from "../models";
import { LESSON_SEEDS } from "../mocks/seedLessons";
import { Shadowing } from "../models/shadowing.model";
import { Dictation } from "../models/dictation.model";
import {
  MOCK_FLASHCARDS,
  MOCK_QUIZZES,
  MOCK_SHADOWINGS,
  MOCK_DICTATIONS,
} from "../mocks/mockActivities";
import { generateWeeklyDayStudies } from "./user_learningPath.service";
import { PartType } from "../models/enums/PartType";
import { TestStatus } from "../models/enums/TestStatus";
import { CERFLevel } from "../models/topic_vocabulary.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { SessionType } from "../models/enums/SessionType";
import { Test } from "../models/test.model";

const TEMP_AUDIO_URL =
  "https://res.cloudinary.com/dmwfnictk/video/upload/v1761728754/mdpcvzwye3kwgjkfqjwx.mp3";

// Default system creator for AI-generated items
const DEFAULT_CREATOR_ID = new Types.ObjectId("68dd1ec97e6feb7d175ce104");

// A lightweight shadowing template: keep transcript, timings, audio and duration
// but allow overriding title/part_type/level/status when creating from Gemini.
const SHADOWING_TEMPLATE = {
  topic: [],
  title: "Template Shadowing",
  part_type: PartType.PART_2,
  level: CERFLevel.A2,
  status: TestStatus.APPROVED,
  transcript:
    "Number 9. Did Mr. Stax show you the new work schedule? A. Yes, he was. B. It's behind schedule. C. Actually, Ms. Duane did.",
  audio_url:
    "https://res.cloudinary.com/dgi1g967z/video/upload/v1762073168/xqcnpnt58rjunesqdwin.mp3",
  duration: 17854,
  timings: [
    {
      text: "Number 9. Did Mr. Stax show you the new work schedule?",
      startTime: 2545,
      endTime: 6713,
      words: [],
    },
    { text: "A. Yes, he was.", startTime: 7815, endTime: 9899, words: [] },
    {
      text: "B. It's behind schedule.",
      startTime: 9919,
      endTime: 13626,
      words: [],
    },
    {
      text: "C. Actually, Ms. Duane did.",
      startTime: 14808,
      endTime: 17854,
      words: [],
    },
  ],
  display_mode: "sentence",
  weight: 0,
};

// A lightweight dictation template: preserve transcript, timings, audio and duration
// but allow overriding title/part_type/level/status when creating from Gemini.
const DICTATION_TEMPLATE = {
  topic: [],
  title: "Template Dictation",
  part_type: PartType.PART_1,
  level: CERFLevel.A2,
  status: TestStatus.APPROVED,
  transcript:
    "Number one. Look at the picture marked number one in your test book. A. She has some grocery bags. B. She is holding some flowers. C. She's reaching out to pick up a vegetable. D. She's washing the fruits.",
  audio_url:
    "https://res.cloudinary.com/dgi1g967z/video/upload/v1762072595/ypd2c6brgluivxm9uwz4.mp3",
  duration: 21820,
  timings: [
    {
      text: "Number one. Look at the picture marked number one in your test book.",
      startTime: 1752,
      endTime: 5978,
      words: [],
    },
    {
      text: "A. She has some grocery bags.",
      startTime: 6999,
      endTime: 9743,
      words: [],
    },
    {
      text: "B. She is holding some flowers.",
      startTime: 11005,
      endTime: 13589,
      words: [],
    },
    {
      text: "C. She's reaching out to pick up a vegetable.",
      startTime: 14950,
      endTime: 18135,
      words: [],
    },
    {
      text: "D. She's washing the fruits.",
      startTime: 19196,
      endTime: 21820,
      words: [],
    },
  ],
  display_mode: "sentence",
  weight: 0,
};

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Chuyển đổi flat array từ RAG về dạng RetrievedContent
 * để tương thích với formatContentForPrompt
 */
function groupRagResultsToRetrievedContent(results: any[]): RetrievedContent {
  const grouped: RetrievedContent = {
    lessons: [],
    quizzes: [],
    vocabularies: [],
    dictations: [],
    shadowings: [],
    tests: [],
  };

  for (const item of results) {
    const type = item.type?.toLowerCase();
    if (type === "lesson") {
      grouped.lessons.push(item);
    } else if (type === "quiz") {
      grouped.quizzes.push(item);
    } else if (type === "vocabulary") {
      grouped.vocabularies.push(item);
    } else if (type === "dictation") {
      grouped.dictations.push(item);
    } else if (type === "shadowing") {
      grouped.shadowings.push(item);
    } else if (type === "test") {
      grouped.tests.push(item);
    }
  }

  return grouped;
}

function inferPartTypeFromText(text: string): PartType {
  if (!text) return PartType.PART_5;
  const t = text.toLowerCase();
  if (t.includes("part 1") || t.includes("part1") || t.includes("picture"))
    return PartType.PART_1;
  if (t.includes("part 2") || t.includes("part2")) return PartType.PART_2;
  if (t.includes("part 3") || t.includes("part3")) return PartType.PART_3;
  if (t.includes("part 4") || t.includes("part4")) return PartType.PART_4;
  if (t.includes("part 5") || t.includes("part5") || t.includes("grammar"))
    return PartType.PART_5;
  if (t.includes("part 6") || t.includes("part6")) return PartType.PART_6;
  if (t.includes("part 7") || t.includes("part7") || t.includes("reading"))
    return PartType.PART_7;
  return PartType.PART_5;
}

// Detect explicit 'Part' mention. Return PartType if text explicitly mentions a part (e.g., 'Part 1'), otherwise null.
function detectExplicitPartFromText(text: string): PartType | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const m = t.match(/part\s*(\d)/i);
  if (m && m[1]) {
    const n = Number(m[1]);
    switch (n) {
      case 1:
        return PartType.PART_1;
      case 2:
        return PartType.PART_2;
      case 3:
        return PartType.PART_3;
      case 4:
        return PartType.PART_4;
      case 5:
        return PartType.PART_5;
      case 6:
        return PartType.PART_6;
      case 7:
        return PartType.PART_7;
      default:
        return null;
    }
  }
  return null;
}

/**
 * Build full learning path and create metadata items (Lesson, Quiz, Shadowing, Dictation, TopicVocabulary)
 * - For each topic/activity in Gemini schedule, find-or-create minimal metadata
 * - Create per-user plans (FlashCardPlan, QuizPlan, ShadowingPlan, DictationPlan)
 * - Use generateWeeklyDayStudies to create DayStudy documents and assemble LearningPath/WeekStudy
 */
export async function buildLearningPathFromGemini(
  userId: string,
  userInput: any,
  options?: { title?: string; targetScore?: number; endDate?: string },
  geminiParsed?: any
) {
  if (!userId) throw new Error("Missing userId");
  const userObjectId = new Types.ObjectId(userId);

  let gen: any = null;
  let parsed = geminiParsed;
  if (!parsed) {
    gen = await generateToeicPlan(userInput);
    parsed = gen?.json;
    if (!parsed) throw new Error("No structured plan returned from Gemini");
  }

  const schedule = Array.isArray(parsed.schedule_by_week)
    ? parsed.schedule_by_week
    : [];

  const artifacts = new Map<string, any>();
  for (const week of schedule) {
    const days = Array.isArray(week.days) ? week.days : [];
    for (const day of days) {
      const rawTitle = (day.topic || day.activity || day.goal || "Untitled")
        .toString()
        .trim();
      if (!rawTitle) continue;
      const key = rawTitle.toLowerCase();
      if (artifacts.has(key)) continue;

      const part = inferPartTypeFromText(rawTitle);
      const explicitPart = detectExplicitPartFromText(rawTitle);
      const activity = (day.activity || "").toString().toLowerCase();

      // simple switch-like handling: only create resources needed for this activity
      let lesson: any = undefined;
      let quiz: any = undefined;
      let topicVocab: any = undefined;
      let shadowing: any = undefined;
      let dictation: any = undefined;

      // helper: create lesson (used by video/lesson fallback)
      const ensureLesson = async () => {
        if (lesson) return lesson;
        lesson = await Lesson.findOne({
          title: new RegExp(`^${escapeRegExp(rawTitle)}$`, "i"),
        });
        if (!lesson) {
          lesson = await Lesson.create({
            part_type: part,
            topic: [],
            title: rawTitle,
            status: TestStatus.APPROVED,
            summary: `[AI GENERATED] Placeholder for ${rawTitle}`,
            planned_completion_time: 10,
            weight: 0.1,
            sections_id: [],
            created_at: new Date(),
            created_by: DEFAULT_CREATOR_ID,
            updated_at: new Date(),
          } as any);
          const isVideo = /video|youtube|watch|watch\?/i.test(rawTitle);
          let section;
          // try to find a seed matching this lesson title
          const seed = LESSON_SEEDS.find(
            (s) =>
              rawTitle &&
              s.title &&
              rawTitle.toLowerCase().includes(s.title.toLowerCase())
          );
          if (seed) {
            // create media + multiple sections from seed
            const createdSectionIds: Types.ObjectId[] = [];
            let order = 0;
            const seedSections = (seed.sections || []) as any[];
            for (const s of seedSections) {
              const secObj: any = s;
              if (secObj.type === "media") {
                try {
                  const media = await Media.create({
                    topic: seed.title,
                    url: s.mediaUrl || seed.url,
                    type: "video",
                    created_at: new Date(),
                    updated_at: new Date(),
                  } as any);
                  const sec = await LessonSection.create({
                    lesson_id: lesson._id,
                    order: order++,
                    title: s.title || "Video",
                    type: "media",
                    medias_id: [media._id],
                    created_at: new Date(),
                    updated_at: new Date(),
                  } as any);
                  createdSectionIds.push(sec._id as Types.ObjectId);
                } catch (e) {
                  console.warn(
                    "Failed to create media section for seed",
                    seed.title,
                    e
                  );
                }
              } else if (secObj.type === "text") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: secObj.title || "Text",
                  type: "text",
                  content: secObj.content || "",
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (secObj.type === "example") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: secObj.title || "Example",
                  type: "example",
                  example: secObj.example || {},
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (secObj.type === "error") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: secObj.title || "Common error",
                  type: "error",
                  error: secObj.error || {},
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (secObj.type === "table") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: secObj.title || "Table",
                  type: "table",
                  tableData: secObj.tableData || [],
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              }
            }
            // Ensure all five section types exist for the lesson. If seed omitted some types, create placeholders.
            const existingTypes = new Set<string>();
            if (createdSectionIds.length) {
              const createdSecs = await LessonSection.find({
                _id: { $in: createdSectionIds },
              });
              for (const cs of createdSecs) existingTypes.add(cs.type);
            }
            const requiredTypes = [
              "text",
              "example",
              "error",
              "media",
              "table",
            ] as const;
            for (const t of requiredTypes) {
              if (existingTypes.has(t)) continue;
              // create placeholder for missing type
              if (t === "media") {
                try {
                  const media = await Media.create({
                    topic: seed.title,
                    url: seed.url || TEMP_AUDIO_URL,
                    type: isVideo ? "video" : "audio",
                    created_at: new Date(),
                    updated_at: new Date(),
                  } as any);
                  const sec = await LessonSection.create({
                    lesson_id: lesson._id,
                    order: order++,
                    title: "Video",
                    type: "media",
                    medias_id: [media._id],
                    created_at: new Date(),
                    updated_at: new Date(),
                  } as any);
                  createdSectionIds.push(sec._id as Types.ObjectId);
                } catch (e) {
                  console.warn(
                    "Failed to create placeholder media for seed",
                    seed.title,
                    e
                  );
                }
              } else if (t === "text") {
                const textContent =
                  seedSections.find((x: any) => x.type === "text")?.content ||
                  `AI generated placeholder for ${rawTitle}`;
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Meta",
                  type: "text",
                  content: textContent,
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (t === "example") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Example",
                  type: "example",
                  example: { en: "Example sentence.", vi: "Câu ví dụ." },
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (t === "error") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Common error",
                  type: "error",
                  error: { en: "Common mistake.", vi: "Lỗi phổ biến." },
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (t === "table") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Table",
                  type: "table",
                  tableData: [],
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              }
            }
            lesson.sections_id = createdSectionIds as any;
            await lesson.save();
          } else {
            // default behaviour: create a single section (media if rawTitle looks like video)
            const createdSectionIds: Types.ObjectId[] = [];
            let order = 0;
            if (isVideo) {
              const media = await Media.create({
                topic: rawTitle,
                url: "https://youtu.be/CKgCahkAkQ8?list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe",
                type: "video",
                created_at: new Date(),
                updated_at: new Date(),
              } as any);
              const sec = await LessonSection.create({
                lesson_id: lesson._id,
                order: order++,
                title: "Video",
                type: "media",
                medias_id: [media._id],
                created_at: new Date(),
                updated_at: new Date(),
              } as any);
              createdSectionIds.push(sec._id as Types.ObjectId);
            } else {
              const sec = await LessonSection.create({
                lesson_id: lesson._id,
                order: order++,
                title: "Meta",
                type: "text",
                content: `AI generated placeholder for ${rawTitle}`,
                created_at: new Date(),
                updated_at: new Date(),
              } as any);
              createdSectionIds.push(sec._id as Types.ObjectId);
            }
            // create other placeholder sections so we always have all five types
            const requiredTypes = [
              "text",
              "example",
              "error",
              "media",
              "table",
            ] as const;
            const existingSecs = await LessonSection.find({
              _id: { $in: createdSectionIds },
            });
            const existingTypes = new Set(existingSecs.map((s) => s.type));
            for (const t of requiredTypes) {
              if (existingTypes.has(t)) continue;
              if (t === "media") {
                try {
                  const media = await Media.create({
                    topic: rawTitle,
                    url: TEMP_AUDIO_URL,
                    type: isVideo ? "video" : "audio",
                    created_at: new Date(),
                    updated_at: new Date(),
                  } as any);
                  const sec = await LessonSection.create({
                    lesson_id: lesson._id,
                    order: order++,
                    title: "Video",
                    type: "media",
                    medias_id: [media._id],
                    created_at: new Date(),
                    updated_at: new Date(),
                  } as any);
                  createdSectionIds.push(sec._id as Types.ObjectId);
                } catch (e) {
                  console.warn(
                    "Failed to create default media section",
                    rawTitle,
                    e
                  );
                }
              } else if (t === "text") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Meta",
                  type: "text",
                  content: `AI generated placeholder for ${rawTitle}`,
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (t === "example") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Example",
                  type: "example",
                  example: { en: "Example sentence.", vi: "Câu ví dụ." },
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (t === "error") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Common error",
                  type: "error",
                  error: { en: "Common mistake.", vi: "Lỗi phổ biến." },
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              } else if (t === "table") {
                const sec = await LessonSection.create({
                  lesson_id: lesson._id,
                  order: order++,
                  title: "Table",
                  type: "table",
                  tableData: [],
                  created_at: new Date(),
                  updated_at: new Date(),
                } as any);
                createdSectionIds.push(sec._id as Types.ObjectId);
              }
            }
            lesson.sections_id = createdSectionIds as any;
            await lesson.save();
          }
        }
        return lesson;
      };

      // switch-case (pattern matching) — create only required items
      if (/flashcard|vocab|vocabulary|từ vựng/i.test(activity)) {
        // try to find a matching mock topic by title; otherwise fall back to AI generated
        const mockFlash =
          MOCK_FLASHCARDS.find((m) =>
            m.title.toLowerCase().includes(rawTitle.toLowerCase())
          ) || MOCK_FLASHCARDS[0];

        topicVocab = await TopicVocabulary.create({
          title: mockFlash ? mockFlash.title : rawTitle,
          description: mockFlash
            ? mockFlash.description
            : `[AI GENERATED] ${rawTitle}`,
          tags: mockFlash?.tags || [],
          level: mockFlash?.level ?? CERFLevel.A2,
          iconName: "",
          bgColor: "ffffff",
          gradient: "",
          vocabularies_id: [],
          isCollaborator: false,
          isPublic: false,
          created_at: new Date(),
          created_by: DEFAULT_CREATOR_ID,
        } as any);
        // If mock provides vocabulary items, persist them as Vocabulary documents and link to topicVocab
        try {
          const mockItems = (mockFlash && mockFlash.items) || [];
          if (mockItems && mockItems.length) {
            const vocabPayloads = mockItems.map((it: any) => ({
              word: it.term || it.word || "",
              phonetic: it.phonetic || "",
              type: it.pos || "",
              part_type: it.part_type || "listening",
              weight: it.weight ?? 0,
              definition: it.meaning || "",
              examples: [{ en: it.example || "", vi: it.meaning || "" }],
              image: it.image || "",
              audio: it.audio_url || it.audio || "",
              tags: mockFlash?.tags || [],
              notes: it.notes || "",
              created_at: new Date(),
              updated_at: new Date(),
            }));
            const createdVocs = await Vocabulary.insertMany(
              vocabPayloads as any[]
            );
            topicVocab.vocabularies_id = createdVocs.map((v: any) => v._id);
            await topicVocab.save();
          }
        } catch (err) {
          // non-fatal: if vocab creation fails, keep topicVocab without linked vocabularies
          console.warn("Failed to create vocabularies from mock:", err);
        }
        // Not creating per-user FlashCardPlan here. LearningPath will reference `topicVocab` metadata directly.
      } else if (/quiz/i.test(activity)) {
        // try to seed quiz with a mock matching topic
        const mockQuiz =
          MOCK_QUIZZES.find((m) =>
            m.title.toLowerCase().includes(rawTitle.toLowerCase())
          ) || MOCK_QUIZZES[0];

        quiz = await Quiz.create({
          title: mockQuiz ? mockQuiz.title : rawTitle,
          question_ids: [],
          part_type: mockQuiz?.part_type ?? part,
          level: mockQuiz?.level ?? CERFLevel.A2,
          status: TestStatus.APPROVED,
          planned_completion_time: 5,
          weight: 0.1,
        } as any);
        // If mockQuiz contains questions, persist them as Question documents and attach
        try {
          const qItems = (mockQuiz && mockQuiz.questions) || [];
          if (qItems && qItems.length) {
            const letter = (i: number) => String.fromCharCode(65 + i); // 0->A,1->B
            const questionPayloads = qItems.map((q: any, idx: number) => {
              const choicesMap: any = {};
              (q.choices || []).forEach((c: string, ci: number) => {
                choicesMap[letter(ci)] = c;
              });
              return {
                name: `${quiz.title} - Q${idx + 1}`,
                textQuestion: q.question || "",
                choices: choicesMap,
                correctAnswer:
                  typeof q.correctIndex === "number"
                    ? letter(q.correctIndex)
                    : "",
                explanation: q.explanation || "",
                tags: q.tags || [],
                planned_time: q.planned_time || 0,
                created_at: new Date(),
                created_by: DEFAULT_CREATOR_ID,
              } as any;
            });
            const createdQs = await Question.insertMany(
              questionPayloads as any[]
            );
            quiz.question_ids = createdQs.map((c: any) => c._id);
            await quiz.save();
          }
        } catch (err) {
          console.warn("Failed to create questions from mock quiz:", err);
        }
        // Not creating per-user QuizPlan here. LearningPath will reference `quiz` metadata directly.
      } else if (/dictation|nghe chép|nghe chép chính tả/i.test(activity)) {
        // use mock dictation if available to create more realistic audio/transcript
        const mockDict =
          MOCK_DICTATIONS.find((m) =>
            m.title.toLowerCase().includes(rawTitle.toLowerCase())
          ) || MOCK_DICTATIONS[0];

        const dictationPayload = {
          ...DICTATION_TEMPLATE,
          ...(mockDict || {}),
          title: mockDict ? mockDict.title : rawTitle,
          part_type: mockDict?.part_type ?? part,
          level: mockDict?.level ?? CERFLevel.A2,
          status: TestStatus.APPROVED,
          created_at: new Date(),
          updated_at: new Date(),
          created_by: DEFAULT_CREATOR_ID,
        } as any;
        dictation = await Dictation.create(dictationPayload);
        // Not creating per-user DictationPlan here. LearningPath will reference `dictation` metadata directly.
      } else if (/shadowing|repeat|speak/i.test(activity)) {
        // seed shadowing with a realistic template if available
        const mockShadow =
          MOCK_SHADOWINGS.find((m) =>
            m.title.toLowerCase().includes(rawTitle.toLowerCase())
          ) || MOCK_SHADOWINGS[0];

        const shadowingPayload = {
          ...SHADOWING_TEMPLATE,
          ...(mockShadow || {}),
          title: mockShadow ? mockShadow.title : rawTitle,
          part_type: mockShadow?.part_type ?? part,
          level: mockShadow?.level ?? CERFLevel.A2,
          status: TestStatus.APPROVED,
          created_at: new Date(),
          updated_at: new Date(),
          created_by: DEFAULT_CREATOR_ID,
        } as any;
        shadowing = await Shadowing.create(shadowingPayload);
        // Not creating per-user ShadowingPlan here. LearningPath will reference `shadowing` metadata directly.
      } else if (
        /(video|lesson)/i.test(activity) ||
        /video|youtube|watch|watch\?/i.test(rawTitle)
      ) {
        // create lesson for video/lesson or if title implies video
        lesson = await ensureLesson();
      } else {
        // fallback: create lesson by default
        lesson = await ensureLesson();
      }

      artifacts.set(key, {
        title: rawTitle,
        part: explicitPart,
        lesson: lesson
          ? lesson.toObject
            ? lesson.toObject()
            : lesson
          : undefined,
        quiz: quiz ? (quiz.toObject ? quiz.toObject() : quiz) : undefined,
        shadowing: shadowing
          ? shadowing.toObject
            ? shadowing.toObject()
            : shadowing
          : undefined,
        dictation: dictation
          ? dictation.toObject
            ? dictation.toObject()
            : dictation
          : undefined,
        topicVocab: topicVocab
          ? topicVocab.toObject
            ? topicVocab.toObject()
            : topicVocab
          : undefined,
      });
    }
  }

  // Note: per-user plans are not created here; learning path will reference metadata ids directly.

  // Create LearningPath + WeekStudy + DayStudy
  const title =
    options?.title || parsed?.summary?.title || "Lộ trình TOEIC (AI)";
  const description = parsed?.summary?.warning || "Lộ trình sinh bởi AI";
  // Map target score to a CERF level for the LearningPath.level field
  const targetScore =
    options?.targetScore || parsed?.summary?.target_score || 700;
  const level = targetScore >= 750 ? CERFLevel.C1 : CERFLevel.B2;

  // Determine time_per_day (minutes): prefer explicit hours_per_day from Gemini
  // fallbacks: parsed.summary.hours_per_day, parsed.hours_per_day,
  // or compute from estimated_hours / (total_weeks * 7). Default to 1.5h (90 minutes).
  const hoursPerDayFromGemini =
    parsed?.hours_per_day ??
    parsed?.summary?.hours_per_day ??
    (parsed && parsed.estimated_hours && parsed.total_weeks
      ? parsed.estimated_hours / (parsed.total_weeks * 7)
      : null);

  let resolvedHoursPerDay = 1.5; // default 1.5 hours
  if (
    typeof hoursPerDayFromGemini === "number" &&
    !isNaN(hoursPerDayFromGemini)
  ) {
    resolvedHoursPerDay = hoursPerDayFromGemini;
  }
  const timePerDayMinutes = Math.max(10, Math.round(resolvedHoursPerDay * 60));

  // prefer Gemini-provided study-days and end-date when available
  const daysPerWeekResolved =
    parsed?.study_days_per_week ?? parsed?.days_per_week ?? 7;
  const targetCompletionDateResolved = options?.endDate
    ? new Date(options.endDate)
    : parsed?.end_date
    ? new Date(parsed.end_date)
    : null;

  const learningPath = new LearningPath({
    title,
    description,
    level,
    isActive: true,
    week_study_ids: [],
    // Embed user-specific planning fields directly into LearningPath
    user_id: userObjectId,
    target_score: targetScore,
    time_per_day: timePerDayMinutes,
    days_per_week: daysPerWeekResolved,
    target_completion_date: targetCompletionDateResolved,
    current_week: 1,
    created_by: userObjectId,
    created_at: new Date(),
  } as any);
  await learningPath.save();

  const weekIds: Types.ObjectId[] = [];
  for (let i = 0; i < schedule.length; i++) {
    const weekNo = i + 1;
    const weekDoc = new WeekStudy({
      no: weekNo,
      description: `Tuần ${weekNo}`,
      status: weekNo === 1 ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK,
      accuracy_overall: 0,
      days: [],
    } as any);
    await weekDoc.save();

    const days = Array.isArray(schedule[i].days) ? schedule[i].days : [];

    // Group days by date so multiple entries on the same date become one DayStudy with multiple sessions
    const grouped = new Map<
      string,
      { date: string; entries: { day: any; idx: number }[]; firstIdx: number }
    >();
    for (let dIndex = 0; dIndex < days.length; dIndex++) {
      const day = days[dIndex];
      const dateKey = day?.date ? day.date.toString() : `idx-${dIndex}`;
      if (!grouped.has(dateKey))
        grouped.set(dateKey, { date: dateKey, entries: [], firstIdx: dIndex });
      grouped.get(dateKey)!.entries.push({ day, idx: dIndex });
    }

    const dayStudiesData: any[] = [];
    let groupCounter = 0;
    for (const [dateKey, group] of grouped.entries()) {
      groupCounter++;
      const dayStatus =
        weekNo === 1 && group.firstIdx === 0
          ? WeekStudyStatus.IN_PROGRESS
          : WeekStudyStatus.LOCK;
      const sessions: any[] = [];
      let sessionNo = 1;

      for (const ent of group.entries) {
        const day = ent.day;
        const rawTitle = (day.topic || day.activity || day.goal || "")
          .toString()
          .trim();
        if (!rawTitle) continue;
        const art = artifacts.get(rawTitle.toLowerCase());
        const activity = (day.activity || "").toString().toLowerCase();

        // Build a session for this entry and append
        let built: any | null = null;
        if (/(video|lesson)/i.test(activity)) {
          if (art && art.lesson) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.LESSON,
                  activity_id: art.lesson._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else if (/quiz/i.test(activity)) {
          if (art && art.quiz) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.QUIZ,
                  activity_id: art.quiz._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else if (/flashcard|vocab|vocabulary|từ vựng/i.test(activity)) {
          if (art && art.topicVocab) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.FLASH_CARD,
                  activity_id: art.topicVocab._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else if (/dictation|nghe chép|nghe chép chính tả/i.test(activity)) {
          if (art && art.dictation) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.DICTATION,
                  activity_id: art.dictation._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else if (/shadowing|repeat|speak/i.test(activity)) {
          if (art && art.shadowing) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.SHADOWING,
                  activity_id: art.shadowing._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else {
          if (art && art.lesson) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.LESSON,
                  activity_id: art.lesson._id,
                  status: dayStatus,
                },
              ],
            };
          } else if (art && art.topicVocab) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.FLASH_CARD,
                  activity_id: art.topicVocab._id,
                  status: dayStatus,
                },
              ],
            };
          }
        }

        if (built) sessions.push(built);
      }

      if (sessions.length === 0) continue;

      // compute dayOfWeek from date string if possible
      let dow = (() => {
        try {
          const dt = new Date(group.date);
          if (!isNaN(dt.getTime())) return dt.getDay();
        } catch (e) {}
        return groupCounter; // fallback
      })();

      dayStudiesData.push({
        week_id: weekDoc._id,
        dayOfWeek: dow,
        status: dayStatus,
        accuracy_overall: 0,
        sessions,
        created_at: new Date(),
      });
    }

    const dayStudies = dayStudiesData.length
      ? await DayStudy.insertMany(dayStudiesData as any[])
      : [];
    weekDoc.days = dayStudies.map((d) => d._id as Types.ObjectId);
    await weekDoc.save();
    weekIds.push(weekDoc._id as Types.ObjectId);
  }

  learningPath.week_study_ids = weekIds;
  await learningPath.save();
  // --- Auto-assign new student to a collaborator (CTV) group ---
  // Rule: choose collaborator with fewest students; if tie, choose one with highest contribution
  try {
    const collRole = await Role.findOne({ name: "collaborator" }).lean();
    if (collRole) {
      const collaborators = await User.find({ role_id: collRole._id }).lean();
      if (collaborators && collaborators.length > 0) {
        const mentorIds = collaborators.map((c: any) => c._id);

        // Load existing groups for these mentors
        const groups = await GroupUser.find({
          mentor_id: { $in: mentorIds },
        }).lean();
        const groupMap = new Map<string, any>();
        for (const g of groups) groupMap.set((g.mentor_id || "").toString(), g);

        // student counts (0 when no group exists)
        const studentCount = new Map<string, number>();
        for (const m of collaborators) {
          const key = (m._id || "").toString();
          const g = groupMap.get(key);
          studentCount.set(
            key,
            g && Array.isArray(g.students) ? g.students.length : 0
          );
        }

        // contribution counts: sum of created Lessons + Quizzes + TopicVocabularies
        const contribMap = new Map<string, number>();
        await Promise.all(
          collaborators.map(async (m: any) => {
            try {
              const [l, q, t] = await Promise.all([
                Lesson.countDocuments({ created_by: m._id }),
                Quiz.countDocuments({ created_by: m._id }),
                TopicVocabulary.countDocuments({ created_by: m._id }),
              ]);
              contribMap.set(
                (m._id || "").toString(),
                (l || 0) + (q || 0) + (t || 0)
              );
            } catch (err) {
              contribMap.set((m._id || "").toString(), 0);
            }
          })
        );

        // find mentors with minimal students
        let minStudents = Infinity;
        for (const v of studentCount.values())
          if (typeof v === "number") minStudents = Math.min(minStudents, v);
        const candidates = collaborators.filter(
          (m: any) => studentCount.get((m._id || "").toString()) === minStudents
        );
        if (candidates && candidates.length > 0) {
          // tie-breaker: highest contribution
          candidates.sort((a: any, b: any) => {
            const ca = contribMap.get((a._id || "").toString()) || 0;
            const cb = contribMap.get((b._id || "").toString()) || 0;
            if (ca !== cb) return cb - ca; // descending
            return (a._id || "")
              .toString()
              .localeCompare((b._id || "").toString());
          });

          const chosen = candidates[0];
          if (chosen) {
            const chosenKey = (chosen._id || "").toString();
            const existingGroup = groupMap.get(chosenKey);

            if (existingGroup) {
              // add student id atomically (avoid duplicates) and set learningPath_id
              await GroupUser.updateOne(
                { _id: existingGroup._id },
                {
                  $addToSet: { students: userObjectId },
                  $set: { learningPath_id: learningPath._id },
                }
              );
            } else {
              // create new group for this mentor and link learningPath
              const groupName = chosen.profile?.fullname
                ? `Nhóm ${chosen.profile.fullname}`
                : "Nhóm học viên";
              await GroupUser.create({
                name: groupName,
                mentor_id: chosen._id,
                students: [userObjectId],
                learningPath_id: learningPath._id,
                created_at: new Date(),
              } as any);
            }

            // Upsert UserProgress for this user+learningPath and set mentor_id
            try {
              const up = await UserProgress.findOne({
                user_id: userObjectId,
                learningPath_id: learningPath._id,
              });
              if (up) {
                up.mentor_id = chosen._id;
                up.updated_at = new Date();
                await up.save();
              } else {
                await UserProgress.create({
                  user_id: userObjectId,
                  learningPath_id: learningPath._id,
                  mentor_id: chosen._id,
                  updated_at: new Date(),
                } as any);
              }
            } catch (e) {
              console.warn(
                "Failed to update UserProgress with mentor info:",
                e
              );
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Auto-assign mentor failed:", e);
  }

  // Recompute full UserProgress after creating the learning path (ensures counts, times, completion_rate are accurate)
  try {
    await updateUserProgress(userObjectId, learningPath._id as Types.ObjectId);
  } catch (e) {
    console.warn(
      "⚠️ Failed to recompute UserProgress after learning path creation:",
      e
    );
  }

  return {
    model: gen?.model ?? parsed?.model ?? null,
    geminiPlan: parsed,
    learningPath,
  };
}

// ========== BUILD WEEKLY LEARNING PATH (RAG-based) ==========
/**
 * Tạo lộ trình học 1 tuần dựa trên weekly plan từ Gemini (RAG)
 * Chỉ mở bài đầu tiên của ngày đầu tiên, còn lại lock hết
 */
export async function buildWeeklyLearningPath(
  userId: string | Types.ObjectId,
  userInput: any,
  mentorId: string
) {
  const userObjectId =
    typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  // 1. Retrieve lesson-only content (no parts)
  //    We query Chroma for items with item_type='lesson', prefer items with weight <= 0.5,
  //    ask for up to 50 results and require at least 20 (top up from Mongo if needed).
  const metadataFilter: Record<string, any> = { item_type: "lesson" };
  if (userInput.level) metadataFilter.level = userInput.level;
  const searchQuery = constructSearchQuery({ ...userInput });

  const { results: ragResults, source } =
    await retrieveRelevantContentFromChroma(
      null,
      searchQuery,
      metadataFilter,
      50, // nResults
      0.5, // maxWeight (<= 0.5)
      20 // minResults
    );

  console.log(`RAG source: ${source}`);

  // 2. Group flat RAG results into RetrievedContent structure
  const retrievedContent = groupRagResultsToRetrievedContent(ragResults || []);

  // 4. Format content for LLM prompt
  const formattedContent = formatContentForPrompt(retrievedContent);

  // Xuất RAG content ra file debug
  try {
    const path = require("path");
    const fs = require("fs");
    const outputsRoot = path.resolve(__dirname, "../../../", "toeic_outputs");
    fs.mkdirSync(outputsRoot, { recursive: true });
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const ragDebugPath = path.join(outputsRoot, `${ts}-rag-content.txt`);
    fs.writeFileSync(ragDebugPath, formattedContent, "utf8");
  } catch (e) {
    console.warn("⚠️ Không thể ghi RAG debug file:", e);
  }

  // 2) Gọi Gemini sinh weekly plan dựa trên RAG
  const { model, json: weeklyPlan } = await generateWeeklyPlanWithRAG(
    userInput,
    mentorId
  );
  if (!weeklyPlan || !weeklyPlan.week_plan) {
    throw new Error("Gemini không trả về weekly plan hợp lệ");
  }
  // Weekly plan received from Gemini

  // 3) Tạo LearningPath (chỉ 1 tuần) - TẠM THỜI CHƯA GẮN week_study_ids
  const lpTitle = `Lộ trình TOEIC - Tuần ${weeklyPlan.week_plan.week || 1}`;
  const lpDesc = weeklyPlan.week_plan.goal || "Lộ trình học TOEIC 1 tuần (RAG)";
  const lpLevel = CERFLevel.B1; // mặc định

  // Calculate time_per_day from weekly_study_hours
  const weeklyHours = userInput?.weekly_study_hours || 10;
  const daysPerWeek = userInput?.study_days_per_week || 7;
  const timePerDayMinutes = Math.round((weeklyHours / daysPerWeek) * 60);

  const learningPath = await LearningPath.create({
    user_id: userObjectId,
    title: lpTitle,
    description: lpDesc,
    level: lpLevel,
    target_score: userInput?.target_score || 0,
    time_per_day: timePerDayMinutes,
    days_per_week: daysPerWeek,
    isActive: true,
    created_at: new Date(),
    created_by: userObjectId,
    week_study_ids: [], // sẽ update sau
  } as any);

  // 4) Tạo WeekStudy (tuần 1) - TẠM THỜI CHƯA GẮN days
  const weekDoc = await WeekStudy.create({
    no: weeklyPlan.week_plan.week || 1,
    status: WeekStudyStatus.IN_PROGRESS,
    started_at: weeklyPlan.summary?.start_date
      ? new Date(weeklyPlan.summary.start_date)
      : undefined,
    ended_at: weeklyPlan.summary?.end_date
      ? new Date(weeklyPlan.summary.end_date)
      : undefined,
    description: weeklyPlan.week_plan.goal || "Học tập chăm chỉ",
    accuracy_overall: 0,
    days: [], // sẽ update sau
  } as any);

  // 5) Duyệt từng ngày và tạo DayStudy + sessions
  const days = weeklyPlan.week_plan.days || [];
  const dayStudyIds: Types.ObjectId[] = [];
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex];
    const activities = Array.isArray(day.activities) ? day.activities : [];
    if (!activities.length) continue;

    // Xác định trạng thái ngày: chỉ ngày đầu tiên là IN_PROGRESS
    const dayStatus =
      dayIndex === 0 ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK;

    // Tạo DayStudy trước, sessions sẽ fill sau
    const dayStudyDoc = await DayStudy.create({
      week_id: weekDoc._id,
      dayOfWeek: (() => {
        try {
          const dt = day?.date ? new Date(day.date) : null;
          if (dt && !isNaN(dt.getTime())) return dt.getDay();
        } catch (e) {}
        return (dayIndex + 1) % 7; // fallback
      })(),
      status: dayStatus,
      accuracy_overall: 0,
      sessions: [],
      created_at: new Date(),
    } as any);

    // Build sessions: chỉ mở khoá session đầu tiên của ngày đầu tiên
    const sessions: any[] = [];
    let isFirstSession = dayIndex === 0; // true chỉ ở ngày đầu tiên
    let sessionNo = 1;

    for (const activity of activities) {
      const t = (activity?.type || "").toString().toLowerCase();
      const ridString = activity?.resource_id
        ? activity.resource_id.toString()
        : null;
      if (!ridString) {
        console.warn(
          `⚠️ Day ${
            dayIndex + 1
          }: activity type "${t}" thiếu resource_id, bỏ qua`
        );
        continue;
      }

      let rid: Types.ObjectId | null = null;
      try {
        rid = new Types.ObjectId(ridString);
      } catch (e) {
        console.warn(
          `⚠️ Day ${
            dayIndex + 1
          }: resource_id "${ridString}" không phải ObjectId hợp lệ, bỏ qua`
        );
        continue;
      }

      let kind: SessionType | null = null;
      let collectionName = "";
      if (t === "lesson" || t === "video") {
        kind = SessionType.LESSON;
        collectionName = "lessons";
      } else if (t === "quiz") {
        kind = SessionType.QUIZ;
        collectionName = "quizzes";
      } else if (t === "vocabulary" || t === "flashcard") {
        kind = SessionType.FLASH_CARD;
        collectionName = "topicvocabularies";
      } else if (t === "dictation") {
        kind = SessionType.DICTATION;
        collectionName = "dictations";
      } else if (t === "shadowing") {
        kind = SessionType.SHADOWING;
        collectionName = "shadowings";
      } else if (t === "mini_test" || t === "test") {
        kind = SessionType.MINI_TEST;
        collectionName = "tests";
      }
      if (!kind) {
        console.warn(
          `⚠️ Day ${dayIndex + 1}: unknown activity type "${t}", bỏ qua`
        );
        continue;
      }

      // Do not check retrievedContent / DB for resource presence.
      // Trust Gemini's `resource_id` and create session referencing it directly.
      const ridStr = rid.toString();

      const sessionStatus = isFirstSession
        ? WeekStudyStatus.IN_PROGRESS
        : WeekStudyStatus.LOCK;
      // Sau khi tạo session đầu tiên của ngày đầu tiên -> các session còn lại lock
      if (isFirstSession) isFirstSession = false;

      // Optionally set part_type from Gemini activity if provided (1..7)
      let validPartType: number | undefined = undefined;
      try {
        const candidate = Number(activity?.part || activity?.part_type);
        if (!isNaN(candidate) && candidate >= 1 && candidate <= 7)
          validPartType = candidate;
      } catch (e) {
        /* ignore */
      }

      const sessionData: any = {
        session_no: sessionNo++,
        status: sessionStatus,
        items: [
          {
            kind,
            activity_id: rid,
            status: sessionStatus,
          },
        ],
      };

      if (validPartType !== undefined) {
        sessionData.part_type = validPartType;
      }

      sessions.push(sessionData);
    }

    if (sessions.length === 0) {
      // không có session hợp lệ -> xoá day vừa tạo để tránh rác
      await DayStudy.deleteOne({ _id: dayStudyDoc._id });
      continue;
    }

    // GẮN sessions vào DayStudy VÀ LƯU LẠI
    dayStudyDoc.sessions = sessions as any;
    await dayStudyDoc.save();
    dayStudyIds.push(dayStudyDoc._id as Types.ObjectId);
  }

  // 6) GẮN days vào WeekStudy VÀ LƯU LẠI
  weekDoc.days = dayStudyIds;
  await weekDoc.save();

  // 7) GẮN week_study_ids vào LearningPath VÀ LƯU LẠI
  learningPath.week_study_ids = [weekDoc._id as Types.ObjectId];
  await learningPath.save();

  // 8) Lưu UserProgress để track tiến độ học
  try {
    const up = await UserProgress.findOne({
      user_id: userObjectId,
      learningPath_id: learningPath._id,
    });
    if (up) {
      up.mentor_id = new Types.ObjectId(mentorId);
      up.current_score = userInput?.current_score || up.current_score || 0;
      up.target_score = userInput?.target_score || up.target_score || 0;
      up.updated_at = new Date();
      await up.save();
    } else {
      await UserProgress.create({
        user_id: userObjectId,
        learningPath_id: learningPath._id,
        mentor_id: new Types.ObjectId(mentorId),
        current_score: userInput?.current_score || 0,
        target_score: userInput?.target_score || 0,
        completed_lessons: 0,
        total_lessons: 0,
        completion_rate: 0,
        total_study_time: 0,
        streak_days: 0,
        longest_streak: 0,
        updated_at: new Date(),
      } as any);
    }
  } catch (e) {
    console.warn("⚠️ Failed to save UserProgress:", e);
  }

  // Recompute full UserProgress one time after creating weekly learning path
  try {
    await updateUserProgress(userObjectId, learningPath._id as Types.ObjectId);
  } catch (err) {
    console.warn(
      "⚠️ Failed to recompute UserProgress for weekly learning path:",
      err
    );
  }

  return {
    model,
    weeklyPlan,
    learningPath,
  };
}
