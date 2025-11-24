import mongoose, { Document, Types } from "mongoose";

export interface IUserNote extends Document {
    user_id: Types.ObjectId;
    title: string;
    content: string;
    related_object?: {
        related_id: string;
        week_no: string;
        day_id: string;
    } | null;
    created_at: Date;
    updated_at: Date;
}

const UserNoteSchema = new mongoose.Schema<IUserNote>({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    related_object: {
        related_id: { type: String, default: null },
        week_no: { type: String, default: null },
        day_id: { type: String, default: null },
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false
});

export const UserNote = mongoose.model<IUserNote>("UserNote", UserNoteSchema);