import mongoose, { Schema, Document, Types } from "mongoose";

export interface IQuestion extends Document {
  _id: Types.ObjectId;
  name: string; // "Question 1", "Question 2", ...
  textQuestion: string; // Nội dung câu hỏi
  choices: Map<string, string>; // {"A": "text1", "B": "text2", ...}
  correctAnswer: string; // "A", "B", ...
  explanation: string; // Giải thích nếu có
  tags: string[]; // <-- thêm mảng tag
  planned_time: number;
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const QuestionSchema = new Schema<IQuestion>({
  name: { type: String, required: true },
  textQuestion: {
    type: String,
    required: false, // ❌ bỏ required
    default: "",
  },
  choices: { type: Map, of: String, default: {} }, // Map key/value cho các lựa chọn
  correctAnswer: { type: String, default: "" },
  explanation: { type: String, default: "" },
  tags: { type: [String], default: [] }, // <-- khai báo array of string
  planned_time: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
  updated_at: Date,
});

// ✅ Indexes để tăng tốc search
QuestionSchema.index({ textQuestion: "text" }); // text index cho search
QuestionSchema.index({ tags: 1 }); // cho filter by tag
QuestionSchema.index({ created_at: -1 }); // cho sort

export const Question = mongoose.model<IQuestion>("Question", QuestionSchema);
