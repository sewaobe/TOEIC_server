import { Schema, model, Document, Types } from "mongoose";

export interface INotification extends Document {
  senderId?: Types.ObjectId;
  recipientId: Types.ObjectId;
  message: string;
  description?: string;
  type: "system" | "comment" | "error" | "chat" | "test" | "lesson";
  isRead: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User' },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true },
    description: { type: String},
    type: {
      type: String,
      enum: ["system", "comment", "error", "chat", "test", "lesson"],
      default: "system",
    },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Notification = model<INotification>(
  "Notification",
  notificationSchema
);
