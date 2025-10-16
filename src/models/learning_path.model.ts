import mongoose, { Schema, Document, Types } from 'mongoose';
import { CERFLevel } from './topic_vocabulary.model';

export interface ILearningPath extends Document {
  title: string;
  description: string;
  level: CERFLevel;
  isActive: boolean;
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const LearningPathSchema = new Schema<ILearningPath>({
  title: String,
  description: String,
  level: { type: String, enum: Object.values(CERFLevel), required: true },
  isActive: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
});

export const LearningPath = mongoose.model<ILearningPath>(
  'LearningPath',
  LearningPathSchema,
);
