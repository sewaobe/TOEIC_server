import { Schema, model, Document, Types } from "mongoose";
export interface IShadowingAttempt extends Document {
    user_id: Types.ObjectId;
    shadowing_id: Types.ObjectId;
    recorded_audio: string;
    similarity_score: number;
    pronunciation_feedback?: {
        words: { word: string; score: number }[];
    };
    duration: number;
    started_at: Date;
    finished_at?: Date;
}

const ShadowingAttemptSchema = new Schema<IShadowingAttempt>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        shadowing_id: { type: Schema.Types.ObjectId, ref: "Shadowing", required: true },
        recorded_audio: { type: String, required: true },
        similarity_score: { type: Number, default: 0 },
        pronunciation_feedback: {
            words: [{ word: String, score: Number }],
        },
        duration: { type: Number, default: 0 },
        started_at: { type: Date, default: Date.now },
        finished_at: { type: Date },
    },
    { timestamps: true }
);

export const ShadowingAttempt = model<IShadowingAttempt>(
    "ShadowingAttempt",
    ShadowingAttemptSchema
);
