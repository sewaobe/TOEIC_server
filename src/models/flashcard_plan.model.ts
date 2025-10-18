import { Schema, model, Document, Types } from "mongoose";

export interface IFlashCardPlan extends Document {
  user_id: Types.ObjectId;
  topic_vocabulary_id: Types.ObjectId; // trỏ tới TopicVocabulary (chứa nhiều vocabularies)
  latest_attempt?: Types.ObjectId;
  total_attempts: number;
  accuracy_overall: number;
  start_date?: Date;
  end_date?: Date;
  created_at: Date;
  updated_at?: Date;
}

const FlashCardPlanSchema = new Schema<IFlashCardPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topic_vocabulary_id: { type: Schema.Types.ObjectId, ref: "TopicVocabulary", required: true },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "FlashCardAttempt" },
    total_attempts: { type: Number, default: 0 },
    accuracy_overall: { type: Number, default: 0 }, // % đúng tổng thể
    start_date: { type: Date, default: Date.now },
    end_date: { type: Date },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const FlashCardPlan = model<IFlashCardPlan>(
  "FlashCardPlan",
  FlashCardPlanSchema
);
