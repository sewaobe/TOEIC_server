import { Types } from "mongoose";
import { Quiz } from "../models/quiz.model";
import { Question } from "../models/question.model";
import { PartType } from "../models/enums/PartType";
import { TestStatus } from "../models/enums/TestStatus";
import { CERFLevel } from "../models/topic_vocabulary.model";
import { appEvents } from "../core/appEvents"; // app event bus

const normalizePartType = (value: any): number | undefined => {
  if (typeof value === "string" && value.startsWith("PART_")) {
    return Number(value.replace("PART_", ""));
  }
  if (typeof value === "string" && !isNaN(Number(value))) {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  return undefined;
};

const hasText = (value: any) =>
  typeof value === "string" && value.trim().length > 0;

const validationError = (message: string) => {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
};

const validateQuizForPart = (
  partType: number,
  questionCount: number,
  data: { audio_url?: any; image_url?: any; content_html?: any }
) => {
  if (partType < PartType.PART_1 || partType > PartType.PART_7) {
    throw validationError("Part type phai nam trong khoang Part 1 den Part 7");
  }

  if (partType === PartType.PART_1) {
    if (questionCount !== 1) throw validationError("Part 1 can dung 1 cau hoi");
    if (!hasText(data.image_url)) throw validationError("Part 1 can anh minh hoa");
    if (!hasText(data.audio_url)) throw validationError("Part 1 can audio bai nghe");
  }

  if (partType === PartType.PART_2) {
    if (questionCount !== 1) throw validationError("Part 2 can dung 1 cau hoi");
    if (!hasText(data.audio_url)) throw validationError("Part 2 can audio bai nghe");
  }

  if (partType === PartType.PART_3 || partType === PartType.PART_4) {
    if (questionCount !== 3) {
      throw validationError(`Part ${partType} can dung 3 cau hoi`);
    }
    if (!hasText(data.audio_url)) {
      throw validationError(`Part ${partType} can audio bai nghe`);
    }
  }

  if (partType === PartType.PART_5 && questionCount < 1) {
    throw validationError("Part 5 can it nhat 1 cau hoi");
  }

  if (partType === PartType.PART_6) {
    if (questionCount !== 4) throw validationError("Part 6 can dung 4 cau hoi");
    if (!hasText(data.content_html)) {
      throw validationError("Part 6 can noi dung doan van / passage");
    }
  }

  if (partType === PartType.PART_7) {
    if (questionCount < 2 || questionCount > 5) {
      throw validationError("Part 7 can tu 2 den 5 cau hoi");
    }
    if (!hasText(data.content_html)) {
      throw validationError("Part 7 can noi dung doan van / passage");
    }
  }
};

/* 🟢 TẠO QUIZ MỚI */
export const createQuizService = async (data: any) => {
  const topicIds: Types.ObjectId[] = Array.isArray(data.topic)
    ? data.topic
        .filter((id: string) => Types.ObjectId.isValid(id))
        .map((id: string) => new Types.ObjectId(id))
    : [];

  // 🧩 Chuẩn hóa part_type
  data.part_type = normalizePartType(data.part_type) ?? PartType.PART_5;
  const incomingQuestions = Array.isArray(data.question_ids)
    ? data.question_ids
    : [];

  validateQuizForPart(data.part_type, incomingQuestions.length, {
    content_html: data.content_html,
    image_url: data.image_url,
    audio_url: data.audio_url,
  });

  // ✅ Tạo danh sách câu hỏi trong DB
  const createdQuestions: Types.ObjectId[] = [];
  if (incomingQuestions.length) {
    for (let i = 0; i < incomingQuestions.length; i++) {
      const q = incomingQuestions[i];
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
    content_html: data.content_html,
    image_url: data.image_url,
    audio_url: data.audio_url,
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

  const nextPartType = normalizePartType(data.part_type) ?? quiz.part_type ?? PartType.PART_5;
  const nextQuestionCount = Array.isArray(data.question_ids)
    ? data.question_ids.length
    : quiz.question_ids?.length ?? 0;
  const nextContentHtml = Object.prototype.hasOwnProperty.call(data, "content_html")
    ? data.content_html
    : quiz.content_html;
  const nextImageUrl = Object.prototype.hasOwnProperty.call(data, "image_url")
    ? data.image_url
    : quiz.image_url;
  const nextAudioUrl = Object.prototype.hasOwnProperty.call(data, "audio_url")
    ? data.audio_url
    : quiz.audio_url;

  validateQuizForPart(nextPartType, nextQuestionCount, {
    content_html: nextContentHtml,
    image_url: nextImageUrl,
    audio_url: nextAudioUrl,
  });

  // 🔴 Xóa các câu hỏi cũ
  const shouldReplaceQuestions = Array.isArray(data.question_ids);
  if (shouldReplaceQuestions && quiz.question_ids?.length) {
    await Question.deleteMany({ _id: { $in: quiz.question_ids } });
  }

  // ✅ Tạo lại các câu hỏi mới
  const createdQuestions: Types.ObjectId[] = shouldReplaceQuestions
    ? []
    : quiz.question_ids || [];
  if (shouldReplaceQuestions) {
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
  quiz.part_type = nextPartType;
  quiz.level = data.level ?? quiz.level;
  quiz.status = data.status ?? quiz.status;
  quiz.planned_completion_time =
    data.planned_completion_time ?? quiz.planned_completion_time;
  quiz.weight = data.weight ?? quiz.weight;
  quiz.content_html = nextContentHtml;
  quiz.image_url = nextImageUrl;
  quiz.audio_url = nextAudioUrl;
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
