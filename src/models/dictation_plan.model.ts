import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
import { PartType } from "./enums/PartType";

export interface IDictationPlan extends Document {
  user_id: Types.ObjectId;
  dictation_ids: Types.ObjectId[]; // nhiều question dạng dictation
  status: WeekStudyStatus;
  latest_attempt?: Types.ObjectId;
  planned_completion_time: number; // 👉 thêm
  weight: number; // 👉 thêm
  created_at: Date;
  updated_at?: Date;
}

const DictationPlanSchema = new Schema<IDictationPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dictation_ids: [
      { type: Schema.Types.ObjectId, ref: "Dictation", required: true },
    ],
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      default: WeekStudyStatus.LOCK,
    },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "DictationAttempt" },
    planned_completion_time: { type: Number, default: 0 },
    weight: { type: Number, default: 0.1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const DictationPlan = model<IDictationPlan>(
  "DictationPlan",
  DictationPlanSchema
);
