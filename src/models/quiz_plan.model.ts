import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
import { PartType } from "./enums/PartType";

export interface IQuizPlan extends Document {
  user_id: Types.ObjectId;
  question_ids: Types.ObjectId[];
  part_type?: PartType | null; // 👉 thêm
  status: WeekStudyStatus;
  latest_attempt?: Types.ObjectId;
  planned_completion_time: number; // 👉 thêm
  weight: number; // 👉 thêm
  created_at: Date;
  updated_at?: Date;
}

const QuizPlanSchema = new Schema<IQuizPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    question_ids: [
      { type: Schema.Types.ObjectId, ref: "Question", required: true },
    ],
    part_type: {
      type: Number,
      enum: Object.values(PartType),
      required: false,
    },
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      default: WeekStudyStatus.LOCK,
    },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "QuizAttempt" },
    planned_completion_time: { type: Number, default: 0 },
    weight: { type: Number, default: 0.1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const QuizPlan = model<IQuizPlan>("QuizPlan", QuizPlanSchema);
