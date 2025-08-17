import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBadge extends Document {
  achievement_id: Types.ObjectId;
  name: string;
  image: string;
  priority: number;
  created_at: Date;
}

const BadgeSchema = new Schema<IBadge>({
  achievement_id: { type: Schema.Types.ObjectId, ref: 'Achievement' },
  name: String,
  image: String,
  priority: Number,
  created_at: { type: Date, default: Date.now },
});

export const Badge = mongoose.model<IBadge>('Badge', BadgeSchema);
