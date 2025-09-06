import mongoose, { Schema, Document, Types } from "mongoose";
import { IPartAccuracy } from "./user_test.model";

// 1. Tạo interface cho User, kế thừa Document để mongoose biết đây là 1 document
export interface IUser extends Document {
  _id: Types.ObjectId;
  role_id: Types.ObjectId;
  username: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  profile: {
    fullname: string;
    avatar: string;
  };
  badges?: Types.ObjectId[];
  topics?: Types.ObjectId[];
  master_parts: IPartAccuracy[];
  created_at: Date;
  updated_at: Date;
  banned_at?: Date;
  banned_by?: Types.ObjectId;
}

// 2. Định nghĩa Schema cho User
const UserSchema = new Schema<IUser>({
  _id: { type: Schema.Types.ObjectId, auto: true },
  role_id: { type: Schema.Types.ObjectId, ref: "Role" },
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  profile: {
    fullname: String,
    avatar: String,
  },
  badges: [{ type: Schema.Types.ObjectId, ref: "Badge" }],
  topics: [{ type: Schema.Types.ObjectId, ref: "Topic" }],
  master_parts: [{
    part_name: { type: String, default: '' },
    accuracy: { type: Number, default: 0 }
  }],
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
  banned_at: Date,
  banned_by: { type: Schema.Types.ObjectId, ref: "User" },
});

// 3. Tạo Model từ Schema
export const User = mongoose.model<IUser>("User", UserSchema);
