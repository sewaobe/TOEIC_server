import mongoose, { Schema, Document, Types } from 'mongoose';
import { LearningPathType } from './enums/LearningPathType';

export interface ILearningPath extends Document {
  title: string;
  description: string;
  level: LearningPathType;
  isActive: boolean;
  week_studies_id: Types.ObjectId[];
  additional_week_studies?: Types.ObjectId[];
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const LearningPathSchema = new Schema<ILearningPath>({
  title: String,
  description: String,
  level: String,
  isActive: { type: Boolean, default: false },
  week_studies_id: [{ type: Schema.Types.ObjectId, ref: "WeekStudy", default: [] }],
  additional_week_studies: [{ type: Schema.Types.ObjectId, ref: "WeekStudy" }],
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
});

export const LearningPath = mongoose.model<ILearningPath>(
  'LearningPath',
  LearningPathSchema,
);
