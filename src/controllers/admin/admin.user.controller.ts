import { Request, Response, NextFunction } from "express";
import * as userService from "../../services/user.service";

const isAdminPayload = (payload: any) => {
  if (!payload) return false;
  return payload.roleName === "admin" || payload.role === "admin";
};

export const listUsersController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload)) {
      return res.status(403).json({ message: "Forbidden: admin only" });
    }

    const { q, role, status } = req.query;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;

    const result = await userService.listUsers({
      q: q as string,
      role: role as string,
      status: status as string,
      page,
      limit,
    });

    return res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
};

export const getUserDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload)) {
      return res.status(403).json({ message: "Forbidden: admin only" });
    }

    const { id } = req.params;
    const user = await userService.getUserDetailById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ data: user });
  } catch (err) {
    next(err);
  }
};

export const banUserController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload)) {
      return res.status(403).json({ message: "Forbidden: admin only" });
    }

    const { id } = req.params;
    const adminId = payload?._id;
    const { type, reason, durationDays } = req.body as any;

    if (!type || !["temp", "perm"].includes(type)) {
      return res.status(400).json({ message: "Invalid ban type" });
    }

    const updated = await userService.banUser(id, adminId, {
      type,
      reason: reason || "",
      durationDays,
    });

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const unbanUserController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload)) {
      return res.status(403).json({ message: "Forbidden: admin only" });
    }

    const { id } = req.params;
    const adminId = payload?._id;

    const updated = await userService.unbanUser(id, adminId);

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export default {};
