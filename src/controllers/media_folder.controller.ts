import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import * as folderService from "../services/media_folder.service";
import { ApiResponse } from "../utils/ApiResponse";

/* =====================================
   🟢 CREATE FOLDER
===================================== */
export const createFolderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload = req.body;
    const created_by = (req as any).user?._id || null;

    const folder = await folderService.createFolder({
      ...payload,
      created_by,
    });

    res.status(201).json(ApiResponse.success(folder, "Tạo thư mục thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🟠 GET FOLDER BY ID
===================================== */
export const getFolderByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json(ApiResponse.fail("ID không hợp lệ."));

    const folder = await folderService.getFolderById(id);
    if (!folder)
      return res.status(404).json(ApiResponse.fail("Không tìm thấy thư mục."));

    res.status(200).json(ApiResponse.success(folder, "Lấy thư mục thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🟣 GET FULL TREE
===================================== */
export const getFolderTreeController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const tree = await folderService.getFolderTree();
    res.status(200).json(ApiResponse.success(tree, "Lấy cây thư mục thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🔵 UPDATE FOLDER
===================================== */
export const updateFolderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json(ApiResponse.fail("ID không hợp lệ."));

    const updated = await folderService.updateFolder(id, req.body);
    if (!updated)
      return res.status(404).json(ApiResponse.fail("Không tìm thấy thư mục."));

    res.status(200).json(ApiResponse.success(updated, "Cập nhật thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🔴 DELETE FOLDER
===================================== */
export const deleteFolderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json(ApiResponse.fail("ID không hợp lệ."));

    const deleted = await folderService.deleteFolder(id);
    if (!deleted)
      return res.status(404).json(ApiResponse.fail("Không tìm thấy thư mục."));

    res.status(200).json(ApiResponse.success(null, "Xóa thư mục thành công!"));
  } catch (error) {
    next(error);
  }
};
/* =====================================
   🟤 ADD MEDIA TO FOLDER
===================================== */
export const addMediaToFolderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params; // id của folder
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json(ApiResponse.fail("ID thư mục không hợp lệ."));

    const payload = req.body;
    const media = await folderService.addMediaToFolder(id, payload);

    res
      .status(201)
      .json(ApiResponse.success(media, "Thêm media vào thư mục thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🧾 GET MEDIAS BY FOLDER
===================================== */
export const getMediasByFolderController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id))
      return res.status(400).json(ApiResponse.fail("ID thư mục không hợp lệ."));

    const medias = await folderService.getMediasByFolder(id);

    res
      .status(200)
      .json(ApiResponse.success(medias, "Lấy danh sách media thành công!"));
  } catch (error) {
    next(error);
  }
};
/* =====================================
   ✏️ UPDATE MEDIA
===================================== */
export const updateMediaController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // id của media
    const updated = await folderService.updateMedia(id, req.body);
    res.status(200).json(ApiResponse.success(updated, "Cập nhật media thành công!"));
  } catch (error) {
    next(error);
  }
};

/* =====================================
   🗑️ DELETE MEDIA
===================================== */
export const deleteMediaController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await folderService.deleteMedia(id);
    res.status(200).json(ApiResponse.success(null, "Xóa media thành công!"));
  } catch (error) {
    next(error);
  }
};
