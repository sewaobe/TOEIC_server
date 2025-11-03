import mongoose, { Schema, Document, Types } from "mongoose";
import { IPartAccuracy } from "./user_test.model";

// 1. Tạo interface cho User, kế thừa Document để mongoose biết đây là 1 document
export interface IUser extends Document {
  _id: Types.ObjectId;
  role_id: Types.ObjectId;
  firebaseUid?: string;
  username: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  profile: {
    fullname: string;
    avatar: string;
  };
  badges?: Types.ObjectId[];
  topic_vocabularies?: Types.ObjectId[];
  // trạng thái người dùng: 'active' | 'banned' | 'banned_permanent'
  status?: "active" | "banned" | "banned_permanent";
  // lý do bị ban
  banned_reason?: string | null;
  master_parts: IPartAccuracy[];
  created_at: Date;
  updated_at: Date;
  banned_at?: Date;
  banned_by?: Types.ObjectId;

  // 🕓 Thêm mới: lưu thời điểm hoạt động gần nhất
  last_active?: Date;
}

// 2. Định nghĩa Schema cho User
const UserSchema = new Schema<IUser>({
  _id: { type: Schema.Types.ObjectId, auto: true },
  role_id: { type: Schema.Types.ObjectId, ref: "Role" },
  firebaseUid: { type: String, unique: true }, // định danh gốc
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String },
  isActive: { type: Boolean, default: false },
  profile: {
    fullname: String,
    avatar: String,
  },
  badges: [{ type: Schema.Types.ObjectId, ref: "Badge" }],
  master_parts: [
    {
      part_name: { type: String, default: "" },
      accuracy: { type: Number, default: 0 },
    },
  ],
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
  banned_at: Date,
  banned_by: { type: Schema.Types.ObjectId, ref: "User" },
  // Lý do bị ban (để FE hiển thị)
  banned_reason: { type: String, default: null },
  // Trạng thái hiện tại (active | banned | banned_permanent)
  status: {
    type: String,
    enum: ["active", "banned", "banned_permanent"],
    default: "active",
  },

  // 🕓 Thêm mới: thời điểm hoạt động gần nhất
  last_active: { type: Date, default: null },
});

// 3. Tạo Model từ Schema
export const User = mongoose.model<IUser>("User", UserSchema);
