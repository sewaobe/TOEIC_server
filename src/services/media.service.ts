import { Types } from "mongoose";
import { Media, IMedia } from "../models";

/**
 * CREATE - thêm media mới
 */
export const createMedia = async (
  data: Partial<IMedia>
): Promise<IMedia> => {
  const media = new Media({
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return await media.save();
};

/**
 * READ - lấy media theo ID
 */
export const getMediaById = async (
  id: string | Types.ObjectId
): Promise<IMedia | null> => {
  return await Media.findById(id).exec();
};

/**
 * READ ALL - lấy danh sách media
 */
export const getAllMedia = async (): Promise<IMedia[]> => {
  return await Media.find().sort({ created_at: -1 }).exec();
};

/**
 * UPDATE - cập nhật media theo ID
 */
export const updateMedia = async (
  id: string | Types.ObjectId,
  data: Partial<IMedia>
): Promise<IMedia | null> => {
  return await Media.findByIdAndUpdate(
    id,
    { ...data, updated_at: new Date() },
    { new: true }
  ).exec();
};

/**
 * DELETE - xóa media theo ID
 */
export const deleteMedia = async (
  id: string | Types.ObjectId
): Promise<IMedia | null> => {
  return await Media.findByIdAndDelete(id).exec();
};
