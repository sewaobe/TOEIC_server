import { User } from "../models/user.model";

export const getUserById = async (id: string) => {
  const user = await User.findById(id).select("-passwordHash"); 
  return user;
};
