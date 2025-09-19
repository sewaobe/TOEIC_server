import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
export interface IQuizPlan extends Document {
    user_id: Types.ObjectId;
    question_ids: Types.ObjectId[];    // nhiều question
    status: WeekStudyStatus;
    latest_attempt?: Types.ObjectId;
    created_at: Date;
    updated_at?: Date;
}

const QuizPlanSchema = new Schema<IQuizPlan>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        question_ids: [{ type: Schema.Types.ObjectId, ref: "Question", required: true }],
        status: {
            type: String,
            enum: Object.values(WeekStudyStatus),
            default: WeekStudyStatus.LOCK,
        },
        latest_attempt: { type: Schema.Types.ObjectId, ref: "QuizAttempt" },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const QuizPlan = model<IQuizPlan>("QuizPlan", QuizPlanSchema);

