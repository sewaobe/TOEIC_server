import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";

export interface IShadowingPlan extends Document {
  user_id: Types.ObjectId;
  shadowing_id: Types.ObjectId;
  status: WeekStudyStatus;
  latest_attempt?: Types.ObjectId;
  planned_completion_time: number;
  weight: number;
  start_date?: Date;
  end_date?: Date;
  progress?: number;
  notes?: string;
  created_at: Date;
  updated_at?: Date;
}

const ShadowingPlanSchema = new Schema<IShadowingPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shadowing_id: { type: Schema.Types.ObjectId, ref: "Shadowing", required: true },
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      default: WeekStudyStatus.LOCK,
    },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "ShadowingAttempt" },
    planned_completion_time: { type: Number, default: 0 },
    weight: { type: Number, default: 0.1 },
    start_date: { type: Date, default: Date.now },
    end_date: { type: Date },
    progress: { type: Number },
    notes: { type: String }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const ShadowingPlan = model<IShadowingPlan>(
  "ShadowingPlan",
  ShadowingPlanSchema
);
