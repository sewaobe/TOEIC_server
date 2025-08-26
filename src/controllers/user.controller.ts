import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/verifyAccessToken.middleware";
import { getUserById } from "../services/user.service";

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

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Gói dữ liệu trong "data" để FE dùng res.data
    res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
};
