import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * UserVocabularyProgress Model
 *
 * Mô hình lưu trữ tiến trình ghi nhớ từ vựng của người dùng
 * sử dụng thuật toán HLR (Half-Life Regression) của Duolingo.
 *
 * Module này HOÀN TOÀN ĐỘC LẬP với hệ thống IRT hiện có.
 */

export interface IUserVocabularyProgress extends Document {
  user_id: Types.ObjectId; // Tham chiếu đến User
  vocabulary_id: Types.ObjectId; // Tham chiếu đến Vocabulary
  right_count: number; // Số lần trả lời đúng
  wrong_count: number; // Số lần trả lời sai
  last_practiced: Date; // Thời điểm luyện tập gần nhất
  half_life: number; // Half-life hiện tại (tính bằng giờ)
  next_review: Date; // Thời điểm cần ôn tập tiếp theo
  created_at: Date;
  updated_at: Date;
}

const UserVocabularyProgressSchema = new Schema<IUserVocabularyProgress>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vocabulary_id: {
      type: Schema.Types.ObjectId,
      ref: "Vocabulary",
      required: true,
    },
    right_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    wrong_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    last_practiced: {
      type: Date,
      default: Date.now,
    },
    half_life: {
      type: Number,
      default: 162.1, // Mặc định 162.1 giờ theo HLR spec
      min: 0,
    },
    next_review: {
      type: Date,
      default: Date.now, // Ban đầu cần ôn ngay
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

// ============================================
// INDEXES
// ============================================

// Index compound để query từ cần ôn tập của user (tối ưu cho GET /review-queue)
UserVocabularyProgressSchema.index({ user_id: 1, next_review: 1 });

// Index unique để đảm bảo mỗi user chỉ có 1 progress record cho mỗi từ
UserVocabularyProgressSchema.index(
  { user_id: 1, vocabulary_id: 1 },
  { unique: true },
);

// Index cho vocabulary_id để JOIN hiệu quả
UserVocabularyProgressSchema.index({ vocabulary_id: 1 });

// ============================================
// EXPORT
// ============================================

export const UserVocabularyProgress = mongoose.model<IUserVocabularyProgress>(
  "UserVocabularyProgress",
  UserVocabularyProgressSchema,
);
