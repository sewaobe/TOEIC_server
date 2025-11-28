import mongoose, { Schema, Document, Types } from "mongoose";
import { CERFLevel } from "./topic_vocabulary.model";
import { PartType } from "./enums/PartType";

export interface IPracticeTopicVocabulary extends Document {
  title: string;
  description?: string;
  tags?: string[];
  level?: CERFLevel;
  part_type?: PartType; // TOEIC Part: Part 1..7 (numeric enum)
  vocabulary_words: Types.ObjectId[]; // Tham chiếu tới VocabularyWord
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const PracticeTopicVocabularySchema = new Schema<IPracticeTopicVocabulary>(
  {
    title: { type: String, required: true },
    description: { type: String },
    tags: [{ type: String }],
    level: {
      type: String,
      enum: Object.values(CERFLevel),
      default: CERFLevel.A1,
    },
    part_type: {
      type: Number,
      enum: Object.values(PartType).filter((v) => typeof v === "number"),
    }, // TOEIC Part numeric enum (1..7)
    vocabulary_words: [{ type: Schema.Types.ObjectId, ref: "VocabularyWord" }],
    created_at: { type: Date, default: Date.now },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export const PracticeTopicVocabulary = mongoose.model<IPracticeTopicVocabulary>(
  "PracticeTopicVocabulary",
  PracticeTopicVocabularySchema
);
