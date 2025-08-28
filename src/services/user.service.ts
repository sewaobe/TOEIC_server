import { User } from "../models/user.model";

export const getUserById = async (id: string) => {
  const user = await User.findById(id).select("-passwordHash"); 
  return user;
};

// Cập nhật profile user
export const updateUserProfile = async (
  userId: string,
  updateData: any
) => {
  return User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select("email profile.fullname profile.avatar");
};

export const getUserByUsername = async (username: string) => {
  return await User.findOne({ username }).select("-passwordHash");
};