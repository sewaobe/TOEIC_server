import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";

export interface IShadowingPlan extends Document {
  user_id: Types.ObjectId;
  shadowing_id: Types.ObjectId;
  latest_attempt?: Types.ObjectId;
  total_attempts: number;
  accuracy_overall: number;
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
    latest_attempt: { type: Schema.Types.ObjectId, ref: "ShadowingAttempt" },
    total_attempts: { type: Number, default: 0 },
    accuracy_overall: { type: Number, default: 0 }, // % đúng tổng thể
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
