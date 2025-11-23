import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";
export interface IShadowingAttempt extends Document {
  user_id: Types.ObjectId;
  shadowing_id: Types.ObjectId;
  submit_type?: SubmissionType;
  recorded_audio: string;
  similarity_score: number;
  pronunciation_feedback?: {
    words: { word: string; score: number }[];
  };
  duration: number;
  started_at: Date;
  finished_at?: Date;
  accuracy_score?: number;
  fluency_score?: number;
  intonation_score?: number;
  overall_feedback?: string;
  day_study_id?: Types.ObjectId;
}

const ShadowingAttemptSchema = new Schema<IShadowingAttempt>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shadowing_id: {
      type: Schema.Types.ObjectId,
      ref: "Shadowing",
      required: true,
    },
    submit_type: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.PRACTICE,
    },
    recorded_audio: { type: String, required: true },
    similarity_score: { type: Number, default: 0 },
    pronunciation_feedback: {
      words: [{ word: String, score: Number }],
    },
    duration: { type: Number, default: 0 },
    started_at: { type: Date, default: Date.now },
    finished_at: { type: Date },
    accuracy_score: { type: Number },
    fluency_score: { type: Number },
    intonation_score: { type: Number },
    overall_feedback: { type: String },
    day_study_id: { type: Schema.Types.ObjectId, ref: "DayStudy" },
  },
  { timestamps: true }
);

export const ShadowingAttempt = model<IShadowingAttempt>(
  "ShadowingAttempt",
  ShadowingAttemptSchema
);
