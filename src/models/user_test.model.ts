import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPartAccuracy {
  part_name: string;
  accuracy: number
}
export interface IUserTest extends Document {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  test_id: Types.ObjectId;
  score: number;
  answers: {
    question_id: Types.ObjectId;
    selectedOption: string;
    isCorrect: boolean;
  }[];
  parts: IPartAccuracy[];
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
  parts: [{
    part_name: { type: String, default: '' },
    accuracy: { type: Number, default: 0 }
  }],
  completedPart: { type: String, default: '' }, // mặc định rỗng
  duration: { type: Number, default: 0 }, // mặc định 0 giây
  submit_at: { type: Date, default: Date.now },
});

export const UserTest = mongoose.model<IUserTest>('UserTest', UserTestSchema);
