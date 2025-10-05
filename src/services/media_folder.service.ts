import { Types } from "mongoose";
import { MediaFolder, IMediaFolder } from "../models";
import { Media, IMedia } from "../models";

/**
 * 🟢 Tạo folder mới
 */
export const createFolder = async (
  data: Partial<IMediaFolder>
): Promise<IMediaFolder> => {
  const folder = new MediaFolder({
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  const saved = await folder.save();

  // Nếu có parent → thêm ID này vào children của parent
  if (data.parent) {
    await MediaFolder.findByIdAndUpdate(data.parent, {
      $push: { children: saved._id },
    });
  }

  return saved;
};

/**
 * 🟠 Lấy folder theo ID
 */
export const getFolderById = async (
  id: string | Types.ObjectId
): Promise<IMediaFolder | null> => {
  return await MediaFolder.findById(id)
    .populate("children")
    .populate("medias")
    .exec();
};

/**
 * 🟣 Lấy tất cả folder dạng cây (tree)
 */
export const getFolderTree = async (): Promise<IMediaFolder[]> => {
  return await MediaFolder.find({ parent: null })
    .populate({
      path: "children",
      populate: {
        path: "children",
        populate: { path: "children" },
      },
    })
    .exec();
};

/**
 * 🔵 Cập nhật folder
 */
export const updateFolder = async (
  id: string | Types.ObjectId,
  data: Partial<IMediaFolder>
): Promise<IMediaFolder | null> => {
  return await MediaFolder.findByIdAndUpdate(
    id,
    { ...data, updated_at: new Date() },
    { new: true }
  ).exec();
};

/**
 * 🔴 Xóa folder (và toàn bộ con của nó)
 */
export const deleteFolder = async (
  id: string | Types.ObjectId
): Promise<boolean> => {
  const folder = await MediaFolder.findById(id);
  if (!folder) return false;

  // Xóa đệ quy tất cả con
  for (const childId of folder.children) {
    await deleteFolder(childId);
  }

  await MediaFolder.findByIdAndDelete(id);

  // Xóa khỏi children của parent (nếu có)
  if (folder.parent) {
    await MediaFolder.findByIdAndUpdate(folder.parent, {
      $pull: { children: folder._id },
    });
  }

  return true;
};

/* =========================================================
   🟤 THÊM MEDIA VÀO FOLDER
   ========================================================= */

/**
 * 📦 Tạo media mới và thêm vào folder
 */
export const addMediaToFolder = async (
  folderId: string | Types.ObjectId,
  data: {
    topic: string;
    url: string;
    type: string;
    duration?: number;
    transcript?: string;
  }
): Promise<IMedia> => {
  const folder = await MediaFolder.findById(folderId);
  if (!folder) throw new Error("Folder not found");

  // 1️⃣ Tạo mới Media
  const media = new Media({
    topic: data.topic,
    url: data.url,
    type: data.type,
    duration: data.duration || 0,
    transcript: data.transcript || "",
    created_at: new Date(),
    updated_at: new Date(),
  });
  const saved = await media.save();

  // 2️⃣ Thêm ID Media vào danh sách medias của Folder
  await MediaFolder.findByIdAndUpdate(folderId, {
    $push: { medias: saved._id },
    $set: { updated_at: new Date() },
  });

  return saved;
};

/**
 * 🧾 Lấy danh sách media trong folder
 */
export const getMediasByFolder = async (
  folderId: string | Types.ObjectId
): Promise<IMedia[]> => {
  const folder = await MediaFolder.findById(folderId).populate("medias").exec();
  if (!folder) throw new Error("Folder not found");
  return folder.medias as unknown as IMedia[];
};

/* =====================================
   ✏️ UPDATE MEDIA
===================================== */
export const updateMedia = async (id: string, data: any) => {
  const media = await Media.findByIdAndUpdate(id, data, { new: true });
  return media;
};

/* =====================================
   🗑️ DELETE MEDIA (xóa khỏi cả folder)
===================================== */
export const deleteMedia = async (id: string) => {
  // 🔹 B1: Tìm media để biết nó nằm trong folder nào
  const media = await Media.findById(id);
  if (!media) throw new Error("Không tìm thấy media!");

  // 🔹 B2: Xóa ID media khỏi danh sách media của folder
  await MediaFolder.updateMany(
    { medias: new Types.ObjectId(id) },
    { $pull: { medias: new Types.ObjectId(id) } }
  );

  // 🔹 B3: Xóa bản thân media
  await Media.findByIdAndDelete(id);

  return true;
};