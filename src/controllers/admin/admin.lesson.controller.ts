import { Request, Response, NextFunction } from "express";
import { LessonManager } from "../../models/lesson_manager.model";
import { Types } from "mongoose";
import { ApiResponse } from "../../utils/ApiResponse";
import { TestStatus } from "../../models/enums/TestStatus";
import { pushNotification } from "../../utils/pushNotification";
import { onlineUsers } from "../../socket";

const isAdminPayload = (payload: any) => {
  if (!payload) return false;
  return payload.roleName === "admin" || payload.role === "admin";
};

export const listLessonsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const search = req.query.search ? String(req.query.search).trim() : "";
    const status = req.query.status ? String(req.query.status) : "";
    const part = req.query.part ? String(req.query.part) : "";
    const level = req.query.level ? String(req.query.level) : "";

    const skip = (page - 1) * limit;

    const filter: any = {};
    if (search) filter.title = { $regex: new RegExp(search, "i") };
    if (status) filter.status = status;
    if (part) filter.part_type = part;
    if (level) filter.level = level;

    const [items, total] = await Promise.all([
      LessonManager.find(filter)
        .select(
          "title part_type level status created_at created_by thumbnail description"
        )
        .skip(skip)
        .limit(limit)
        .sort({ created_at: -1 })
        .lean(),
      LessonManager.countDocuments(filter),
    ]);

    const pageCount = Math.ceil(total / limit);

    return res
      .status(200)
      .json({ data: { items, total, page, limit, pageCount } });
  } catch (err) {
    next(err);
  }
};

export const getLessonDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const lesson = await LessonManager.findById(id)
      .populate({ path: "lesson_ids" })
      .populate({ path: "topic_vocabulary_ids" })
      .populate({ path: "dictation_ids" })
      .populate({ path: "shadowing_ids" })
      .populate({ path: "quiz_ids" })
      .lean();

    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    return res.status(200).json({ data: lesson });
  } catch (err) {
    next(err);
  }
};

export const approveLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user._id;
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const updated = await LessonManager.findByIdAndUpdate(
      id,
      { status: TestStatus.APPROVED },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: "Lesson not found" });

    console.log("??????????", updated.created_by, onlineUsers);
    await pushNotification({
      senderId: userId,
      recipientId: updated.created_by.toString(),
      message: `✅ Bài học "${updated.title}" của bạn đã được duyệt thành công.`,
      type: "lesson",
    })
    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const rejectLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user._id;
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const reason = req.body?.reason || "";
    const updated = await LessonManager.findByIdAndUpdate(
      id,
      { status: TestStatus.REJECTED },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: "Lesson not found" });

    await pushNotification({
      senderId: userId,
      recipientId: updated.created_by.toString(),
      message: `❌ Bài học "${updated.title}" của bạn đã bị từ chối.`,
      description: reason,
      type: "lesson",
    })

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const softDeleteLessonController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const updated = await LessonManager.findByIdAndUpdate(
      id,
      { status: TestStatus.CLOSED },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ message: "Lesson not found" });

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export default {};
