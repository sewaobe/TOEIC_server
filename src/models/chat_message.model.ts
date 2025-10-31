import { Schema, model, Types, Document } from "mongoose";

export interface IChatMessageMeta {
    token_usage?: number;
    model?: string;
    feedback?: "like" | "dislike" | null;
    error?: string;
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
    },
});

export const ChatMessage = model<IChatMessage>("ChatMessage", ChatMessageSchema);
