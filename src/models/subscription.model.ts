import mongoose, { Schema, Document } from "mongoose";

export interface ISubscription extends Document {
  userId: string; // Ai đang đăng ký nhận thông báo
  endpoint: string; // URL endpoint do trình duyệt cấp
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string; // Tuỳ chọn - nhận diện thiết bị
  createdAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: String, required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<ISubscription>(
  "Subscription",
  subscriptionSchema
);
