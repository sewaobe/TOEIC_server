import { Types, FilterQuery } from "mongoose";
import { Group, IGroup } from "../models";
import { createMedia, deleteMedia, updateMedia } from "./media.service";
import {
  createQuestion,
  deleteQuestion,
  updateQuestion,
} from "./question.service";

/**
 * CREATE - thêm Group mới
 */
export const createGroup = async (data: Partial<IGroup>): Promise<IGroup> => {
  const group = new Group({
    ...data,
    created_at: new Date(),
    updated_at: new Date(),
  });
  return await group.save();
};

/**
 * READ - lấy Group theo ID
 */
export const getGroupById = async (
  id: string | Types.ObjectId
): Promise<IGroup | null> => {
  const group = await Group.findById(id)
    .populate("audioUrl")
    .populate("imagesUrl")
    .populate("questions")
    .lean() // ✅ convert to plain JS object
    .exec();

  if (!group) return null;

  // ✅ Convert choices từ Map sang Object nếu cần
  if (group.questions && Array.isArray(group.questions)) {
    (group as any).questions = (group.questions as any[]).map((q: any) => ({
      ...q,
      choices:
        q.choices instanceof Map ? Object.fromEntries(q.choices) : q.choices,
    }));
  }

  return group as IGroup;
};

/**
 * READ ALL - lấy danh sách Group (có filter tùy chọn)
 */
export const getAllGroups = async (
  filter: FilterQuery<IGroup> = {}
): Promise<IGroup[]> => {
  return await Group.find(filter)
    .populate("audioUrl")
    .populate("imagesUrl")
    .populate("questions")
    .sort({ created_at: -1 })
    .exec();
};

/**
 * UPDATE - cập nhật Group theo ID
 */
export const updateGroup = async (
  id: string | Types.ObjectId,
  data: Partial<IGroup>
): Promise<IGroup | null> => {
  return await Group.findByIdAndUpdate(
    id,
    { ...data, updated_at: new Date() },
    { new: true }
  )
    .populate("audioUrl")
    .populate("imagesUrl")
    .populate("questions")
    .exec();
};

/**
 * DELETE - xóa Group theo ID
 */
export const deleteGroup = async (
  id: string | Types.ObjectId
): Promise<IGroup | null> => {
  return await Group.findByIdAndDelete(id).exec();
};
/**
 * Tạo Group mới kèm Media + Questions mới
 */
export const createGroupWithNewRelations = async (
  data: Partial<IGroup> & {
    audioUrl?: { url: string; type?: string };
    imagesUrl?: { url: string; type?: string }[];
    questions?: any[];
    topic?: string;
    created_by?: Types.ObjectId | string | null;
    test_id: Types.ObjectId;
  }
): Promise<IGroup> => {
  // 1. Audio mới
  let audioMediaId: Types.ObjectId | undefined;
  if (data.audioUrl?.url) {
    const audio = await createMedia({
      url: data.audioUrl.url,
      type: data.audioUrl.type || "AUDIO",
      transcript: "",
      topic: data.topic || "",
    });
    audioMediaId = audio._id as Types.ObjectId;
  }

  // 2. Images mới
  const imageMediaIds: Types.ObjectId[] = [];
  for (const img of data.imagesUrl ?? []) {
    const image = await createMedia({
      url: img.url,
      type: img.type || "IMAGE",
      transcript: "",
      topic: data.topic || "",
    });
    imageMediaIds.push(image._id as Types.ObjectId);
  }

  // 3. Questions mới
  const questionIds: Types.ObjectId[] = [];
  for (let i = 0; i < (data.questions?.length ?? 0); i++) {
    const q = data.questions![i];
    const question = await createQuestion({
      ...q,
      name: q.name || `Question ${i + 1}`,
      created_by: data.created_by ? new Types.ObjectId(data.created_by) : null,
    });
    questionIds.push(question._id as Types.ObjectId);
  }

  // 4. Tạo Group thông qua CRUD cơ bản
  const group = await createGroup({
    test_id: data.test_id,
    part: data.part,
    // type: data.type || "TEST",
    audioUrl: audioMediaId,
    imagesUrl: imageMediaIds,
    transcriptEnglish: data.transcriptEnglish || "",
    transcriptTranslation: data.transcriptTranslation || "",
    questions: questionIds,
  });

  return group;
};

/**
 * DELETE kèm quan hệ - Xóa group và toàn bộ question, media liên quan
 */
export const deleteGroupWithRelations = async (
  id: string | Types.ObjectId
): Promise<IGroup | null> => {
  const group = await Group.findById(id).lean();
  if (!group) return null;

  // Xoá questions
  if (group.questions && group.questions.length > 0) {
    for (const qId of group.questions) {
      await deleteQuestion(new Types.ObjectId(qId));
    }
  }

  // Xoá audio
  if (group.audioUrl) {
    await deleteMedia(new Types.ObjectId(group.audioUrl));
  }

  // Xoá images
  if (group.imagesUrl && group.imagesUrl.length > 0) {
    for (const imgId of group.imagesUrl) {
      await deleteMedia(new Types.ObjectId(imgId));
    }
  }

  // Xoá group
  return await Group.findByIdAndDelete(id).exec();
};

/**
 * UPDATE kèm quan hệ - đồng bộ group với data từ FE
 */
export const updateGroupWithRelations = async (
  id: string | Types.ObjectId,
  data: Partial<IGroup> & {
    audioUrl?: { _id?: string; url: string; type?: string };
    imagesUrl?: { _id?: string; url: string; type?: string }[];
    questions?: any[];
    created_by?: Types.ObjectId | string | null;
  },
  created_by?: Types.ObjectId | string | null
): Promise<IGroup | null> => {
  const group = await Group.findById(id).lean();
  if (!group) return null;

  // 1. Audio
  let audioMediaId: Types.ObjectId | undefined;
  if (data.audioUrl) {
    if (data.audioUrl._id) {
      // update audio
      await updateMedia(new Types.ObjectId(data.audioUrl._id), {
        url: data.audioUrl.url,
        type: data.audioUrl.type || "AUDIO",
        updated_at: new Date(),
      });
      audioMediaId = new Types.ObjectId(data.audioUrl._id);
    } else if (data.audioUrl.url) {
      // create audio mới
      const audio = await createMedia({
        url: data.audioUrl.url,
        type: data.audioUrl.type || "AUDIO",
        transcript: "",
      });
      audioMediaId = audio._id as Types.ObjectId;
    }
  }

  // 2. Images
  const newImageIds: Types.ObjectId[] = [];
  const existingImages = group.imagesUrl?.map((id) => id.toString()) || [];

  for (const img of data.imagesUrl ?? []) {
    if (img._id) {
      // update
      await updateMedia(new Types.ObjectId(img._id), {
        url: img.url,
        type: img.type || "IMAGE",
        updated_at: new Date(),
      });
      newImageIds.push(new Types.ObjectId(img._id));
    } else {
      // create
      const image = await createMedia({
        url: img.url,
        type: img.type || "IMAGE",
        transcript: "",
      });
      newImageIds.push(image._id as Types.ObjectId);
    }
  }

  // delete những image không còn
  for (const oldId of existingImages) {
    const stillExists = newImageIds.find((id) => id.toString() === oldId);
    if (!stillExists) {
      await deleteMedia(new Types.ObjectId(oldId));
    }
  }

  // 3. Questions
  const newQuestionIds: Types.ObjectId[] = [];
  const existingQuestions = group.questions?.map((id) => id.toString()) || [];

  for (let i = 0; i < (data.questions?.length ?? 0); i++) {
    const q = data.questions![i];
    if (q._id) {
      // update question
      await updateQuestion(new Types.ObjectId(q._id), {
        ...q,
        updated_at: new Date(),
      });
      newQuestionIds.push(new Types.ObjectId(q._id));
    } else {
      // create new question
      const question = await createQuestion({
        ...q,
        name: q.name || `Question ${i + 1}`,
        created_by: created_by ? new Types.ObjectId(created_by) : null,
      });
      newQuestionIds.push(question._id as Types.ObjectId);
    }
  }

  // delete những question không còn
  for (const oldId of existingQuestions) {
    const stillExists = newQuestionIds.find((id) => id.toString() === oldId);
    if (!stillExists) {
      await deleteQuestion(new Types.ObjectId(oldId));
    }
  }

  // 4. Update group itself
  return await Group.findByIdAndUpdate(
    id,
    {
      part: data.part,
      // type: data.type || "TEST",
      audioUrl: audioMediaId,
      imagesUrl: newImageIds,
      transcriptEnglish: data.transcriptEnglish || "",
      transcriptTranslation: data.transcriptTranslation || "",
      questions: newQuestionIds,
      updated_at: new Date(),
    },
    { new: true }
  )
    .populate("audioUrl")
    .populate("imagesUrl")
    .populate("questions")
    .exec();
};
