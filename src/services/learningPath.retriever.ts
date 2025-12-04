/**
 * learningPath.retriever.ts
 *
 * Service lấy nội dung bài học từ DB (Mongoose) hoặc ChromaDB (RAG) theo mentor_id
 * để cung cấp context cho Gemini khi tạo lộ trình học 1 tuần.
 */

import { Types } from "mongoose";
import { Lesson, Quiz, TopicVocabulary, Test } from "../models";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { TestStatus } from "../models/enums/TestStatus";
import { getLearningItemCollection } from "../core/collections/learning";
import { ingestLearning } from "../ingest/ingest_learning";

export interface RetrievedContent {
  lessons: any[];
  quizzes: any[];
  vocabularies: any[];
  dictations: any[];
  shadowings: any[];
  tests: any[];
}

/**
 * Lấy tất cả nội dung bài học từ DB được tạo bởi mentor_id
 * Chỉ lấy các bài có status = APPROVED hoặc PUBLISHED
 */
export async function retrieveContentByMentor(
  mentorId: Types.ObjectId | string
): Promise<RetrievedContent> {
  const mentorObjectId =
    typeof mentorId === "string" ? new Types.ObjectId(mentorId) : mentorId;

  // Query song song tất cả collections
  const [lessons, quizzes, vocabularies, dictations, shadowings, tests] =
    await Promise.all([
      Lesson.find({
        created_by: mentorObjectId,
      })
        .populate("sections_id")
        .lean(),

      // Quiz, Dictation, Shadowing KHÔNG có created_by → lấy tất cả
      Quiz.find({}).populate("question_ids").lean(),

      TopicVocabulary.find({
        created_by: mentorObjectId,
      })
        .populate("vocabularies_id")
        .lean(),

      Dictation.find({}).lean(),

      Shadowing.find({}).lean(),

      Test.find({
        created_by: mentorObjectId,
      })
        .populate("groups")
        .lean(),
    ]);

  return {
    lessons: lessons || [],
    quizzes: quizzes || [],
    vocabularies: vocabularies || [],
    dictations: dictations || [],
    shadowings: shadowings || [],
    tests: tests || [],
  };
}

/**
 * Format nội dung thành text để inject vào prompt Gemini
 */
export function formatContentForPrompt(content: RetrievedContent): string {
  let formatted = "# NỘI DUNG BÀI HỌC CÓ SẴN TRONG DATABASE\n\n";

  // Lessons
  if (content.lessons.length > 0) {
    formatted += "## 📚 BÀI HỌC (LESSONS)\n\n";
    content.lessons.forEach((lesson: any, idx: number) => {
      formatted += `${idx + 1}. **${lesson.title}** (ID: ${lesson._id})\n`;
      formatted += `   - Part: ${lesson.part_type}\n`;
      formatted += `   - Thời gian: ${lesson.planned_completion_time} phút\n`;
      formatted += `   - Tóm tắt: ${lesson.summary || "Không có"}\n\n`;
    });
  }

  // Quizzes
  if (content.quizzes.length > 0) {
    formatted += "## ❓ BÀI KIỂM TRA (QUIZZES)\n\n";
    content.quizzes.forEach((quiz: any, idx: number) => {
      formatted += `${idx + 1}. **${quiz.title}** (ID: ${quiz._id})\n`;
      formatted += `   - Part: ${quiz.part_type || "Tổng hợp"}\n`;
      formatted += `   - Level: ${quiz.level}\n`;
      formatted += `   - Số câu hỏi: ${quiz.question_ids?.length || 0}\n`;
      formatted += `   - Thời gian: ${quiz.planned_completion_time} phút\n\n`;
    });
  }

  // Vocabularies
  if (content.vocabularies.length > 0) {
    formatted += "## 📖 CHỦ ĐỀ TỪ VỰNG (VOCABULARY TOPICS)\n\n";
    content.vocabularies.forEach((vocab: any, idx: number) => {
      formatted += `${idx + 1}. **${vocab.title}** (ID: ${vocab._id})\n`;
      formatted += `   - Level: ${vocab.level}\n`;
      formatted += `   - Số từ: ${vocab.vocabularies_id?.length || 0}\n`;
      formatted += `   - Mô tả: ${vocab.description || "Không có"}\n\n`;
    });
  }

  // Dictations
  if (content.dictations.length > 0) {
    formatted += "## ✍️ BÀI CHÉP CHÍNH TẢ (DICTATIONS)\n\n";
    content.dictations.forEach((dict: any, idx: number) => {
      formatted += `${idx + 1}. **${dict.title}** (ID: ${dict._id})\n`;
      formatted += `   - Part: ${dict.part_type || "Tổng hợp"}\n`;
      formatted += `   - Level: ${dict.level}\n`;
      formatted += `   - Thời gian: ${dict.duration || 0} giây\n\n`;
    });
  }

  // Shadowings
  if (content.shadowings.length > 0) {
    formatted += "## 🎤 BÀI SHADOWING\n\n";
    content.shadowings.forEach((shadow: any, idx: number) => {
      formatted += `${idx + 1}. **${shadow.title}** (ID: ${shadow._id})\n`;
      formatted += `   - Part: ${shadow.part_type}\n`;
      formatted += `   - Level: ${shadow.level}\n`;
      formatted += `   - Thời gian: ${shadow.duration || 0} giây\n\n`;
    });
  }

  // Tests (Mini test / Full test)
  if (content.tests.length > 0) {
    formatted += "## 📝 BÀI KIỂM TRA (MINI/FULL TESTS)\n\n";
    content.tests.forEach((test: any, idx: number) => {
      formatted += `${idx + 1}. **${test.title}** (ID: ${test._id})\n`;
      formatted += `   - Loại: ${test.type}\n`;
      formatted += `   - Topic: ${test.topic || "Tổng hợp"}\n`;
      formatted += `   - Số nhóm câu hỏi: ${test.groups?.length || 0}\n\n`;
    });
  }

  if (
    content.lessons.length === 0 &&
    content.quizzes.length === 0 &&
    content.vocabularies.length === 0 &&
    content.dictations.length === 0 &&
    content.shadowings.length === 0 &&
    content.tests.length === 0
  ) {
    formatted +=
      "⚠️ **CẢNH BÁO**: Mentor chưa tạo bài học nào. Không thể tạo lộ trình.\n";
  }

  return formatted;
}

/**
 * Xây dựng search query cho ChromaDB từ user input
 * @param userInput Thông tin người dùng (điểm hiện tại, mục tiêu, kỹ năng yếu, sở thích)
 * @returns Câu query mô tả ngữ nghĩa để search trong ChromaDB
 */
export function constructSearchQuery(userInput: {
  current_score?: number;
  target_score?: number;
  weak_skill?: string;
  interested_topics?: string[];
  part?: number; // optional part filter (1..7)
  difficulty?: string; // optional difficulty token (easy/medium/hard)
  level?: string; // optional textual level
  title?: string; // optional title/topic token to include in query
}): string {
  // Special handling for each TOEIC part (1..7) so queries better match DB content
  if (
    typeof userInput.part === "number" &&
    userInput.part >= 1 &&
    userInput.part <= 7
  ) {
    const difficulty =
      userInput.difficulty ||
      userInput.level ||
      "appropriate difficulty for the user";
    const part = userInput.part;
    let partDesc = "";
    switch (part) {
      case 1:
        partDesc =
          "picture description / single-image speaking prompts (short listening)";
        break;
      case 2:
        partDesc =
          "short question-response / short conversation listening items";
        break;
      case 3:
        partDesc =
          "longer dialogues / multi-speaker listening passages with multiple questions";
        break;
      case 4:
        partDesc =
          "short talks / monologues with multiple questions (listening)";
        break;
      case 5:
        partDesc =
          "single-sentence grammar/vocabulary multiple-choice (error recognition)";
        break;
      case 6:
        partDesc =
          "text/paragraph completion, sentence insertion and context understanding tasks";
        break;
      case 7:
        partDesc =
          "reading comprehension passages and multiple-question sets (longer reading)";
        break;
      default:
        partDesc = "general TOEIC practice items";
    }

    let q = `TOEIC Part ${part} learning items, ${partDesc}, difficulty: ${difficulty}`;
    // add common DB tokens to help matching
    if (userInput.title) q += `, title: ${userInput.title}`;
    if (userInput.interested_topics && userInput.interested_topics.length > 0)
      q += `, topics: ${userInput.interested_topics.join(", ")}`;
    if (userInput.weak_skill) q += `, focus on ${userInput.weak_skill}`;
    if (userInput.target_score && userInput.target_score > 800)
      q += `, advanced level`;
    else q += `, suitable for basic/intermediate learners`;
    if (userInput.interested_topics && userInput.interested_topics.length > 0)
      q += `, topics: ${userInput.interested_topics.join(", ")}`;
    return q;
  }

  // Generic TOEIC query
  let query = "TOEIC learning materials";

  if (userInput.target_score && userInput.target_score > 800) {
    query += ", advanced level, difficult questions";
  } else {
    query += ", basic elementary";
  }

  if (userInput.weak_skill) {
    query += `, focus on ${userInput.weak_skill}`;
  }

  if (userInput.interested_topics && userInput.interested_topics.length > 0) {
    query += `, topics: ${userInput.interested_topics.join(", ")}`;
  }

  return query;
}

/**
 * Lấy nội dung liên quan từ ChromaDB bằng RAG (Retrieval-Augmented Generation)
 * Có fallback về MongoDB nếu ChromaDB fails hoặc trả về rỗng
 * @param mentorId ID của mentor
 * @param searchQuery Câu query tìm kiếm ngữ nghĩa
 * @returns Mảng các document đã được map về dạng giống MongoDB
 */
export async function retrieveRelevantContentFromChroma(
  mentorId: string | null,
  searchQuery: string,
  metadataFilter?: Record<string, any>,
  nResults: number = 40,
  maxWeight?: number,
  minResults: number = 0
): Promise<{ results: any[]; source: "chroma" | "mongo" }> {
  try {
    const collection = await getLearningItemCollection();

    // Build query params. If mentorId is null, do not apply mentor filter (global search)
    const queryParams: any = {
      queryTexts: [searchQuery],
      nResults: nResults,
    };
    // Prefer explicit metadata filter when provided (part_type, level, item_type, topic, etc.)
    if (metadataFilter && Object.keys(metadataFilter).length > 0) {
      queryParams.where = metadataFilter;
    } else if (mentorId) {
      queryParams.where = { mentorId: mentorId };
    }

    // Query ChromaDB with semantic search
    const result = await collection.query(queryParams);

    const ids = result.ids?.[0] || [];
    const metadatas = result.metadatas?.[0] || [];
    const documents = result.documents?.[0] || [];

    // Map Chroma results back to MongoDB-like document structure
    const mappedResults: any[] = [];
    for (let i = 0; i < ids.length; i++) {
      const metadata = metadatas[i] as any;
      const document = documents[i];

      mappedResults.push({
        _id: metadata.original_id || ids[i],
        title: metadata.title,
        type: metadata.type || metadata.item_type,
        item_type: metadata.item_type || metadata.type,
        part_type: metadata.part_type,
        level: metadata.level,
        planned_completion_time: metadata.duration, // For Lesson/Quiz
        duration: metadata.duration, // For Dictation/Shadowing
        question_ids: new Array(metadata.question_count || 0), // Mock array for length check
        vocabularies_id: new Array(metadata.question_count || 0), // For vocabularies
        groups: new Array(metadata.question_count || 0), // For tests
        metadata: metadata,
        description: document,
        summary: document,
      });
    }

    // Local filtering by item_type and weight (maxWeight) when requested
    let filtered = mappedResults;
    if (metadataFilter && Object.keys(metadataFilter).length > 0) {
      // simple equality filters
      filtered = filtered.filter((it) => {
        let ok = true;
        for (const k of Object.keys(metadataFilter)) {
          const v = metadataFilter[k];
          const actual = it.metadata?.[k] ?? (it as any)[k];
          if (v === undefined) continue;
          if (actual === undefined) {
            ok = false;
            break;
          }
          if (typeof v === "string") {
            if (
              actual?.toString().toLowerCase() !== v.toString().toLowerCase()
            ) {
              ok = false;
              break;
            }
          } else if (actual !== v) {
            ok = false;
            break;
          }
        }
        return ok;
      });
    }

    if (typeof maxWeight === "number") {
      filtered = filtered.filter((it) => {
        const w = Number(it.metadata?.weight ?? it.weight ?? 1);
        return !isNaN(w) && w <= maxWeight;
      });
    }

    // If Chroma returned none after filtering, fallback to Mongo
    if (filtered.length === 0 && ids.length === 0) {
      console.warn(
        "ChromaDB returned 0 results for semantic query. Falling back to MongoDB retrieval. Query=",
        searchQuery
      );
      const fallback = await fallbackToMongoRetrieval(mentorId);
      return { results: fallback, source: "mongo" };
    }

    // If fewer than minResults requested, try to top up from Mongo fallback
    if (minResults > 0 && filtered.length < minResults) {
      const fallback = await fallbackToMongoRetrieval(mentorId);
      // keep only lessons from fallback and apply same maxWeight/filter rules
      const fallbackFiltered = (fallback || []).filter((it: any) => {
        const type = (it?.type || it?.item_type || "").toString().toLowerCase();
        if (
          metadataFilter &&
          metadataFilter.item_type &&
          metadataFilter.item_type !== type
        )
          return false;
        const w = Number(it.weight ?? it.metadata?.weight ?? 1);
        if (
          typeof maxWeight === "number" &&
          (!w || isNaN(w) ? false : w > maxWeight)
        )
          return false;
        return true;
      });

      // merge dedup
      const idsSeen = new Set(filtered.map((r) => (r._id || r.id).toString()));
      for (const f of fallbackFiltered) {
        const fid = (f._id || f.id || "").toString();
        if (!fid) continue;
        if (idsSeen.has(fid)) continue;
        filtered.push(f);
        idsSeen.add(fid);
        if (filtered.length >= minResults) break;
      }
    }

    // limit to nResults
    const finalResults = filtered.slice(0, nResults);

    return { results: finalResults, source: "chroma" };
  } catch (error) {
    const errMsg = (error as any)?.message || error;
    console.warn(
      "ChromaDB query failed — falling back to MongoDB. Error:",
      errMsg
    );
    const fallback = await fallbackToMongoRetrieval(mentorId);
    return { results: fallback, source: "mongo" };
  }
}

/**
 * Fallback: Lấy dữ liệu từ MongoDB và convert sang flat array
 */
async function fallbackToMongoRetrieval(
  mentorId?: string | null
): Promise<any[]> {
  // If mentorId provided => reuse existing mentor-scoped retrieval
  if (mentorId) {
    const content = await retrieveContentByMentor(mentorId as any);
    const flatResults: any[] = [];

    content.lessons.forEach((item: any) => {
      flatResults.push({ ...item, type: "lesson" });
    });
    content.quizzes.forEach((item: any) => {
      flatResults.push({ ...item, type: "quiz" });
    });
    content.vocabularies.forEach((item: any) => {
      flatResults.push({ ...item, type: "vocabulary" });
    });
    content.dictations.forEach((item: any) => {
      flatResults.push({ ...item, type: "dictation" });
    });
    content.shadowings.forEach((item: any) => {
      flatResults.push({ ...item, type: "shadowing" });
    });
    content.tests.forEach((item: any) => {
      flatResults.push({ ...item, type: "test" });
    });

    return flatResults;
  }

  // No mentorId: return global content (all mentors)
  const [lessons, quizzes, vocabularies, dictations, shadowings, tests] =
    await Promise.all([
      Lesson.find({}).populate("sections_id").lean(),
      Quiz.find({}).populate("question_ids").lean(),
      TopicVocabulary.find({}).populate("vocabularies_id").lean(),
      Dictation.find({}).lean(),
      Shadowing.find({}).lean(),
      Test.find({}).populate("groups").lean(),
    ]);

  const flatResults: any[] = [];
  lessons.forEach((item: any) => flatResults.push({ ...item, type: "lesson" }));
  quizzes.forEach((item: any) => flatResults.push({ ...item, type: "quiz" }));
  vocabularies.forEach((item: any) =>
    flatResults.push({ ...item, type: "vocabulary" })
  );
  dictations.forEach((item: any) =>
    flatResults.push({ ...item, type: "dictation" })
  );
  shadowings.forEach((item: any) =>
    flatResults.push({ ...item, type: "shadowing" })
  );
  tests.forEach((item: any) => flatResults.push({ ...item, type: "test" }));

  return flatResults;
}

/**
 * Chuẩn bị dữ liệu mentor theo format cho ingestLearning (grouped by part 1-7)
 */
export async function prepareMentorDataForIngest(mentorId: string) {
  const content = await retrieveContentByMentor(mentorId);
  const grouped: Record<number, any> = {};

  // Nhóm theo part_type (1-7)
  for (let part = 1; part <= 7; part++) {
    grouped[part] = {
      lessons: content.lessons.filter((l: any) => l.part_type === part),
      quizzes: content.quizzes.filter((q: any) => q.part_type === part),
      vocab: content.vocabularies.filter((v: any) => v.part_type === part),
      dictations: content.dictations.filter((d: any) => d.part_type === part),
      shadowings: content.shadowings.filter((s: any) => s.part_type === part),
    };
  }

  return grouped;
}

/**
 * Ingest dữ liệu mentor vào ChromaDB (gọi trước khi query)
 */
export async function ingestMentorToChroma(mentorId: string) {
  try {
    console.log(`📥 Ingesting mentor ${mentorId} content to Chroma...`);
    const data = await prepareMentorDataForIngest(mentorId);
    await ingestLearning(data);
    console.log(`✅ Mentor ${mentorId} content ingested successfully`);
  } catch (err) {
    console.error(
      `⚠️ Failed to ingest mentor ${mentorId}:`,
      (err as Error).message
    );
  }
}
