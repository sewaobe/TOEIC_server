import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";

export interface IQuizPlan extends Document {
  user_id: Types.ObjectId;
  quiz_id: Types.ObjectId;
  submit_type?: SubmissionType;
  latest_attempt?: Types.ObjectId;
  total_attempts: number;
  accuracy_overall: number;
  created_at: Date;
  updated_at?: Date;
}

const QuizPlanSchema = new Schema<IQuizPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    submit_type: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.PRACTICE,
    },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "QuizAttempt" },
    total_attempts: { type: Number, default: 0 },
    accuracy_overall: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const QuizPlan = model<IQuizPlan>("QuizPlan", QuizPlanSchema);

