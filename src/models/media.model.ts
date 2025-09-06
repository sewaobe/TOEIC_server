import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMedia extends Document {
  topic: string;
  url: string;
  type: string;
  duration?: number;
  transcript: string;
  created_at: Date;
  updated_at: Date;
}

const MediaSchema = new Schema<IMedia>({
  topic: String,
  url: String,
  type: String,
  duration: Number,
  transcript: String,
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
});

export const Media = mongoose.model<IMedia>('Media', MediaSchema);
