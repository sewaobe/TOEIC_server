import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMessage extends Document {
  sender_id: Types.ObjectId;
  content: string;
  create_at: Date;
}

const MessageSchema = new Schema<IMessage>({
  sender_id: { type: Schema.Types.ObjectId, ref: 'User' },
  content: String,
  create_at: { type: Date, default: Date.now },
});

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
