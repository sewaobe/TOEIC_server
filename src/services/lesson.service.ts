import mongoose from "mongoose";
import { Lesson,ILesson } from "../models/lesson.model";
import { LessonSection } from "../models/lesson_section.model";
import { PartType } from "../models/enums/PartType";
import { TestStatus } from "../models/enums/TestStatus";
import { appEvents } from "../core/appEvents";

// 🟢 CREATE LESSON RỖNG
export const createLesson = async (
  data: any,
  userId: mongoose.Types.ObjectId
) => {
  // ✅ Convert "PART_X" → number nếu FE hoặc dữ liệu cũ gửi sai
  if (typeof data.part_type === "string" && data.part_type.startsWith("PART_")) {
    data.part_type = Number(data.part_type.replace("PART_", ""));
  }

  // ✅ Ép kiểu đề phòng trường hợp FE gửi số dạng string ("4")
  if (typeof data.part_type === "string" && !isNaN(Number(data.part_type))) {
    data.part_type = Number(data.part_type);
  }

  const newLesson = await Lesson.create({
    // 🔹 Các trường cơ bản
    title: data.title || "Bài học mới",
    summary: data.summary || "",
    topic: data.topic || [],
    part_type: data.part_type || PartType.PART_1,
    status: data.status || TestStatus.DRAFT,
    planned_completion_time: data.planned_completion_time || 0,
    weight: data.weight || 0.1,

    // 🔹 Meta
    created_by: userId,
    sections_id: [],
    created_at: new Date(),
    updated_at: new Date(),
  });

  if(!newLesson) {
    throw new Error("Tạo bài học thất bại");
  }

  await appEvents.emitAsync("lesson.created", newLesson);

  return newLesson;
};
// 🟣 GET ALL LESSONS (theo CTV)
interface LessonFilterOptions {
  userId: mongoose.Types.ObjectId;
  page?: number;
  limit?: number;
  search?: string;
  part_type?: number;
  status?: string;
}

export const getLessons = async ({
  userId,
  page = 1,
  limit = 10,
  search = "",
  part_type,
  status,
}: LessonFilterOptions) => {
  const skip = (page - 1) * limit;

  // 🧩 Bộ lọc cơ bản
  const filter: any = { created_by: userId };

  // 🔍 Tìm kiếm theo tiêu đề hoặc mô tả
  if (search.trim() !== "") {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { summary: { $regex: search, $options: "i" } },
    ];
  }

  // 🧠 Lọc theo part_type (ví dụ: Part 1 → 7)
  if (part_type !== undefined && part_type !== null && !isNaN(Number(part_type))) {
    filter.part_type = Number(part_type);
  }

  // ⚙️ Lọc theo trạng thái (draft, approved, pending, ...)
  if (status && status.trim() !== "") {
    filter.status = status.toLowerCase();
  }

  // 📚 Truy vấn dữ liệu
  const [items, total] = await Promise.all([
    Lesson.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .select("title summary topic status part_type created_at updated_at"),
    Lesson.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

// 🟡 GET CHI TIẾT 1 BÀI HỌC (có sections và media)
export const getLessonDetail = async (lessonId: string) => {
  const lesson = await Lesson.findById(lessonId)
    .populate({
      path: "sections_id",
      populate: { path: "medias_id", model: "Media" },
    })
    .lean();

  if (!lesson) throw new Error("Không tìm thấy bài học");

  return lesson;
};
// 🟨 CẬP NHẬT THÔNG TIN CƠ BẢN (title, summary, status, ...)
export const updateLessonBasic = async (
  lessonId: string,
  data: Partial<ILesson>
) => {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new Error("Không tìm thấy bài học!");

  // Cập nhật các trường cơ bản (chỉ cho phép sửa các field này)
  const allowedFields: (keyof ILesson)[] = [
    "title",
    "summary",
    "topic",
    "status",
    "part_type",
    "planned_completion_time",
    "weight",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      (lesson as any)[field] = data[field];
    }
  }

  lesson.updated_at = new Date();
  await lesson.save();

  await appEvents.emitAsync("lesson.updated", lesson);

  return lesson;
};

// 🔵 UPDATE BÀI HỌC (THÊM / SỬA SECTIONS)
export const updateLessonWithSections = async (
  lessonId: string,
  data: any
) => {
  const { title, summary, status, part_type, planned_completion_time, weight, sections } = data;

  // 🔍 Kiểm tra bài học tồn tại
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new Error("Không tìm thấy bài học!");

  // 🟢 Cập nhật thông tin cơ bản
  lesson.title = title ?? lesson.title;
  lesson.summary = summary ?? lesson.summary;
  lesson.status = status ?? lesson.status;
  lesson.part_type = part_type ?? lesson.part_type;
  lesson.planned_completion_time = planned_completion_time ?? lesson.planned_completion_time;
  lesson.weight = weight ?? lesson.weight;
  lesson.updated_at = new Date();

  // 🗑️ Xóa section cũ (nếu có)
  await LessonSection.deleteMany({ lesson_id: lesson._id });

  // 🆕 Tạo section mới (nếu FE gửi)
  let newSectionIds: mongoose.Types.ObjectId[] = [];
  if (Array.isArray(sections) && sections.length > 0) {
    const newSections = await LessonSection.insertMany(
      sections.map((s: any, index: number) => ({
        lesson_id: lesson._id,
        order: s.order ?? index,
        title: s.title,
        type: s.type,
        content: s.content,
        example: s.example,
        error: s.error,
        medias_id: s.mediaId,
        tableData: s.tableData,
      }))
    );
    newSectionIds = newSections.map((s) => s._id as mongoose.Types.ObjectId);
  }

  // 🔗 Gán lại danh sách section
  lesson.sections_id = newSectionIds;
  await lesson.save();

  // 🧩 Populate để trả về FE đầy đủ
  const updatedLesson = await Lesson.findById(lesson._id)
    .populate({
      path: "sections_id",
      populate: { path: "medias_id", model: "Media" },
    })
    .lean();

  return updatedLesson;
};


// 🔴 DELETE BÀI HỌC
export const deleteLesson = async (lessonId: string) => {
  try {
    // 🗑️ Xóa toàn bộ section liên quan trước
    await LessonSection.deleteMany({ lesson_id: lessonId });

    // 🧩 Sau đó xóa luôn lesson chính
    await Lesson.findByIdAndDelete(lessonId);

    return true;
  } catch (error) {
    throw error;
  }
};

