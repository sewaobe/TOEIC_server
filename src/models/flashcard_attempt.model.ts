import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";

export type EvalType = "easy" | "medium" | "hard" | "skip";
export type GameType = "classic" | "matching" | "word_recall";

export interface IFlashCardAttempt extends Document {
  user_id: Types.ObjectId;
  topic_vocabulary_id: Types.ObjectId;
  submit_type?: SubmissionType;
  game_type?: GameType;
  results: [
    {
      vocabulary_id: Types.ObjectId;
      eval_type: EvalType;
      response_time: number;
      attempted_at: Date;
    }
  ];
  accuracy: number;
  started_at: Date;
  finished_at?: Date;
  day_study_id?: Types.ObjectId;
  time_spent?: number;
  game_metadata?: {
    // Matching Game
    totalPairs?: number;
    correctPairs?: number;
    wrongAttempts?: number;
    score?: number;
    // Word Recall
    totalWords?: number;
    correctWords?: number;
    wrongWords?: number;
    totalScore?: number;
    combo?: number;
    wrongList?: Array<{
      word: string;
      definition: string;
    }>;
  };
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
    game_type: {
      type: String,
      enum: ["classic", "matching", "word_recall"],
      default: "classic",
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
    time_spent: { type: Number }, // seconds
    game_metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

export const FlashCardAttempt = model<IFlashCardAttempt>(
  "FlashCardAttempt",
  FlashCardAttemptSchema
);
