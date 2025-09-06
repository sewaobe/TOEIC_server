import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILesson extends Document {
  type: string;
  title: string;
  tags: string[];
  summary: string;
  content: string;
  planned_completion_time: number;
  medias_id: Types.ObjectId[];
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const LessonSchema = new Schema<ILesson>({
  type: String,
  title: String,
  tags: [{ type: String, default: "" }],
  summary: { type: String, default: "" },
  content: { type: String },
  planned_completion_time: { type: Number, default: 0 },
  medias_id: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
});

export const Lesson = mongoose.model<ILesson>('Lesson', LessonSchema);
