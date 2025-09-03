import mongoose, { Schema, Document, Types } from "mongoose";

export interface IQuestion extends Document {
  name: string; // "Question 1", "Question 2", ...
  textQuestion: string; // Nội dung câu hỏi
  choices: Map<string, string>; // {"A": "text1", "B": "text2", ...}
  correctAnswer: string; // "A", "B", ...
  explanation: string; // Giải thích nếu có
  tags: string[]; // <-- thêm mảng tag
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const QuestionSchema = new Schema<IQuestion>({
  name: { type: String, required: true },
  textQuestion: { type: String, required: true },
  choices: { type: Map, of: String, default: {} }, // Map key/value cho các lựa chọn
  correctAnswer: { type: String, default: "" },
  explanation: { type: String, default: "" },
  tags: { type: [String], default: [] }, // <-- khai báo array of string
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
  updated_at: Date,
});

export const Question = mongoose.model<IQuestion>("Question", QuestionSchema);
