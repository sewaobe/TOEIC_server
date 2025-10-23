import { Types } from "mongoose";
import { Quiz } from "../models/quiz.model";
import { Question } from "../models/question.model";
import { PartType } from "../models/enums/PartType";
import { TestStatus } from "../models/enums/TestStatus";
import { CERFLevel } from "../models/topic_vocabulary.model";
import { appEvents } from "../core/appEvents"; // ✅ import event system

/* 🟢 TẠO QUIZ MỚI */
export const createQuizService = async (data: any) => {
  const topicIds: Types.ObjectId[] = Array.isArray(data.topic)
    ? data.topic
        .filter((id: string) => Types.ObjectId.isValid(id))
        .map((id: string) => new Types.ObjectId(id))
    : [];

  // 🧩 Chuẩn hóa part_type
  if (
    typeof data.part_type === "string" &&
    data.part_type.startsWith("PART_")
  ) {
    data.part_type = Number(data.part_type.replace("PART_", ""));
  }
  if (typeof data.part_type === "string" && !isNaN(Number(data.part_type))) {
    data.part_type = Number(data.part_type);
  }

  // ✅ Tạo danh sách câu hỏi trong DB
  const createdQuestions: Types.ObjectId[] = [];
  if (Array.isArray(data.question_ids)) {
    for (let i = 0; i < data.question_ids.length; i++) {
      const q = data.question_ids[i];
      const newQ = await Question.create({
        name: q.name || `Question ${i + 1}`,
        textQuestion: q.textQuestion || "",
        choices: q.choices || {},
        correctAnswer: q.correctAnswer || "",
        explanation: q.explanation || "",
        tags: q.tags || [],
        planned_time: q.planned_time || 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
      createdQuestions.push(newQ._id);
    }
  }

  // ✅ Tạo quiz
  const newQuiz = await Quiz.create({
    title: data.title?.trim() || "Quiz mới",
    topic: topicIds,
    part_type: data.part_type ?? PartType.PART_5,
    level: data.level ?? CERFLevel.A2,
    status: data.status ?? TestStatus.DRAFT,
    planned_completion_time: data.planned_completion_time ?? 0,
    weight: data.weight ?? 0.1,
    question_ids: createdQuestions,
  });

  // 🔔 Phát event "quiz.created"
  await appEvents.emitAsync("quiz.created", newQuiz);

  return await Quiz.findById(newQuiz._id)
    .populate("question_ids")
    .populate("topic", "title")
    .lean();
};

/* 🟡 CẬP NHẬT QUIZ */
export const updateQuizService = async (id: string, data: any) => {
  const quiz = await Quiz.findById(id);
  if (!quiz) return null;

  // 🔴 Xóa các câu hỏi cũ
  if (quiz.question_ids?.length) {
    await Question.deleteMany({ _id: { $in: quiz.question_ids } });
  }

  // ✅ Tạo lại các câu hỏi mới
  const createdQuestions: Types.ObjectId[] = [];
  if (Array.isArray(data.question_ids)) {
    for (let i = 0; i < data.question_ids.length; i++) {
      const q = data.question_ids[i];
      const newQ = await Question.create({
        name: q.name || `Question ${i + 1}`,
        textQuestion: q.textQuestion || "",
        choices: q.choices || {},
        correctAnswer: q.correctAnswer || "",
        explanation: q.explanation || "",
        tags: q.tags || [],
        planned_time: q.planned_time || 0,
        created_at: new Date(),
        updated_at: new Date(),
      });
      createdQuestions.push(newQ._id);
    }
  }

  // ✅ Cập nhật thông tin quiz
  quiz.title = data.title ?? quiz.title;
  quiz.topic = data.topic ?? quiz.topic;
  quiz.part_type = data.part_type ?? quiz.part_type;
  quiz.level = data.level ?? quiz.level;
  quiz.status = data.status ?? quiz.status;
  quiz.planned_completion_time =
    data.planned_completion_time ?? quiz.planned_completion_time;
  quiz.weight = data.weight ?? quiz.weight;
  quiz.updated_at = new Date();
  quiz.question_ids = createdQuestions;

  await quiz.save();

  // 🔔 Phát event "quiz.updated"
  await appEvents.emitAsync("quiz.updated", quiz);

  return await Quiz.findById(quiz._id)
    .populate("question_ids")
    .populate("topic", "title")
    .lean();
};

/* 🔴 XÓA QUIZ */
export const deleteQuizService = async (id: string) => {
  const quiz = await Quiz.findById(id);
  if (!quiz) return false;

  // ✅ Xóa tất cả câu hỏi thuộc quiz này
  if (quiz.question_ids?.length) {
    await Question.deleteMany({ _id: { $in: quiz.question_ids } });
  }

  // ✅ Xóa quiz
  await Quiz.findByIdAndDelete(id);

  // 🔔 (tuỳ chọn) Phát event "quiz.deleted"
  await appEvents.emitAsync("quiz.deleted", quiz._id);

  return true;
};

/* 📋 LẤY DANH SÁCH QUIZ */
export const getAllQuizService = async (
  page: number,
  limit: number,
  query?: string,
  topicId?: string,
  level?: string,
  status?: string,
  part_type?: number
) => {
  const skip = (page - 1) * limit;
  const filter: any = {};

  if (query) filter.title = { $regex: query, $options: "i" };
  if (topicId) filter.topic = { $in: [new Types.ObjectId(topicId)] };
  if (level) filter.level = level;
  if (status) filter.status = status;
  if (part_type) filter.part_type = part_type;

  const [items, total] = await Promise.all([
    Quiz.find(filter)
      .populate("question_ids")
      .populate("topic", "title")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Quiz.countDocuments(filter),
  ]);

  return {
    items,
    total,
    pageCount: Math.ceil(total / limit),
  };
};

/* 🔍 LẤY CHI TIẾT QUIZ */
export const getQuizByIdService = async (id: string) => {
  return await Quiz.findById(id)
    .populate("question_ids")
    .populate("topic", "title")
    .lean();
};
