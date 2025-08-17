import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITest extends Document {
  title: string;
  questions: Types.ObjectId[];
  type: string;
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const TestSchema = new Schema<ITest>({
  title: String,
  questions: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
  type: String,
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
});

export const Test = mongoose.model<ITest>('Test', TestSchema);
