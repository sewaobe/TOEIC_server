
import { Schema, model, Document, Types } from "mongoose";
export interface IDictationAttempt extends Document {
    user_id: Types.ObjectId;
    dictation_id: Types.ObjectId;
    answers: string;
    accuracy: number;
    duration: number;
    mistakes?: string[];
    started_at: Date;
    finished_at?: Date;
}

const DictationAttemptSchema = new Schema<IDictationAttempt>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        dictation_id: { type: Schema.Types.ObjectId, ref: "Dictation", required: true },
        answers: { type: String },
        accuracy: { type: Number, default: 0 },
        duration: { type: Number, default: 0 },
        mistakes: [String],
        started_at: { type: Date, default: Date.now },
        finished_at: { type: Date },
    },
    { timestamps: true }
);

export const DictationAttempt = model<IDictationAttempt>("DictationAttempt", DictationAttemptSchema);
