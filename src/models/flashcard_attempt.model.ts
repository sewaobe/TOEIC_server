import { Schema, model, Document, Types } from "mongoose";

export interface IFlashCardAttempt extends Document {
    user_id: Types.ObjectId;
    topic_id: Types.ObjectId;
    total_count: number;
    accuracy: number;
    started_at: Date;
    finished_at?: Date;
    duration?: number; // tổng thời gian (finished_at - started_at)
}

const FlashCardAttemptSchema = new Schema<IFlashCardAttempt>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        topic_id: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
        total_count: { type: Number, required: true },
        accuracy: { type: Number, default: 0 },
        started_at: { type: Date, default: Date.now },
        finished_at: { type: Date },
        duration: { type: Number }, // ms hoặc giây
    },
    { timestamps: true }
);

export const FlashCardAttempt = model<IFlashCardAttempt>(
    "FlashCardAttempt",
    FlashCardAttemptSchema
);
