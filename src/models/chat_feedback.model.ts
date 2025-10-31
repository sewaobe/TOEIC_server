import { Schema, model, Types, Document } from "mongoose";

export interface IChatFeedback extends Document {
    user_id?: Types.ObjectId;
    session_id: Types.ObjectId;
    message_id: Types.ObjectId;
    rating: "like" | "dislike";
    comment?: string;
    created_at: Date;
}

const ChatFeedbackSchema = new Schema<IChatFeedback>({
    user_id: { type: Schema.Types.ObjectId, ref: "User" },
    session_id: { type: Schema.Types.ObjectId, ref: "ChatSession", required: true },
    message_id: { type: Schema.Types.ObjectId, ref: "ChatMessage", required: true },
    rating: { type: String, enum: ["like", "dislike"], required: true },
    comment: String,
    created_at: { type: Date, default: Date.now },
});

export const ChatFeedback = model<IChatFeedback>("ChatFeedback", ChatFeedbackSchema);
