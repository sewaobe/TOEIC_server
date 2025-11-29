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
  irt_discrimination: number; // added for IRT model - 0.5: Yếu / 1.0: Trung bình / 1.5-2.0: Tốt
  irt_difficulty: number; // added for IRT model - -3 (dễ) đến +3 (khó) => -2: Rất dễ, -1: Dễ, 0: Trung bình, +1: Khó, +2: Rất khó
  irt_guessing: number; // added for IRT model
  
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
  irt_discrimination: { type: Number, default: 1.0 }, // added for IRT model
  irt_difficulty: { type: Number, default: 0 }, // added for IRT model
  irt_guessing: { type: Number, default: 0.25 }, // added for IRT model
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
  updated_at: Date,
});

// ✅ Indexes để tăng tốc search
QuestionSchema.index({ textQuestion: "text" }); // text index cho search
QuestionSchema.index({ tags: 1 }); // cho filter by tag
QuestionSchema.index({ created_at: -1 }); // cho sort

export const Question = mongoose.model<IQuestion>("Question", QuestionSchema);
