import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserTest extends Document {
  user_id: Types.ObjectId;
  test_id: Types.ObjectId;
  score: number;
  answers: {
    question_id: Types.ObjectId;
    selectedOption: string;
    isCorrect: boolean;
  }[];
  completedPart: string; // Phần đã hoàn thành, ví dụ: "Part 1,2"
  duration: number; // Thời gian làm bài (tính bằng giây hoặc ms)
  submit_at: Date;
}

const UserTestSchema = new Schema<IUserTest>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  test_id: { type: Schema.Types.ObjectId, ref: 'Test' },
  score: { type: Number, default: 0 },
  answers: [
    {
      question_id: { type: Schema.Types.ObjectId, ref: 'Question' },
      selectedOption: { type: String, default: '' },
      isCorrect: { type: Boolean, default: false },
    },
  ],
  completedPart: { type: String, default: '' }, // mặc định rỗng
  duration: { type: Number, default: 0 }, // mặc định 0 giây
  submit_at: { type: Date, default: Date.now },
});

export const UserTest = mongoose.model<IUserTest>('UserTest', UserTestSchema);
