import { Schema, model, Types, Document } from "mongoose";
import { IChatMessageMeta } from "../types/chat.types";

export type { IChatMessageMeta } from "../types/chat.types";

export interface IChatMessage extends Document {
    session_id: Types.ObjectId;
    sender: "user" | "bot";
    text: string;
    created_at: Date;
    meta?: IChatMessageMeta;
}

const ChatMessageSchema = new Schema<IChatMessage>({
    session_id: { type: Schema.Types.ObjectId, ref: "ChatSession", required: true },
    sender: { type: String, enum: ["user", "bot"], required: true },
    text: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    // Previous fixed meta schema kept for rollback/reference:
    // meta: {
    //     token_usage: Number,
    //     model: String,
    //     feedback: { type: String, enum: ["like", "dislike", null], default: null },
    //     error: String,
    //     stt_text: String,
    //     pronunciation_feedback: {
    //         pronunciationScore: Number,
    //         fluencyScore: Number,
    //         intonationScore: Number,
    //         grammarScore: Number,
    //         mistakes: [
    //             {
    //                 original: String,
    //                 correction: String,
    //                 type: {
    //                     type: String,
    //                     enum: ["grammar", "vocabulary", "pronunciation"],
    //                 },
    //                 explanation: String,
    //             },
    //         ],
    //         improvementTip: String,
    //         totalScore: Number,
    //         vocabSuggestions: [
    //             {
    //                 word: String,
    //                 context: String,
    //                 alternatives: [String],
    //             },
    //         ],
    //         grammarBreakdown: [
    //             {
    //                 structure: String,
    //                 example: String,
    //                 advice: String,
    //                 status: {
    //                     type: String,
    //                     enum: ["Correct", "Needs Improvement"],
    //                 },
    //             },
    //         ],
    //     },
    //     is_unintelligible: Boolean,
    // },
    meta: {
        type: Schema.Types.Mixed,
        default: {},
    },
});

export const ChatMessage = model<IChatMessage>("ChatMessage", ChatMessageSchema);
