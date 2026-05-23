import { Schema, model, Document, Types } from "mongoose";
import {
    FLASHCARD_FEEDBACK_ACTIONS,
    FLASHCARD_SESSION_CARD_PHASES,
    FlashcardFeedbackAction,
    FlashcardSessionCardState,
} from "../types/flashcardFeedback.type";

export interface IFlashCardProgress extends Document {
    session_id: string;
    user_id: Types.ObjectId;
    topic_vocabulary_id?: Types.ObjectId;
    source_type?: "TOPIC_PRACTICE" | "SUGGESTION_QUICK_REVIEW";
    source_label?: string;
    order_queue: string[]; // session queue order is authoritative (backend-managed)
    current_index: number;
    logs: {
        answer_event_id: string;
        vocab_id: string;
        vocab_word: string;
        action: FlashcardFeedbackAction;
        response_time: number;
        attempted_at: string;
    }[];
    card_states: Map<string, FlashcardSessionCardState>;
    last_processed_answer_event_id?: string;
    last_activity: Date;
    status: "active" | "archived";
    archive_reason?: "completed" | "abandoned" | "expired";
}

const FlashCardProgressSchema = new Schema<IFlashCardProgress>(
    {
        session_id: { type: String, required: true, unique: true },
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        topic_vocabulary_id: { type: Schema.Types.ObjectId, ref: "TopicVocabulary", required: false },
        source_type: {
            type: String,
            enum: ["TOPIC_PRACTICE", "SUGGESTION_QUICK_REVIEW"],
            default: "TOPIC_PRACTICE",
            index: true,
        },
        source_label: { type: String },
        order_queue: { type: [String], default: [] },
        current_index: { type: Number, default: 0 },
        logs: [
            {
                answer_event_id: { type: String, required: true },
                vocab_id: { type: String, required: true },
                vocab_word: { type: String, required: true },
                action: {
                    type: String,
                    enum: FLASHCARD_FEEDBACK_ACTIONS,
                    required: true,
                },
                response_time: { type: Number, required: true },
                attempted_at: { type: String, required: true },
            },
        ],
        card_states: {
            type: Map,
            of: {
                phase: {
                    type: String,
                    enum: FLASHCARD_SESSION_CARD_PHASES,
                    required: true,
                },
                long_term_committed: {
                    type: Boolean,
                    required: true,
                    default: false,
                },
                repeat_count: {
                    type: Number,
                    required: true,
                    default: 0,
                    min: 0,
                },
            },
            default: undefined,
        },
        last_processed_answer_event_id: { type: String },
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
        partialFilterExpression: {
            status: "active",
            topic_vocabulary_id: { $exists: true },
        },
    }
);

export const FlashCardProgress = model<IFlashCardProgress>(
    "FlashCardProgress",
    FlashCardProgressSchema
);
