import mongoose, { Schema, Document, Types } from 'mongoose';

enum TopicLevel {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
  C2 = 'C2'
}
export interface ITopic extends Document {
  title: string;
  description: string;
  tags: string[];
  level: TopicLevel;
  iconName: string;
  bgColor: string;
  gradient: string;
  vocabularies_id: Types.ObjectId[];
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const TopicSchema = new Schema<ITopic>({
  title: String,
  description: String,
  tags: [{type: String, required: true}],
  iconName: {type: String},
  bgColor: {type: String, default: "ffffff"},
  gradient: {type: String},
  level: {type: String, enum: Object.values(TopicLevel), default: TopicLevel.A1},
  vocabularies_id: [{ type: Schema.Types.ObjectId, ref: 'Vocabulary' }],
  created_at: { type: Date, default: Date.now },
  created_by: {type: Schema.Types.ObjectId, ref: "User"},
  updated_at: Date,
});

export const Topic = mongoose.model<ITopic>('Topic', TopicSchema);
