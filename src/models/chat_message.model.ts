import { Schema, model, Types, Document } from "mongoose";

export interface IPronunciationMistake {
    original: string;
    correction: string;
    type: "grammar" | "vocabulary" | "pronunciation";
    explanation: string;
}

export interface IVocabSuggestion {
    word: string;
    context: string;
    alternatives: string[];
}

export interface IGrammarBreakdownItem {
    structure: string;
    example: string;
    advice: string;
    status: "Correct" | "Needs Improvement";
}

export interface IPronunciationFeedback {
    pronunciationScore?: number;
    fluencyScore?: number;
    intonationScore?: number;
    grammarScore?: number;
    mistakes?: IPronunciationMistake[];
    improvementTip?: string;
    totalScore?: number;
    // New fields for vocabulary and grammar suggestions
    vocabSuggestions?: IVocabSuggestion[];
    grammarBreakdown?: IGrammarBreakdownItem[];
}

export interface IChatMessageMeta {
    token_usage?: number;
    model?: string;
    feedback?: "like" | "dislike" | null;
    error?: string;

    // Speaking conversation specific metadata (no audio stored in DB)
    stt_text?: string;
    pronunciation_feedback?: IPronunciationFeedback;
    is_unintelligible?: boolean;
}

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
    meta: {
        token_usage: Number,
        model: String,
        feedback: { type: String, enum: ["like", "dislike", null], default: null },
        error: String,

        stt_text: String,
        pronunciation_feedback: {
            pronunciationScore: Number,
            fluencyScore: Number,
            intonationScore: Number,
            grammarScore: Number,
            mistakes: [
                {
                    original: String,
                    correction: String,
                    type: {
                        type: String,
                        enum: ["grammar", "vocabulary", "pronunciation"],
                    },
                    explanation: String,
                },
            ],
            improvementTip: String,
            totalScore: Number,
            // New fields for vocabulary and grammar suggestions
            vocabSuggestions: [
                {
                    word: String,
                    context: String,
                    alternatives: [String],
                },
            ],
            grammarBreakdown: [
                {
                    structure: String,
                    example: String,
                    advice: String,
                    status: {
                        type: String,
                        enum: ["Correct", "Needs Improvement"],
                    },
                },
            ],
        },
        is_unintelligible: Boolean,
    },
});

export const ChatMessage = model<IChatMessage>("ChatMessage", ChatMessageSchema);
