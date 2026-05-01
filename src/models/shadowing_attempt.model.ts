import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";

export type ShadowingAttemptStatus = "draft" | "completed";

export interface IShadowingSegmentAttempt {
  user_transcript: string;
  similarity_score: number;
  accuracy_score?: number;
  feedback?: string;
  duration?: number;
  attempted_at: Date;
}

export interface IShadowingSegmentResult {
  index: number;
  text: string;
  attempts: IShadowingSegmentAttempt[];
}

export interface IShadowingAttempt extends Document {
  user_id: Types.ObjectId;
  shadowing_id: Types.ObjectId;
  session_id?: Types.ObjectId;
  status: ShadowingAttemptStatus;
  submit_type?: SubmissionType;
  recorded_audio?: string;
  similarity_score: number;
  total_segments: number;
  completed_segments: number;
  segment_results: IShadowingSegmentResult[];
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
    session_id: { type: Schema.Types.ObjectId, ref: "PracticeSession", index: true },
    status: {
      type: String,
      enum: ["draft", "completed"],
      default: "draft",
      index: true,
    },
    submit_type: {
      type: String,
      enum: Object.values(SubmissionType),
      default: SubmissionType.PRACTICE,
    },
    recorded_audio: { type: String },
    similarity_score: { type: Number, default: 0 },
    total_segments: { type: Number, default: 0 },
    completed_segments: { type: Number, default: 0 },
    segment_results: [
      {
        index: { type: Number, required: true },
        text: { type: String, default: "" },
        attempts: [
          {
            user_transcript: { type: String, default: "" },
            similarity_score: { type: Number, default: 0 },
            accuracy_score: { type: Number },
            feedback: { type: String },
            duration: { type: Number },
            attempted_at: { type: Date, default: Date.now },
          },
        ],
      },
    ],
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

ShadowingAttemptSchema.index({ user_id: 1, shadowing_id: 1, session_id: 1 });

export const ShadowingAttempt = model<IShadowingAttempt>(
  "ShadowingAttempt",
  ShadowingAttemptSchema
);
