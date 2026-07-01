import mongoose, { Schema, Document } from "mongoose";

enum VocabularyType {
  LC = "listening",
  RC = "reading",
}

export interface IVocabulary extends Document {
  word: string;
  normalized_word?: string;
  phonetic: string;
  type: string;
  weight: number;
  definition: string;
  examples?: {
    en: string;
    vi: string;
  }[];
  image: string;
  audio: string;
  part_type: VocabularyType;
  tags: string[];
  notes: string;
  created_at: Date;
  updated_at: Date;
}

const VocabularySchema = new Schema<IVocabulary>(
  {
    word: { type: String, required: true, trim: true },
    normalized_word: { type: String, trim: true, lowercase: true },
    phonetic: { type: String, trim: true },
    type: { type: String, trim: true },
    part_type: { type: String },
    weight: { type: Number, default: 0 },
    definition: { type: String },
    examples: [
      {
        en: { type: String },
        vi: { type: String },
      },
    ],
    image: { type: String, trim: true },
    audio: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    notes: { type: String, trim: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

function normalizeVocabularyWord(word?: string) {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

VocabularySchema.pre("validate", function (next) {
  if (this.word) {
    this.normalized_word = normalizeVocabularyWord(this.word);
  }
  next();
});

VocabularySchema.index(
  { normalized_word: 1, type: 1 },
  { unique: true, sparse: true }
);

export const Vocabulary = mongoose.model<IVocabulary>(
  "Vocabulary",
  VocabularySchema
);
