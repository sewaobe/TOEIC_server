import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAchievement extends Document {
  list_user: {
    userId: Types.ObjectId;
    test_id: Types.ObjectId;
    score: number;
  }[];
  created_at: Date;
}

const AchievementSchema = new Schema<IAchievement>({
  list_user: [
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      test_id: { type: Schema.Types.ObjectId, ref: 'Test' },
      score: Number,
    },
  ],
  created_at: { type: Date, default: Date.now },
});

export const Achievement = mongoose.model<IAchievement>(
  'Achievement',
  AchievementSchema,
);
