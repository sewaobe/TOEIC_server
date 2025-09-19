import { Schema, model, Document, Types } from "mongoose";
export interface IShadowingAttempt extends Document {
    user_id: Types.ObjectId;
    question_id: Types.ObjectId;
    recordings: { audio_url: string; similarity_score: number };
    duration: number;
    started_at: Date;
    finished_at?: Date;
}

const ShadowingAttemptSchema = new Schema<IShadowingAttempt>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        question_id: { type: Schema.Types.ObjectId, ref: "Question", required: true },
        recordings:
        {
            audio_url: { type: String, required: true },
            similarity_score: { type: Number, default: 0 },
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
