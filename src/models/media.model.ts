import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMedia extends Document {
  topic: string;
  url: string;
  type: string;
  lessons: Types.ObjectId[];
  created_at: Date;
  updated_at: Date;
}

const MediaSchema = new Schema<IMedia>({
  topic: String,
  url: String,
  type: String,
  lessons: [{ type: Schema.Types.ObjectId, ref: 'Lesson' }],
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
});

export const Lesson = mongoose.model<IMedia>('Media', MediaSchema);
