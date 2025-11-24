import mongoose from "mongoose";
import { Lesson, ILesson } from "../models/lesson.model";
import { LessonSection } from "../models/lesson_section.model";
import { PartType } from "../models/enums/PartType";
import { TestStatus } from "../models/enums/TestStatus";
import { appEvents } from "../core/appEvents";
import { createMedia, getMediaById } from "./media.service";

// 🟢 CREATE LESSON RỖNG
export const createLesson = async (
  data: any,
  userId: mongoose.Types.ObjectId
) => {
  // ✅ Convert "PART_X" → number nếu FE hoặc dữ liệu cũ gửi sai
  if (
    typeof data.part_type === "string" &&
    data.part_type.startsWith("PART_")
  ) {
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

  if (!newLesson) {
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
  if (
    part_type !== undefined &&
    part_type !== null &&
    !isNaN(Number(part_type))
  ) {
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
export const updateLessonWithSections = async (lessonId: string, data: any) => {
  const {
    title,
    summary,
    status,
    part_type,
    planned_completion_time,
    weight,
    sections,
  } = data;

  // Debug: log incoming sections to verify markers arrive at server
  try {
    console.log(
      "updateLessonWithSections called for",
      lessonId,
      "sections=",
      JSON.stringify(sections?.slice?.(0, 5) ?? sections)
    );
  } catch (err) {
    console.warn("Failed to stringify sections for log", err);
  }

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw new Error("Không tìm thấy bài học!");

  lesson.title = title ?? lesson.title;
  lesson.summary = summary ?? lesson.summary;
  lesson.status = status ?? lesson.status;
  lesson.planned_completion_time =
    planned_completion_time ?? lesson.planned_completion_time;
  lesson.weight = weight ?? lesson.weight;
  lesson.updated_at = new Date();

  // Chuẩn hóa part_type
  if (typeof part_type === "string" && part_type.startsWith("PART_")) {
    lesson.part_type = Number(part_type.replace("PART_", ""));
  } else if (typeof part_type === "string" && !isNaN(Number(part_type))) {
    lesson.part_type = Number(part_type);
  } else {
    lesson.part_type = part_type ?? lesson.part_type;
  }

  if (Array.isArray(sections)) {
    await LessonSection.deleteMany({ lesson_id: lesson._id });
    const newSections: any[] = [];

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      let mediaIds: mongoose.Types.ObjectId[] = [];

      if (s.mediaUrl && !s.mediaId) {
        const newMedia = await createMedia({
          topic: s.title || "Media mới", // ✅ dùng topic thay title
          url: s.mediaUrl,
          type: "VIDEO",
          transcript: "",
        });

        mediaIds = [newMedia._id as mongoose.Types.ObjectId]; // ✅ fix type
      } else if (s.mediaId) {
        const existing = await getMediaById(s.mediaId);
        if (existing) {
          mediaIds = [existing._id as mongoose.Types.ObjectId]; // ✅ fix type
        } else {
          console.warn(`⚠️ mediaId ${s.mediaId} không tồn tại, bỏ qua`);
        }
      }

      newSections.push({
        lesson_id: lesson._id,
        order: s.order ?? i,
        title: s.title ?? `Section ${i + 1}`,
        type: s.type ?? "text",
        content: s.content ?? "",
        example: s.example ?? undefined,
        error: s.error ?? undefined,
        tableData: s.tableData ?? [],
        medias_id: mediaIds,
        // Copy interactive markers from FE if provided
        markers: Array.isArray(s.markers)
          ? s.markers.map((m: any) => ({
              time: Number(m.time) || 0,
              question: String(m.question || ""),
              options: Array.isArray(m.options) ? m.options.map(String) : [],
              correctAnswer: Number(m.correctAnswer) || 0,
              explanation: m.explanation ? String(m.explanation) : undefined,
            }))
          : [],
      });
    }

    const insertedSections = await LessonSection.insertMany(newSections);
    lesson.sections_id = insertedSections.map((sec) => sec._id);
  }

  await lesson.save();

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
