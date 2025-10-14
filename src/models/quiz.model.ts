import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
import { PartType } from "./enums/PartType";
import { CERFLevel } from "./topic_vocabulary.model";

// Dùng cho Reading
export interface IQuiz extends Document {
  title: string;
  group_ids: Types.ObjectId[];
  part_type?: PartType;
  level: CERFLevel;
  status: WeekStudyStatus;
  planned_completion_time: number;
  weight: number;
  created_at: Date;
  updated_at?: Date;
}

const QuizPlanSchema = new Schema<IQuiz>(
  {
    group_ids: [
      { type: Schema.Types.ObjectId, ref: "Group", required: true },
    ],
    part_type: {
      type: Number,
      enum: Object.values(PartType).filter(v => typeof v === "number"),
    },
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      default: WeekStudyStatus.LOCK,
    },
    planned_completion_time: { type: Number, default: 0 },
    weight: { type: Number, default: 0.1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const QuizPlan = model<IQuiz>("Quiz", QuizPlanSchema);
