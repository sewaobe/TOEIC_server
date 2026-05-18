import { Schema, model, Document, Types } from "mongoose";
import { SubmissionType } from "./enums/SubmissionType";
import {
  FLASHCARD_FEEDBACK_ACTIONS,
  FlashcardFeedbackAction,
} from "../types/flashcardFeedback.type";

export type GameType = "classic" | "matching" | "word_recall";

export interface IFlashCardAttempt extends Document {
  session_id?: string;
  user_id: Types.ObjectId;
  topic_vocabulary_id: Types.ObjectId;
  submit_type?: SubmissionType;
  game_type?: GameType;
  results: Array<
    {
      answer_event_id: string;
      vocabulary_id: Types.ObjectId;
      action: FlashcardFeedbackAction;
      response_time: number;
      attempted_at: Date;
    }
  >;
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
    session_id: { type: String },
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
        answer_event_id: {
          type: String,
          required: true,
        },
        vocabulary_id: {
          type: Schema.Types.ObjectId,
          ref: "Vocabulary",
          required: true,
        },
        action: {
          type: String,
          enum: FLASHCARD_FEEDBACK_ACTIONS,
          required: true,
        },
        response_time: { type: Number, required: true },
        attempted_at: { type: Date, required: true },
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

FlashCardAttemptSchema.index(
  { session_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      session_id: { $exists: true, $type: "string" },
    },
  }
);

export const FlashCardAttempt = model<IFlashCardAttempt>(
  "FlashCardAttempt",
  FlashCardAttemptSchema
);
