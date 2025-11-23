import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";

export type EvalType = "easy" | "medium" | "hard" | "skip";

export interface IFlashCardAttempt extends Document {
  user_id: Types.ObjectId;
  topic_vocabulary_id: Types.ObjectId;
  submit_type?: SubmissionType;
  results: [
    {
      vocabulary_id: Types.ObjectId;
      eval_type: EvalType;
      response_time: number;
    }
  ];
  accuracy: number;
  started_at: Date;
  finished_at?: Date;
  day_study_id?: Types.ObjectId;
}

const FlashCardAttemptSchema = new Schema<IFlashCardAttempt>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    topic_vocabulary_id: {
      type: Schema.Types.ObjectId,
      ref: "TopicVocabulary",
      required: true,
    },
    day_study_id: {
      type: Schema.Types.ObjectId,
      ref: "DayStudy",
      required: false,
    },
    submit_type: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.PRACTICE,
    },
    results: [
      {
        vocabulary_id: {
          type: Schema.Types.ObjectId,
          ref: "Vocabulary",
          required: true,
        },
        eval_type: {
          type: String,
          enum: ["easy", "medium", "hard", "skip"],
          required: true,
        },
        response_time: { type: Number, required: true },
      },
    ],
    accuracy: { type: Number, default: 0 },
    started_at: { type: Date, default: Date.now },
    finished_at: { type: Date },
  },
  { timestamps: true }
);

export const FlashCardAttempt = model<IFlashCardAttempt>(
  "FlashCardAttempt",
  FlashCardAttemptSchema
);
