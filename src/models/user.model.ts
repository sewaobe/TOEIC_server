import mongoose, { Schema, Document, Types } from 'mongoose';

// 1. Tạo interface cho User, kế thừa Document để mongoose biết đây là 1 document
export interface IUser extends Document {
  role_id: Types.ObjectId;
  progress_id: Types.ObjectId[];
  username: string;
  email: string;
  isActive: boolean;
  profile: {
    fullName: string;
    avatar: string;
  };
  created_at: Date;
  updated_at: Date;
  banned_at?: Date;
  banned_by?: Types.ObjectId;
}

// 2. Định nghĩa Schema cho User
const UserSchema = new Schema<IUser>({
  role_id: { type: Schema.Types.ObjectId, ref: 'Role' },
  progress_id: [{ type: Schema.Types.ObjectId, ref: 'UserProgress' }],
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: false },
  profile: {
    fullName: String,
    avatar: String,
  },
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
  banned_at: Date,
  banned_by: { type: Schema.Types.ObjectId, ref: 'User' },
});

// 3. Tạo Model từ Schema
export const User = mongoose.model<IUser>('User', UserSchema);
