import { Types } from "mongoose";
import { Quiz } from "../models/quiz.model";
import { createGroupWithNewRelations, updateGroupWithRelations, deleteGroupWithRelations } from "./group.service";
import { PartType } from "../models/enums/PartType";
import { TestStatus } from "../models/enums/TestStatus";
import { CERFLevel } from "../models/topic_vocabulary.model";

/**
 * 🟢 Tạo quiz mới (kèm group)
 */
export const createQuizService = async (data: any) => {
  // ✅ Chuẩn hóa topic → ObjectId[]
  const topicIds: Types.ObjectId[] = Array.isArray(data.topic)
    ? data.topic
        .filter((id: string) => Types.ObjectId.isValid(id))
        .map((id: string) => new Types.ObjectId(id))
    : [];

  // ✅ Chuẩn hóa part_type (nếu FE gửi dạng "PART_5" hoặc string)
  if (typeof data.part_type === "string" && data.part_type.startsWith("PART_")) {
    data.part_type = Number(data.part_type.replace("PART_", ""));
  }
  if (typeof data.part_type === "string" && !isNaN(Number(data.part_type))) {
    data.part_type = Number(data.part_type);
  }

  // 1️⃣ Tạo quiz cơ bản
  const newQuiz = new Quiz({
    title: data.title?.trim() || "Quiz mới",
    topic: topicIds,
    part_type: data.part_type ?? PartType.PART_5,
    level: data.level ?? CERFLevel.A2,
    status: data.status ?? TestStatus.DRAFT,
    planned_completion_time: data.planned_completion_time ?? 0,
    weight: data.weight ?? 0.1,
    group_ids: [],
  });

  await newQuiz.save();

  // 2️⃣ Nếu có group thì tạo mới
  const groupIds: Types.ObjectId[] = [];
  if (Array.isArray(data.group_ids) && data.group_ids.length > 0) {
    for (const g of data.group_ids) {
      const group = await createGroupWithNewRelations({
        ...(g as any),
        topic: topicIds[0]?.toString() ?? "", // 🔹 Nếu cần gắn topic đầu tiên vào group
        test_id: newQuiz._id, // ⚠️ Tạm dùng test_id nếu Group yêu cầu, sau này nên tách field quiz_id riêng
      });
      groupIds.push(group._id as Types.ObjectId);
    }
  }

  // 3️⃣ Cập nhật quiz với danh sách group
  newQuiz.group_ids = groupIds;
  await newQuiz.save();

  // 4️⃣ Populate dữ liệu đầy đủ để trả về FE
  const populatedQuiz = await Quiz.findById(newQuiz._id)
    .populate({
      path: "group_ids",
      populate: ["audioUrl", "imagesUrl", "questions"],
    })
    .populate("topic", "title")
    .lean();

  return populatedQuiz;
};

/**
 * 🟡 Cập nhật quiz (và đồng bộ group)
 */
export const updateQuizService = async (id: string, data: any) => {
  const quiz = await Quiz.findById(id);
  if (!quiz) return null;

  // 1️⃣ Update các trường cơ bản
  quiz.title = data.title ?? quiz.title;
  quiz.topic = data.topic ?? quiz.topic;
  quiz.part_type = data.part_type ?? quiz.part_type;
  quiz.level = data.level ?? quiz.level;
  quiz.status = data.status ?? quiz.status;
  quiz.planned_completion_time = data.planned_completion_time ?? quiz.planned_completion_time;
  quiz.weight = data.weight ?? quiz.weight;
  quiz.updated_at = new Date();
  await quiz.save();

  // 2️⃣ Đồng bộ group nếu có
  const newGroupIds: Types.ObjectId[] = [];
  for (const g of data.group_ids ?? []) {
    if (g._id) {
      const updatedGroup = await updateGroupWithRelations(g._id, g as any);
      if (updatedGroup) newGroupIds.push(updatedGroup._id);
    } else {
      const newGroup = await createGroupWithNewRelations({
        ...(g as any),
        test_id: quiz._id,
        topic: quiz.topic?.[0] ?? "",
      });
      newGroupIds.push(newGroup._id);
    }
  }

  // 3️⃣ Xóa group không còn trong danh sách mới
  const existingIds = quiz.group_ids.map((id) => id.toString());
  for (const oldId of existingIds) {
    const stillExists = newGroupIds.find((id) => id.toString() === oldId);
    if (!stillExists) {
      await deleteGroupWithRelations(new Types.ObjectId(oldId));
    }
  }

  // 4️⃣ Gán lại danh sách group mới
  quiz.group_ids = newGroupIds;
  await quiz.save();

  // 5️⃣ Trả về bản cập nhật
  return await Quiz.findById(quiz._id)
    .populate({
      path: "group_ids",
      populate: ["audioUrl", "imagesUrl", "questions"],
    })
    .lean();
};

/**
 * 🔴 Xóa quiz (và toàn bộ group, question, media liên quan)
 */
export const deleteQuizService = async (id: string) => {
  const quiz = await Quiz.findById(id);
  if (!quiz) return false;

  for (const g of quiz.group_ids) {
    await deleteGroupWithRelations(g);
  }

  await Quiz.findByIdAndDelete(id);
  return true;
};

/**
 * 📋 Lấy danh sách quiz (phân trang + lọc + tìm kiếm)
 */
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

  // 🔍 Tìm kiếm theo tiêu đề
  if (query) filter.title = { $regex: query, $options: "i" };

  // 🎯 Lọc theo topic (mảng)
  if (topicId) filter.topic = { $in: [new Types.ObjectId(topicId)] };

  // 📘 Lọc theo trình độ
  if (level) filter.level = level;

  // ⚙️ Lọc theo trạng thái
  if (status) filter.status = status;

  // 🧩 Lọc theo part
  if (part_type) filter.part_type = part_type;

  // 📚 Truy vấn DB
  const [items, total] = await Promise.all([
    Quiz.find(filter)
      .populate("topic", "title")
      .populate({
        path: "group_ids",
        populate: ["audioUrl", "imagesUrl", "questions"],
      })
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


/**
 * 🔍 Lấy chi tiết quiz theo ID
 */
export const getQuizByIdService = async (id: string) => {
  return await Quiz.findById(id)
    .populate({
      path: "group_ids",
      populate: ["audioUrl", "imagesUrl", "questions"],
    })
    .populate("topic", "title")
    .lean();
};
