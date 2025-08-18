import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILesson extends Document {
  type: string;
  title: string;
  medias: Types.ObjectId[];
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const LessonSchema = new Schema<ILesson>({
  type: String,
  title: String,
  medias: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
});

export const Lesson = mongoose.model<ILesson>('Lesson', LessonSchema);
