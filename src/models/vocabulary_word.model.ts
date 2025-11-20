import mongoose, { Schema, Document } from "mongoose";

export interface IVocabularyWord extends Document {
  word: string; // Từ vựng
  phonetic?: string; // Phiên âm
  type?: string; // Loại từ (noun, verb, adj,...)
  definitions: string[]; // Nhiều cách định nghĩa (tiếng Anh)
  hints?: string[]; // Nhiều gợi ý cho từ vựng
  examples?: string[]; // Ví dụ sử dụng (có thể cả EN và VI)
  image?: string; // Link ảnh minh họa
  audio?: string; // Link audio phát âm
  tags?: string[]; // Các tag từ toeicPart (Part 1, Part 2, ...)
  level?: string; // Level CERF: A1, A2, B1, B2, C1, C2
  part?: string; // TOEIC Part: Part 1, Part 2, ..., Part 7
  notes?: string; // Ghi chú thêm
  created_at: Date;
  updated_at: Date;
}

const VocabularyWordSchema = new Schema<IVocabularyWord>(
  {
    word: { type: String, required: true, trim: true },
    phonetic: { type: String, trim: true },
    type: { type: String, trim: true },
    definitions: [{ type: String, required: true }], // Mảng định nghĩa
    hints: [{ type: String }], // Mảng gợi ý
    examples: [{ type: String }], // Mảng ví dụ
    image: { type: String, trim: true },
    audio: { type: String, trim: true },
    tags: [{ type: String, trim: true }], // Tags từ toeicPart
    level: { type: String, trim: true }, // CERF level
    part: { type: String, trim: true }, // TOEIC Part
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
