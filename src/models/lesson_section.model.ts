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

export interface IQuestionMarker {
  time: number;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface ILessonSection extends Document {
  lesson_id: Types.ObjectId; // 🔗 tham chiếu ngược về Lesson
  order: number;
  title: string;
  type: "text" | "example" | "error" | "media" | "table" | "quiz";
  content?: string;
  quiz_id?: Types.ObjectId;
  example?: IExample;
  error?: IErrorExample;
  medias_id: Types.ObjectId[];
  markers?: IQuestionMarker[];
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
    enum: ["text", "example", "error", "media", "table", "quiz"],
    required: true,
  },
  content: String,
  example: ExampleSchema,
  quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz" }, // Thêm tham chiếu Quiz
  error: ErrorExampleSchema,
  medias_id: [{ type: Schema.Types.ObjectId, ref: "Media" }],
  // Interactive question markers (optional)
  markers: [
    {
      time: { type: Number, required: true },
      question: { type: String, required: true },
      options: [{ type: String }],
      correctAnswer: { type: Number, required: true },
      explanation: { type: String },
    },
  ],
  tableData: [[String]],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

export const LessonSection = mongoose.model<ILessonSection>(
  "LessonSection",
  LessonSectionSchema
);
