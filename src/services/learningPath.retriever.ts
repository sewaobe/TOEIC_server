/**
 * learningPath.retriever.ts
 *
 * Service lấy nội dung bài học từ DB (Mongoose) theo mentor_id
 * để cung cấp context cho Gemini khi tạo lộ trình học 1 tuần.
 *
 * KHÔNG sử dụng ChromaDB - chỉ query trực tiếp MongoDB.
 */

import { Types } from "mongoose";
import { Lesson, Quiz, TopicVocabulary, Test } from "../models";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { TestStatus } from "../models/enums/TestStatus";

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
