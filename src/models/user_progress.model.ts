import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserProgress extends Document {
  user_id: Types.ObjectId;
  learningPaths_id: Types.ObjectId;
  completedLessons_id: Types.ObjectId[];
  questions_id: Types.ObjectId[];
  topics_id: Types.ObjectId[];
  isCompleted: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

const UserProgressSchema = new Schema<IUserProgress>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  learningPaths_id: { type: Schema.Types.ObjectId, ref: 'LearningPath' },
  completedLessons_id: [{ type: Schema.Types.ObjectId, ref: 'Lesson' }],
  questions_id: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
  topics_id: [{ type: Schema.Types.ObjectId, ref: 'Topic' }],
  isCompleted: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
  deleted_at: Date,
});

export const UserProgress = mongoose.model<IUserProgress>(
  'UserProgress',
  UserProgressSchema,
);
