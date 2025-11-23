import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";

export interface IDictationPlan extends Document {
  user_id: Types.ObjectId;
  dictation_id: Types.ObjectId;
  submit_type?: SubmissionType;
  latest_attempt?: Types.ObjectId;
  total_attempts: number;
  accuracy_overall: number;
  created_at: Date;
  updated_at?: Date;
}

const DictationPlanSchema = new Schema<IDictationPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dictation_id: { type: Schema.Types.ObjectId, ref: "Dictation", required: true },
    submit_type: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.PRACTICE,
    },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "DictationAttempt" },
    total_attempts: { type: Number, default: 0 },
    accuracy_overall: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const DictationPlan = model<IDictationPlan>(
  "DictationPlan",
  DictationPlanSchema
);

