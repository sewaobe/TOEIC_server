import mongoose, { Schema, Document, Types } from 'mongoose';
import { UserTestSubmitType } from './enums/UserTestSubmitType';

export interface IPartAccuracy {
  part_name: string;
  accuracy: number
}
export interface IUserTest extends Document {
  _id: Types.ObjectId;
  user_id: string;
  test_id: Types.ObjectId;
  submit_type: UserTestSubmitType;
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
  theta_overall: number; // estimated ability level for this question
  theta_parts: Record<number, number>;  // estimated ability level for each part
}

const UserTestSchema = new Schema<IUserTest>({
  user_id: { type: String, ref: 'User' },
  test_id: { type: Schema.Types.ObjectId, ref: 'Test' },
  score: { type: Number, default: 0 },
  answers: [
    {
      _id: false,
      question_id: { type: Schema.Types.ObjectId, ref: 'Question' },
      selectedOption: { type: String, default: '' },
      isCorrect: { type: Boolean, default: false },
    },
  ],
  /*
   * submit_type is the business context of this submission.
   * completedPart is kept for compatibility with older practice filters.
   */
  submit_type: {
    type: String,
    enum: Object.values(UserTestSubmitType),
    default: UserTestSubmitType.PRACTICE,
    index: true,
  },
  parts: [{
    _id: false,
    part_name: { type: String, default: '' },
    accuracy: { type: Number, default: 0 }
  }],
  completedPart: { type: String, default: '' }, // mặc định rỗng
  duration: { type: Number, default: 0 }, // mặc định 0 giây
  submit_at: { type: Date, default: Date.now },
  theta_overall: { type: Number, default: 0 }, // estimated ability level for this question
  theta_parts: { type: Schema.Types.Mixed, default: {} },  // estimated ability level for each part
});

export const UserTest = mongoose.model<IUserTest>('UserTest', UserTestSchema);
