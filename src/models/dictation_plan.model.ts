import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
export interface IDictationPlan extends Document {
    user_id: Types.ObjectId;
    question_ids: Types.ObjectId[];    // nhiều question dạng dictation
    status: WeekStudyStatus;
    latest_attempt?: Types.ObjectId;
    created_at: Date;
    updated_at?: Date;
}

const DictationPlanSchema = new Schema<IDictationPlan>(
    {
        user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        question_ids: [{ type: Schema.Types.ObjectId, ref: "Question", required: true }],
        status: {
            type: String,
            enum: Object.values(WeekStudyStatus),
            default: WeekStudyStatus.LOCK,
        },
        latest_attempt: { type: Schema.Types.ObjectId, ref: "DictationAttempt" },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const DictationPlan = model<IDictationPlan>("DictationPlan", DictationPlanSchema);
