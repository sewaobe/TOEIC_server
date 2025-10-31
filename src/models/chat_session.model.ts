import { Schema, model, Types, Document } from "mongoose";

export type ChatType = "question" | "reading" | "shadowing" | "dictation" | "lesson";

export interface IChatSession extends Document {
    user_id?: Types.ObjectId;
    title: string;
    type: ChatType;
    created_at: Date;
    updated_at: Date;
    last_message_preview?: string;
    total_messages?: number;
    is_archived?: boolean;
}

const ChatSessionSchema = new Schema<IChatSession>({
    user_id: { type: Schema.Types.ObjectId, ref: "User" },
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ["question", "reading", "shadowing", "dictation", "lesson"],
        required: true,
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    last_message_preview: String,
    total_messages: { type: Number, default: 0 },
    is_archived: { type: Boolean, default: false },
});

export const ChatSession = model<IChatSession>("ChatSession", ChatSessionSchema);
