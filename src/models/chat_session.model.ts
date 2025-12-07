import { Schema, model, Types, Document } from "mongoose";

export type ChatType =
    | "question"
    | "reading"
    | "shadowing"
    | "dictation"
    | "lesson"
    | "speaking_conversation";

export interface IChatSession extends Document {
    user_id?: Types.ObjectId;
    title: string;
    type: ChatType;
    created_at: Date;
    updated_at: Date;
    last_message_preview?: string;
    total_messages?: number;
    is_archived?: boolean;
    // Optional config used for speaking practice or other specialized sessions
    config?: any;

    // Speaking session lifecycle
    status?: "active" | "ended";
    ended_at?: Date;
    actual_duration_seconds?: number;
}

const ChatSessionSchema = new Schema<IChatSession>({
    user_id: { type: Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: true },
    type: {
        type: String,
        enum: [
            "question",
            "reading",
            "shadowing",
            "dictation",
            "lesson",
            "speaking_conversation",
        ],
        required: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    last_message_preview: String,
    total_messages: { type: Number, default: 0 },
    is_archived: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["active", "ended"], default: "active" },
    ended_at: { type: Date },
    actual_duration_seconds: { type: Number },
});

export const ChatSession = model<IChatSession>("ChatSession", ChatSessionSchema);
