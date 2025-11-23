import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";
export interface IQuizAttempt extends Document {
  user_id: Types.ObjectId;
  quiz_id: Types.ObjectId;
  submit_type?: SubmissionType;
  answers: { question_id: Types.ObjectId; chosen: string; correct: boolean }[];
  score: number;
  started_at: Date;
  finished_at?: Date;
  day_study_id?: Types.ObjectId;
}

const QuizAttemptSchema = new Schema<IQuizAttempt>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    answers: [
      {
        question_id: {
          type: Schema.Types.ObjectId,
          ref: "Question",
          required: true,
        },
        chosen: { type: String, required: true },
        correct: { type: Boolean, required: true },
      },
    ],
    submit_type: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.PRACTICE,
    },
    score: { type: Number, default: 0 },
    started_at: { type: Date, default: Date.now },
    finished_at: { type: Date },
    day_study_id: { type: Schema.Types.ObjectId, ref: "DayStudy" },
  },
  { timestamps: true }
);

export const QuizAttempt = model<IQuizAttempt>(
  "QuizAttempt",
  QuizAttemptSchema
);
