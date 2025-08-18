import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IQuestion extends Document {
  type: string;
  content: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const QuestionSchema = new Schema<IQuestion>({
  type: String,
  content: String,
  choices: [String],
  correctAnswer: String,
  explanation: String,
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
});

export const Question = mongoose.model<IQuestion>('Question', QuestionSchema);
