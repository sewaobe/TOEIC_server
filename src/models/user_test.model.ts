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
  submit_at: Date;
}

const UserTestSchema = new Schema<IUserTest>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  test_id: { type: Schema.Types.ObjectId, ref: 'Test' },
  score: Number,
  answers: [
    {
      question_id: { type: Schema.Types.ObjectId, ref: 'Question' },
      selectedOption: String,
      isCorrect: Boolean,
    },
  ],
  submit_at: { type: Date, default: Date.now },
});

export const UserTest = mongoose.model<IUserTest>('UserTest', UserTestSchema);
