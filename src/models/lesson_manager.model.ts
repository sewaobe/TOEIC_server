import { Schema, model, Document, Types } from "mongoose";
import { CERFLevel } from "./topic_vocabulary.model";
import { PartType } from "./enums/PartType";
import { TestStatus } from "./enums/TestStatus";

export interface ILessonManager extends Document {
    title: string;                // Tên nhóm bài học (VD: "Unit 3 - Office Communication")
    description?: string;         // Mô tả ngắn
    thumbnail?: string;           // Ảnh đại diện
    level: CERFLevel;                // A1, A2, B1...
    part_type: PartType;               // Part 1,2,3,4,5,6,7
    status: TestStatus;                // Trạng thái để chờ duyệt từ Admin
    topic_vocabulary_ids?: Types.ObjectId[];      // Liên kết với các chủ đề từ vựng
    lesson_ids?: Types.ObjectId[];     // Liên kết với các bài học chính
    dictation_ids?: Types.ObjectId[];  // Liên kết bài nghe-chép
    shadowing_ids?: Types.ObjectId[];  // Liên kết bài luyện nói
    quiz_ids?: Types.ObjectId[];       // Liên kết với các quiz thực hành
    weight: number;
    planned_completion_time: number;
    rating?: number;
    student_count?: number;
    created_at: Date;
    created_by: Types.ObjectId;
    updated_at?: Date;
}

const LessonManagerSchema = new Schema<ILessonManager>(
    {
        title: { type: String, required: true },
        description: String,
        thumbnail: String,
        level: { type: String, required: true },
        part_type: { type: Number, enum: Object.values(PartType).filter(v => typeof v === "number"), required: true },
        status: { type: String, enum: Object.values(TestStatus), default: TestStatus.DRAFT },
        topic_vocabulary_ids: [{ type: Schema.Types.ObjectId, ref: "TopicVocabulary" }],
        lesson_ids: [{ type: Schema.Types.ObjectId, ref: "Lesson" }],
        dictation_ids: [{ type: Schema.Types.ObjectId, ref: "Dictation" }],
        shadowing_ids: [{ type: Schema.Types.ObjectId, ref: "Shadowing" }],
        quiz_ids: [{ type: Schema.Types.ObjectId, ref: "Quiz" }],
        planned_completion_time: { type: Number, default: 0 },
        weight: { type: Number, default: 0.1 },
        rating: { type: Number, default: 0 },
        student_count: { type: Number, default: 0 },
        created_by: { type: Schema.Types.ObjectId, ref: "User" }
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const LessonManager = model<ILessonManager>(
    "LessonManager",
    LessonManagerSchema
);
