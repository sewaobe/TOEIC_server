import { Schema, model, Document, Types } from "mongoose";
import { PartType } from "./enums/PartType";
import { CERFLevel } from "./topic_vocabulary.model";
import { TestStatus } from "./enums/TestStatus";

// 🧩 Interface định nghĩa
export interface IQuiz extends Document {
  topic: Types.ObjectId[];
  title: string;
  group_ids: Types.ObjectId[];
  part_type?: PartType;
  level: CERFLevel;
  status: TestStatus;
  planned_completion_time: number;
  weight: number;
  created_at: Date;
  updated_at?: Date;
}

// 🧠 Schema Mongoose
const QuizSchema = new Schema<IQuiz>(
  {
    topic: [{ type: Schema.Types.ObjectId, ref: "LessonManager" }],
    title: { type: String, required: true },
    group_ids: [
      { type: Schema.Types.ObjectId, ref: "Group", required: true },
    ],
    part_type: {
      type: Number,
      enum: Object.values(PartType).filter((v) => typeof v === "number"),
    },

    // ✅ Thêm trường level bị thiếu
    level: {
      type: String,
      enum: Object.values(CERFLevel),
      required: true,
      default: CERFLevel.A2,
    },

    status: {
      type: String,
      enum: Object.values(TestStatus),
      default: TestStatus.DRAFT,
    },
    planned_completion_time: { type: Number, default: 0 },
    weight: { type: Number, default: 0.1 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// 🟢 Xuất model
export const Quiz = model<IQuiz>("Quiz", QuizSchema);
