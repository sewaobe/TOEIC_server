import mongoose, { Schema, Document } from "mongoose";

enum VocabularyType {
  LC = "listening",
  RC = "reading"
}
export interface IVocabulary extends Document {
  word: string; // Từ vựng
  phonetic: string; // Phiên âm
  type: string; // Loại từ (noun, verb, adj,...)
  weight: number; //0->1: Xác định độ dễ/khó của từ vựng.
  definition: string; // Định nghĩa
  examples: string[]; // Ví dụ
  image: string; // Link ảnh minh họa
  part_type: VocabularyType;
  tags: string[]; // Các tag gắn kèm (ví dụ: TOEIC, Travel, Business)
  created_at: Date; // Ngày tạo
  updated_at: Date; // Ngày cập nhật
}

const VocabularySchema = new Schema<IVocabulary>(
  {
    word: { type: String, required: true, trim: true },
    phonetic: { type: String, trim: true },
    type: { type: String, trim: true },
    part_type: { type: String, default: VocabularyType.LC },
    weight: { type: Number, default: 0 },
    definition: { type: String, required: true },
    examples: [{ type: String, trim: true }],
    image: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }, // Tự động update
  }
);

export const Vocabulary = mongoose.model<IVocabulary>(
  "Vocabulary",
  VocabularySchema
);
