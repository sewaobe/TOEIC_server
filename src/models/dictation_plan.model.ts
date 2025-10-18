import { Schema, model, Document, Types } from "mongoose";

export interface IDictationPlan extends Document {
  user_id: Types.ObjectId;
  dictation_id: Types.ObjectId;
  latest_attempt?: Types.ObjectId;
  total_attempts: number;
  accuracy_overall: number;
  start_date?: Date;
  end_date?: Date;
  created_at: Date;
  updated_at?: Date;
}

const DictationPlanSchema = new Schema<IDictationPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dictation_id: { type: Schema.Types.ObjectId, ref: "Dictation", required: true },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "DictationAttempt" },
    total_attempts: { type: Number, default: 0 },
    accuracy_overall: { type: Number, default: 0 }, // % đúng tổng thể
    start_date: { type: Date, default: Date.now },
    end_date: { type: Date },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const DictationPlan = model<IDictationPlan>(
  "DictationPlan",
  DictationPlanSchema
);
