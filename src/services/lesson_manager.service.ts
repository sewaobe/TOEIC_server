import { ILessonManager, LessonManager } from "../models/lesson_manager.model";
import { PaginationResult } from '../dto/PaginationResult';
import mongoose from "mongoose";

export const getAllTopicTitlesService = async () => {
    const topics = await LessonManager.find({}, "title").exec();
    return topics.map(topic => ({ id: topic._id, title: topic.title }));
}

export const getAllLessonManagerService = async (page: number, limit: number, userId: string): Promise<PaginationResult<ILessonManager>> => {
    // Đảm bảo page và limit hợp lệ
    const currentPage = Math.max(1, page);
    const pageSize = Math.max(1, limit);
    const skip = (currentPage - 1) * pageSize;

    // Truy vấn danh sách LessonManager
    const [items, total] = await Promise.all([
        LessonManager.find({ created_by: userId })
            .skip(skip)
            .limit(pageSize)
            .sort({ createdAt: -1 })
            .select("-lesson_ids -dictation_ids -shadowing_ids -quiz_ids -topic_vocabulary_ids")
            .exec(),
        LessonManager.countDocuments({ created_by: userId }).exec(),
    ]);

    return {
        data: items,
        pagination: {
            page: currentPage,
            limit: pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
            hasNext: skip + items.length < total,
            hasPrev: currentPage > 1,
        },
    };
}

export const getLessonManagerByIdService = async (lessonManagerId: string, userId: string) => {
    const lessonManager = await LessonManager.findOne({
        _id: lessonManagerId,
        created_by: userId
    })
        .populate({
            path: "topic_vocabulary_ids",
            select: "title level topic description bgColor gradient iconName vocabularies_id",
            populate: { path: "vocabularies_id", select: "word definition" }
        })
        .populate({
            path: "lesson_ids",
            select: "title part_type topic summary planned_completion_time sections_id",
            populate: { path: "sections_id", select: "-created_at -updated_at -__v -lesson_id" }
        })
        .populate({ path: "dictation_ids", select: "-created_at -updated_at -__v" })
        .populate({ path: "shadowing_ids", select: "-created_at -updated_at -__v" })
        .populate({
            path: "quiz_ids",
            select: "title part_type level planned_completion_time group_ids",
            populate: {
                path: "group_ids",
                select: "part questions",
                populate: {
                    path: "questions",
                    select: "name textQuestion choices correctAnswer"
                }
            }
        })

    return lessonManager;
}

export const createLessonManagerService = async (payload: Partial<ILessonManager>, userId: string) => {
    const data = new LessonManager({ ...payload, created_by: userId });
    const lessonManager = await data.save();
    return lessonManager;
}


export const updateLessonManagerService = async (
    payload: Partial<ILessonManager>,
    lessonManagerId: string,
    userId: string
) => {
    const updated = await LessonManager.findOneAndUpdate(
        { _id: lessonManagerId, created_by: userId },
        payload,
        { new: true, runValidators: true }
    );

    if (!updated) {
        throw new Error("Không tìm thấy Lesson Manager hoặc bạn không có quyền cập nhật");
    }

    return updated;
};


export const deleteLessonManagerService = async (lessonManagerId: string, userId: string) => {
    console.log(lessonManagerId, userId);
    const lessonManager = await LessonManager.findOneAndDelete({
        _id: lessonManagerId,
        created_by: new mongoose.Types.ObjectId(userId),
        status: "draft",
    });

    if (!lessonManager) {
        throw new Error("Không thể xóa Lesson Manager (không tồn tại hoặc không ở trạng thái draft)");
    }

    return lessonManager;
};

