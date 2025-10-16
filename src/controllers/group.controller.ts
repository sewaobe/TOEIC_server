import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import * as groupService from "../services/group.service";
import * as questionService from "../services/question.service";
import { ApiResponse } from "../utils/ApiResponse";
import { IGroup } from "../models/group.model";

/* =====================================
   🧩 1. CREATE GROUP
===================================== */
export const createGroupController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const payload: Partial<IGroup> = req.body;
    const newGroup = await groupService.createGroupWithNewRelations(payload as any);

    if (!newGroup) {
      res
        .status(400)
        .json(ApiResponse.fail("Không thể tạo group! Dữ liệu không hợp lệ."));
      return;
    }

    res.status(201).json(ApiResponse.success(newGroup, "Tạo group thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🧩 2. GET GROUP BY ID
===================================== */
export const getGroupByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json(ApiResponse.fail("ID group không hợp lệ."));
      return;
    }

    const group = await groupService.getGroupById(id);
    if (!group) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy group."));
      return;
    }

    res.status(200).json(ApiResponse.success(group, "Lấy thông tin group thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🧩 3. UPDATE GROUP
===================================== */
export const updateGroupController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = req.body;
    const created_by = (req as any).user?._id || null;

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json(ApiResponse.fail("ID group không hợp lệ."));
      return;
    }

    const updated = await groupService.updateGroupWithRelations(id, data, created_by);
    if (!updated) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy group để cập nhật."));
      return;
    }

    res.status(200).json(ApiResponse.success(updated, "Cập nhật group thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🧩 4. DELETE GROUP
===================================== */
export const deleteGroupController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const groupId = req.params.groupId;

    if (!groupId || !Types.ObjectId.isValid(groupId)) {
      res.status(400).json(ApiResponse.fail("ID group không hợp lệ."));
      return;
    }

    const deleted = await groupService.deleteGroupWithRelations(groupId);
    if (!deleted) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy group để xóa."));
      return;
    }

    res.status(200).json(ApiResponse.success<null>(null, "Xóa group thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🧩 5. GET QUESTIONS WITH GROUP INFO
===================================== */
export const getQuestionsWithGroupInfoController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = "", part, tag } = req.query as any;

    // 🧠 Validate query input
    const pageNum = Number(page);
    const limitNum = Number(limit);
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum <= 0 || limitNum <= 0) {
      res.status(400).json(ApiResponse.fail("Tham số phân trang không hợp lệ."));
      return;
    }

    const result = await questionService.getQuestionsWithGroupInfo({
      page: pageNum,
      limit: limitNum,
      search,
      part: part ? Number(part) : undefined,
      tag,
    });

    // ⚠️ Nếu không có câu hỏi nào
    if (!result || result.items.length === 0) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy câu hỏi nào phù hợp."));
      return;
    }

    res.status(200).json(
      ApiResponse.success(result, "Lấy danh sách câu hỏi (có group info) thành công!")
    );
  } catch (error) {
    next(error);
  }
};
