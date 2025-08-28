import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/verifyAccessToken.middleware";
import * as userService from "../services/user.service";
import { ProfileDto } from "../dto/profile.dto";

export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // payload gán từ verifyAccessToken
    const payload: any = req.user;
    const userId = payload?._id;
    console.log("Payload from token:", userId);

    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Gói dữ liệu trong "data" để FE dùng res.data
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
};


// Controller cập nhật profile
export const updateProfileController = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    const userId = payload?._id;
    const { fullname, email, avatar } = req.body;

    // update nested profile
    const updatedUser = await userService.updateUserProfile(userId, {
      email, // root
      "profile.fullname": fullname, // nested
      "profile.avatar": avatar,     // nested
    } as any);

    res.json({ data: updatedUser });
  } catch (err) {
    next(err);
  }
};

interface UsernameParams {
  username: string;
}
export const getUserByUsernameController = async (
  req: Request<UsernameParams>, // dùng generic để khai báo params
  res: Response,
  next: NextFunction
) => {
  try {
    const { username } = req.params;

    const ProfileDto = await userService.getProfileUserByUsername(username);
    if (!ProfileDto) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ data: ProfileDto });
  } catch (err) {
    next(err);
  }
};
