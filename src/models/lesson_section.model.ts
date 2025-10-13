import mongoose, { Schema, Document, Types } from "mongoose";

export interface IExample {
    en?: string;
    vi?: string;
    note?: string;
}

export interface IErrorExample {
    wrong?: string;
    correct?: string;
    explanation?: string;
}

export interface ILessonSection extends Document {
    lesson_id: Types.ObjectId; // 🔗 tham chiếu ngược về Lesson
    order: number;
    title: string;
    type: "text" | "example" | "error" | "media" | "table";
    content?: string;
    example?: IExample;
    error?: IErrorExample;
    medias_id: Types.ObjectId[];
    tableData?: string[][];
    created_at: Date;
    updated_at: Date;
}

const ExampleSchema = new Schema<IExample>({
    en: String,
    vi: String,
    note: String,
});

const ErrorExampleSchema = new Schema<IErrorExample>({
    wrong: String,
    correct: String,
    explanation: String,
});

const LessonSectionSchema = new Schema<ILessonSection>({
    lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    order: { type: Number, required: true },
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ["text", "example", "error", "media", "table"],
        required: true,
    },
    content: String,
    example: ExampleSchema,
    error: ErrorExampleSchema,
    medias_id: [{ type: Schema.Types.ObjectId, ref: "Media" }],
    tableData: [[String]],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
});

export const LessonSection = mongoose.model<ILessonSection>(
    "LessonSection",
    LessonSectionSchema
);
