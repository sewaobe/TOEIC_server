import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
export interface IFlashCardPlan extends Document {
    user_id: Types.ObjectId;
    topic_id: Types.ObjectId;          // trỏ tới Topic (chứa nhiều vocabularies)
    status: WeekStudyStatus;
    latest_attempt?: Types.ObjectId;
    created_at: Date;
    updated_at?: Date;
}

const FlashCardPlanSchema = new Schema<IFlashCardPlan>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
        status: {
            type: String,
            enum: Object.values(WeekStudyStatus),
            default: WeekStudyStatus.LOCK,
        },
        latest_attempt: { type: Schema.Types.ObjectId, ref: "FlashCardAttempt" },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const FlashCardPlan = model<IFlashCardPlan>("FlashCardPlan", FlashCardPlanSchema);

