import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";

export interface IFlashCardPlan extends Document {
  user_id: Types.ObjectId;
  topic_vocabulary_id: Types.ObjectId;
  submit_type?: SubmissionType;
  latest_attempt?: Types.ObjectId;
  total_attempts: number;
  accuracy_overall: number;
  created_at: Date;
  updated_at?: Date;
}

const FlashCardPlanSchema = new Schema<IFlashCardPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topic_vocabulary_id: { type: Schema.Types.ObjectId, ref: "TopicVocabulary", required: true },
    submit_type: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.PRACTICE,
    },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "FlashCardAttempt" },
    total_attempts: { type: Number, default: 0 },
    accuracy_overall: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const FlashCardPlan = model<IFlashCardPlan>(
  "FlashCardPlan",
  FlashCardPlanSchema
);

