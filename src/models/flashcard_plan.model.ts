import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
import { PartType } from "./enums/PartType";

export interface IFlashCardPlan extends Document {
  user_id: Types.ObjectId;
  topic_id: Types.ObjectId; // trỏ tới Topic (chứa nhiều vocabularies)
  part_type?: PartType | null; 
  status: WeekStudyStatus;
  latest_attempt?: Types.ObjectId;
  planned_completion_time: number; 
  weight: number; 
  created_at: Date;
  updated_at?: Date;
}

const FlashCardPlanSchema = new Schema<IFlashCardPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
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
    latest_attempt: { type: Schema.Types.ObjectId, ref: "FlashCardAttempt" },
    planned_completion_time: { type: Number, default: 0 },
    weight: { type: Number, default: 0.1 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const FlashCardPlan = model<IFlashCardPlan>(
  "FlashCardPlan",
  FlashCardPlanSchema
);
