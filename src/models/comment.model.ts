import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IComment extends Document {
  user_id: Types.ObjectId;
  test_id: Types.ObjectId;
  parent_id?: Types.ObjectId;
  content: string;
  create_at: Date;
}

const CommentSchema = new Schema<IComment>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  test_id: { type: Schema.Types.ObjectId, ref: 'Test' },
  parent_id: { type: Schema.Types.ObjectId, ref: 'Comment' },
  content: String,
  create_at: { type: Date, default: Date.now },
});

export const Comment = mongoose.model<IComment>('Comment', CommentSchema);
