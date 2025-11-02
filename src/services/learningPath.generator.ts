import { Types } from "mongoose";
import { generateToeicPlan } from "./gemini.service";
import {
  Lesson,
  LessonSection,
  TopicVocabulary,
  FlashCardPlan,
  Quiz,
  QuizPlan,
  ShadowingPlan,
  DictationPlan,
  LearningPath,
  WeekStudy,
  DayStudy,
  Media,
} from "../models";
import { Shadowing } from "../models/shadowing.model";
import { Dictation } from "../models/dictation.model";
import {
  createUserLearningPath,
  generateWeeklyDayStudies,
} from "./user_learningPath.service";
import { PartType } from "../models/enums/PartType";
import { TestStatus } from "../models/enums/TestStatus";
import { CERFLevel } from "../models/topic_vocabulary.model";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { SessionType } from "../models/enums/SessionType";

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
      // For session mapping, only set part if Gemini explicitly mentions Part X.
      const explicitPart = detectExplicitPartFromText(rawTitle);

      // Lesson (find or create)
      let lesson = await Lesson.findOne({
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
        // If activity indicates a video, create a Media and a media-type section
        const isVideo = /video|youtube|watch|watch\?/i.test(rawTitle);
        let section;
        if (isVideo) {
          const media = await Media.create({
            topic: rawTitle,
            url: "https://youtu.be/CKgCahkAkQ8?list=PL8ttwakxyDAEKWvNtd_Pzs3Mou75JqeCe",
            type: "video",
            created_at: new Date(),
            updated_at: new Date(),
          } as any);
          section = await LessonSection.create({
            lesson_id: lesson._id,
            order: 0,
            title: "Video",
            type: "media",
            medias_id: [media._id],
            created_at: new Date(),
            updated_at: new Date(),
          } as any);
        } else {
          section = await LessonSection.create({
            lesson_id: lesson._id,
            order: 0,
            title: "Meta",
            type: "text",
            content: `AI generated placeholder for ${rawTitle}`,
            created_at: new Date(),
            updated_at: new Date(),
          } as any);
        }
        lesson.sections_id = [section._id as Types.ObjectId];
        await lesson.save();
      }

      // Create Quiz / Shadowing / Dictation / TopicVocabulary and user plans (minimal meta)
      const quiz = await Quiz.create({
        title: rawTitle,
        question_ids: [],
        part_type: part,
        level: CERFLevel.A2,
        status: TestStatus.APPROVED,
        planned_completion_time: 5,
        weight: 0.1,
      } as any);
      // Create shadowing using template content but override title/part/level
      const shadowingPayload = {
        ...SHADOWING_TEMPLATE,
        title: rawTitle,
        part_type: part,
        level: CERFLevel.A2,
        status: TestStatus.APPROVED,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: DEFAULT_CREATOR_ID,
      } as any;

      const shadowing = await Shadowing.create(shadowingPayload);
      // Create dictation using template content but override title/part/level
      const dictationPayload = {
        ...DICTATION_TEMPLATE,
        title: rawTitle,
        part_type: part,
        level: CERFLevel.A2,
        status: TestStatus.APPROVED,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: DEFAULT_CREATOR_ID,
      } as any;

      const dictation = await Dictation.create(dictationPayload);
      const topicVocab = await TopicVocabulary.create({
        title: rawTitle,
        description: `[AI GENERATED] ${rawTitle}`,
        tags: [],
        level: CERFLevel.A2,
        iconName: "",
        bgColor: "ffffff",
        gradient: "",
        vocabularies_id: [],
        isCollaborator: false,
        isPublic: false,
        created_at: new Date(),
        created_by: DEFAULT_CREATOR_ID,
      } as any);

      const flashPlan = await FlashCardPlan.create({
        user_id: userObjectId,
        topic_vocabulary_id: topicVocab._id,
        total_attempts: 0,
        accuracy_overall: 0,
      } as any);
      const quizPlan = await QuizPlan.create({
        user_id: userObjectId,
        quiz_id: quiz._id,
        total_attempts: 0,
        accuracy_overall: 0,
      } as any);
      const shadowPlan = await ShadowingPlan.create({
        user_id: userObjectId,
        shadowing_id: shadowing._id,
        total_attempts: 0,
        accuracy_overall: 0,
      } as any);
      const dictPlan = await DictationPlan.create({
        user_id: userObjectId,
        dictation_id: dictation._id,
        total_attempts: 0,
        accuracy_overall: 0,
      } as any);

      artifacts.set(key, {
        title: rawTitle,
        part: explicitPart,
        lesson: lesson.toObject ? lesson.toObject() : lesson,
        quiz: quiz.toObject ? quiz.toObject() : quiz,
        shadowing: shadowing.toObject ? shadowing.toObject() : shadowing,
        dictation: dictation.toObject ? dictation.toObject() : dictation,
        topicVocab: topicVocab.toObject ? topicVocab.toObject() : topicVocab,
        plans: {
          flash: { _id: flashPlan._id, part_type: part },
          quiz: { _id: quizPlan._id, part_type: part },
          shadow: { _id: shadowPlan._id, part_type: part },
          dict: { _id: dictPlan._id, part_type: part },
        },
      });
    }
  }

  // Prepare arrays expected by generateWeeklyDayStudies (objects with _id and part_type)
  const flashcardsArr: any[] = [];
  const quizesArr: any[] = [];
  const shadowingsArr: any[] = [];
  const dictationsArr: any[] = [];
  for (const v of artifacts.values()) {
    const p = v.part;
    flashcardsArr.push({ _id: v.plans.flash._id, part_type: p });
    quizesArr.push({ _id: v.plans.quiz._id, part_type: p });
    shadowingsArr.push({ _id: v.plans.shadow._id, part_type: p });
    dictationsArr.push({ _id: v.plans.dict._id, part_type: p });
  }

  // Create LearningPath + WeekStudy + DayStudy
  const title =
    options?.title || parsed?.summary?.title || "Lộ trình TOEIC (AI)";
  const description = parsed?.summary?.warning || "Lộ trình sinh bởi AI";
  // Map target score to a CERF level for the LearningPath.level field
  const targetScore =
    options?.targetScore || parsed?.summary?.target_score || 700;
  const level = targetScore >= 750 ? CERFLevel.C1 : CERFLevel.B2;

  const learningPath = new LearningPath({
    title,
    description,
    level,
    isActive: true,
    week_study_ids: [],
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
          if (art && art.plans && art.plans.quiz) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.QUIZ,
                  activity_id: art.plans.quiz._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else if (/flashcard|vocab|vocabulary|từ vựng/i.test(activity)) {
          if (art && art.plans && art.plans.flash) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.FLASH_CARD,
                  activity_id: art.plans.flash._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else if (/dictation|nghe chép|nghe chép chính tả/i.test(activity)) {
          if (art && art.plans && art.plans.dict) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.DICTATION,
                  activity_id: art.plans.dict._id,
                  status: dayStatus,
                },
              ],
            };
          }
        } else if (/shadowing|repeat|speak/i.test(activity)) {
          if (art && art.plans && art.plans.shadow) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.SHADOWING,
                  activity_id: art.plans.shadow._id,
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
          } else if (art && art.plans && art.plans.flash) {
            built = {
              session_no: sessionNo++,
              status: dayStatus,
              part_type: art.part,
              items: [
                {
                  kind: SessionType.FLASH_CARD,
                  activity_id: art.plans.flash._id,
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

  const userLP = await createUserLearningPath(
    userId,
    (learningPath._id as Types.ObjectId).toString(),
    options?.targetScore || parsed?.summary?.target_score || 700,
    90,
    7,
    options?.endDate ? new Date(options.endDate) : new Date()
  );

  return {
    model: gen?.model ?? parsed?.model ?? null,
    geminiPlan: parsed,
    learningPath,
    userLearningPath: userLP,
  };
}
