import { Request, Response, NextFunction } from "express";
import * as testService from "../../services/test.service";
import { TestStatus } from "../../models/enums/TestStatus";
import { pushNotification } from "../../utils/pushNotification";

const isAdminPayload = (payload: any) => {
  if (!payload) return false;
  return payload.roleName === "admin" || payload.role === "admin";
};

export const listTestsController = async (
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
    const search = req.query.search ? String(req.query.search) : "";
    const status = req.query.status ? String(req.query.status) : "";
    const topic = req.query.topic ? String(req.query.topic) : "";
    const type = req.query.type ? String(req.query.type) : "";

    const { items, total, pageCount } = await testService.getAllTests(
      page,
      limit,
      search,
      status,
      topic,
      type
    );

    return res.status(200).json({ data: { items, total, pageCount } });
  } catch (err) {
    next(err);
  }
};

export const getTestDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload: any = req.user;
    if (!isAdminPayload(payload))
      return res.status(403).json({ message: "Forbidden: admin only" });

    const { id } = req.params;
    const test = await testService.getFullTest(id);
    if (!test) return res.status(404).json({ message: "Test not found" });

    return res.status(200).json({ data: test });
  } catch (err) {
    next(err);
  }
};

export const approveTestController = async (
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
    // Chỉ cập nhật status, không làm mất dữ liệu
    const updated = await testService.updateStatusTest(id, TestStatus.APPROVED, userId);
    if (!updated) return res.status(404).json({ message: "Test not found" });

    // Lấy thông tin created_by để gửi thông báo
    const fullTest = await testService.getFullTest(id);
    if (fullTest?.created_by) {
      pushNotification({
        senderId: userId,
        recipientId: fullTest.created_by.toString(),
        message: `📝 Bài thi "${updated.title}" đã được phê duyệt.`,
        type: "test"
      });
    }
    
    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const rejectTestController = async (
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
    // Chỉ cập nhật status, không làm mất dữ liệu
    const updated = await testService.updateStatusTest(id, TestStatus.REJECTED, userId);
    if (!updated) return res.status(404).json({ message: "Test not found" });

    // Lấy thông tin created_by để gửi thông báo
    const fullTest = await testService.getFullTest(id);
    if (fullTest?.created_by) {
      pushNotification({
        senderId: userId,
        recipientId: fullTest.created_by.toString(),
        message: `📝 Bài thi "${updated.title}" đã bị từ chối.`,
        description: req.body?.reason,
        type: "test"
      });
    }
    
    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export const softDeleteTestController = async (
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
    // Soft delete: chỉ set status to CLOSED, không xóa dữ liệu
    const updated = await testService.updateStatusTest(id, TestStatus.CLOSED, userId);
    if (!updated) return res.status(404).json({ message: "Test not found" });

    return res.status(200).json({ data: updated });
  } catch (err) {
    next(err);
  }
};

export default {};
