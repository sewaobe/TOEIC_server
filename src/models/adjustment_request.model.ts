import mongoose, { Schema, Document, Types } from "mongoose";

export enum AdjustmentStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum AdjustmentActionType {
  REMOVE = "REMOVE",
  ADD = "ADD",
  REPLACE = "REPLACE",
  RESCHEDULE = "RESCHEDULE",
}

export interface IAdjustmentChange {
  action: AdjustmentActionType;
  targetDate?: Date; // Ngày áp dụng (cho ADD/RESCHEDULE)
  lessonId?: Types.ObjectId; // Activity ID (không chỉ lesson, có thể là quiz, flashcard, etc)
  oldLessonId?: Types.ObjectId; // Activity cũ (cho REPLACE)
  dayStudyId?: Types.ObjectId; // ID của ngày học (nếu cần xác định chính xác vị trí)
  kind?: string; // Loại activity: 'lesson' | 'quiz' | 'flashcard' | 'dictation' | 'shadowing' | 'mini_test'
  note?: string; // Ghi chú cho từng thay đổi nhỏ
  lessonTitle?: string; // Tên bài học/quiz/flashcard (lưu trực tiếp để hiển thị)
  oldLessonTitle?: string; // Tên bài cũ (cho REPLACE)
  weekNumber: number; // Tuần thứ mấy trong lộ trình (luôn có giá trị, không undefined)
  dayNumber: number; // Ngày thứ mấy trong tuần (luôn có giá trị, không undefined)
  weekTitle: string; // Tên tuần (ví dụ: "Tuần 1")
  dayTitle: string; // Tên ngày (ví dụ: "Ngày 1")
}

export interface IAdjustmentRequest extends Document {
  studentId: Types.ObjectId;
  collaboratorId: Types.ObjectId;
  learningPathId: Types.ObjectId;
  status: AdjustmentStatus;
  reason: string; // Lý do của CTV
  rejectionReason?: string; // Lý do từ chối của HV
  changes: IAdjustmentChange[];
  createdAt: Date;
  updatedAt: Date;
}

const AdjustmentChangeSchema = new Schema<IAdjustmentChange>({
  action: {
    type: String,
    enum: Object.values(AdjustmentActionType),
    required: true,
  },
  targetDate: { type: Date },
  lessonId: { type: Schema.Types.ObjectId }, // Không ref cứng vào Lesson, vì có thể là Quiz, Flashcard...
  oldLessonId: { type: Schema.Types.ObjectId },
  dayStudyId: { type: Schema.Types.ObjectId, ref: "DayStudy" },
  kind: {
    type: String,
    enum: [
      "lesson",
      "quiz",
      "flashcard",
      "dictation",
      "shadowing",
      "mini_test",
    ],
  },
  note: { type: String },
  lessonTitle: { type: String },
  oldLessonTitle: { type: String },
  weekNumber: { type: Number, required: true, default: 1 },
  dayNumber: { type: Number, required: true, default: 1 },
  weekTitle: { type: String, default: "Tuần 1" },
  dayTitle: { type: String, default: "Ngày 1" },
});

const AdjustmentRequestSchema = new Schema<IAdjustmentRequest>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    collaboratorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    learningPathId: {
      type: Schema.Types.ObjectId,
      ref: "LearningPath",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(AdjustmentStatus),
      default: AdjustmentStatus.PENDING,
    },
    reason: { type: String, required: true },
    rejectionReason: { type: String },
    changes: [AdjustmentChangeSchema],
  },
  { timestamps: true }
);

export const AdjustmentRequest = mongoose.model<IAdjustmentRequest>(
  "AdjustmentRequest",
  AdjustmentRequestSchema
);
