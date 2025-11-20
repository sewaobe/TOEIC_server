import mongoose, { Schema, Document } from "mongoose";

export interface IVocabularyWord extends Document {
  word: string; // Từ vựng
  phonetic: string; // Phiên âm
  type: string; // Loại từ (noun, verb, adj,...)
  definition_vi: string; // Định nghĩa tiếng Việt
  definition_en: string; // Định nghĩa tiếng Anh (dùng cho practice)
  examples?: {
    en: string;
    vi: string;
  }[]; // Ví dụ
  image?: string; // Link ảnh minh họa
  audio?: string; // Link audio phát âm
  tags?: string[]; // Các tag gắn kèm
  notes?: string; // Ghi chú thêm
  created_at: Date;
  updated_at: Date;
}

const VocabularyWordSchema = new Schema<IVocabularyWord>(
  {
    word: { type: String, required: true, trim: true },
    phonetic: { type: String, trim: true },
    type: { type: String, trim: true },
    definition_vi: { type: String, required: true },
    definition_en: { type: String, required: true },
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

export const VocabularyWord = mongoose.model<IVocabularyWord>(
  "VocabularyWord",
  VocabularyWordSchema
);
