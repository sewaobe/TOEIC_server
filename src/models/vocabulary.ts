import mongoose, { Schema, Document } from 'mongoose';

export interface IVocabulary extends Document {
  word: string;
  phonetic: string;
  type: string;
  definition: string;
  examples: string[];
  image: string;
  audio: string;
  created_at: Date;
  updated_at: Date;
}

const VocabularySchema = new Schema<IVocabulary>({
  word: String,
  phonetic: String,
  type: String,
  definition: String,
  examples: [String],
  image: String,
  audio: String,
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
});

export const Vocabulary = mongoose.model<IVocabulary>(
  'Vocabulary',
  VocabularySchema,
);
