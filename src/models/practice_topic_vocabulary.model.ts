import mongoose, { Schema, Document, Types } from "mongoose";
import { CERFLevel } from "./topic_vocabulary.model";

export interface IPracticeTopicVocabulary extends Document {
  title: string;
  description?: string;
  tags?: string[];
  level?: CERFLevel;
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
