import { Schema, model, Document, Types } from "mongoose";
import { EvalType } from "./flashcard_attempt.model";

export interface IFlashCardProgress extends Document {
    session_id: string;
    user_id: Types.ObjectId;
    topic_vocabulary_id: Types.ObjectId;
    order_queue: string[]; // danh sách vocab_id theo thứ tự hiện tại (do FE xử lý)
    current_index: number;
    logs: {
        vocab_id: string;
        vocab_word: string;
        eval_type: EvalType;
        response_time: number;
        attempted_at: string;
    }[];
    last_activity: Date;
    status: "active" | "archived";
    archive_reason?: "completed" | "abandoned" | "expired";
}

const FlashCardProgressSchema = new Schema<IFlashCardProgress>(
    {
        session_id: { type: String, required: true, unique: true },
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        topic_vocabulary_id: { type: Schema.Types.ObjectId, ref: "TopicVocabulary", required: true },
        order_queue: { type: [String], default: [] },
        current_index: { type: Number, default: 0 },
        logs: [
            {
                vocab_id: String,
                vocab_word: String,
                eval_type: {
                    type: String,
                    enum: ["easy", "medium", "hard", "skip"],
                },
                response_time: Number,
                attempted_at: String,
            },
        ],
        last_activity: { type: Date, default: Date.now },
        status: { type: String, enum: ["active", "archived"], default: "active" },
        archive_reason: { type: String },
    },
    { timestamps: true }
);

FlashCardProgressSchema.index(
    { user_id: 1, topic_vocabulary_id: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "active" },
    }
);

export const FlashCardProgress = model<IFlashCardProgress>(
    "FlashCardProgress",
    FlashCardProgressSchema
);
