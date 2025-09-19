import { Schema, model, Document, Types } from "mongoose";
export interface IQuizAttempt extends Document {
    user_id: Types.ObjectId;
    question_ids: Types.ObjectId[];
    answers: { question_id: Types.ObjectId; chosen: string; correct: boolean }[];
    score: number;
    started_at: Date;
    finished_at?: Date;
}

const QuizAttemptSchema = new Schema<IQuizAttempt>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        question_ids: [{ type: Schema.Types.ObjectId, ref: "Question", required: true }],
        answers: [
            {
                question_id: { type: Schema.Types.ObjectId, ref: "Question", required: true },
                chosen: { type: String, required: true },
                correct: { type: Boolean, required: true },
            },
        ],
        score: { type: Number, default: 0 },
        started_at: { type: Date, default: Date.now },
        finished_at: { type: Date },
    },
    { timestamps: true }
);

export const QuizAttempt = model<IQuizAttempt>("QuizAttempt", QuizAttemptSchema);
