import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITopic extends Document {
  title: string;
  description: string;
  vocabularies_id: Types.ObjectId[];
  created_at: Date;
  updated_at: Date;
}

const TopicSchema = new Schema<ITopic>({
  title: String,
  description: String,
  vocabularies_id: [{ type: Schema.Types.ObjectId, ref: 'Vocabulary' }],
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
});

export const Topic = mongoose.model<ITopic>('Topic', TopicSchema);
