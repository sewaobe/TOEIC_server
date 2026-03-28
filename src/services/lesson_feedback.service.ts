import { Types } from "mongoose";
import { LearningPath, ILessonFeedback } from "../models/learning_path.model";
import { DayStudy } from "../models/day_study.model";

/**
 * Interface cho dữ liệu tạo feedback
 */
export interface CreateFeedbackDTO {
    userId: string | Types.ObjectId;
    dayStudyId: string;
    rating: number;
    reasons?: string[];
    comment?: string;
}

/**
 * Interface cho dữ liệu query feedback
 */
export interface FeedbackQueryOptions {
    learningPathId: string;
    rating?: number;
    isPositive?: boolean;
    page?: number;
    limit?: number;
}

/**
 * Tìm LearningPath từ DayStudy thông qua week_study_ids
 */
async function findLearningPathByDayStudy(
    dayStudyId: string,
    userId: string | Types.ObjectId
): Promise<typeof LearningPath.prototype | null> {
    const dayStudy = await DayStudy.findById(dayStudyId);
    if (!dayStudy) return null;

    // Tìm LearningPath có chứa week_id trong week_study_ids
    const learningPath = await LearningPath.findOne({
        user_id: new Types.ObjectId(userId.toString()),
        $or: [
            { week_study_ids: dayStudy.week_id },
            { additional_week_studies: dayStudy.week_id },
        ],
    });

    return learningPath;
}

/**
 * Tạo feedback cho buổi học
 */
export async function createLessonFeedback(
    dto: CreateFeedbackDTO
): Promise<ILessonFeedback> {
    const { userId, dayStudyId, rating, reasons = [], comment } = dto;

    // Validate rating
    if (rating < 1 || rating > 5) {
        throw new Error("Rating phải từ 1 đến 5");
    }

    // Kiểm tra DayStudy có tồn tại không
    const dayStudy = await DayStudy.findById(dayStudyId);
    if (!dayStudy) {
        throw new Error("Không tìm thấy ngày học");
    }

    // Tìm learning path thông qua week_study_ids
    const learningPath = await findLearningPathByDayStudy(dayStudyId, userId);

    if (!learningPath) {
        throw new Error("Không tìm thấy lộ trình học của user");
    }

    const newFeedback: ILessonFeedback = {
        day_study_id: new Types.ObjectId(dayStudyId),
        rating,
        reasons,
        comment,
        is_positive: rating >= 4,
        created_at: new Date(),
    } as ILessonFeedback;

    // Kiểm tra đã có feedback cho day này chưa
    const existingIndex = learningPath.feedbacks?.findIndex(
        (fb: ILessonFeedback) => fb.day_study_id.toString() === dayStudyId
    );

    if (existingIndex !== undefined && existingIndex >= 0 && learningPath.feedbacks) {
        // Update feedback hiện có
        learningPath.feedbacks[existingIndex] = newFeedback;
    } else {
        // Thêm feedback mới
        if (!learningPath.feedbacks) {
            learningPath.feedbacks = [];
        }
        learningPath.feedbacks.push(newFeedback);
    }

    learningPath.updated_at = new Date();
    await learningPath.save();

    return newFeedback;
}

/**
 * Lấy feedback của user cho một day study cụ thể
 */
export async function getUserFeedbackForDay(
    userId: string,
    dayStudyId: string
): Promise<ILessonFeedback | null> {
    const learningPath = await findLearningPathByDayStudy(dayStudyId, userId);

    if (!learningPath || !learningPath.feedbacks) return null;

    // Tìm feedback cho day_study_id
    const feedback = learningPath.feedbacks.find(
        (fb: ILessonFeedback) => fb.day_study_id.toString() === dayStudyId
    );

    return feedback || null;
}

/**
 * Lấy danh sách feedback của learning path với pagination
 */
export async function getFeedbacks(options: FeedbackQueryOptions) {
    let {
        learningPathId,
        rating,
        isPositive,
        page = 1,
        limit = 10,
    } = options;

    if (page < 1 || limit < 1) {
        page = 1;
        limit = 10;
    }

    const learningPath = await LearningPath.findById(learningPathId);
    if (!learningPath || !learningPath.feedbacks) {
        return {
            items: [],
            pagination: { page, limit, total: 0, totalPages: 0 },
        };
    }

    let feedbacks = [...learningPath.feedbacks];

    // Filter by rating
    if (rating !== undefined) {
        feedbacks = feedbacks.filter((fb) => fb.rating === rating);
    }

    // Filter by isPositive
    if (isPositive !== undefined) {
        feedbacks = feedbacks.filter((fb) => fb.is_positive === isPositive);
    }

    // Sort by created_at desc
    feedbacks.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const total = feedbacks.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const items = feedbacks.slice(skip, skip + limit);

    return {
        items,
        pagination: { page, limit, total, totalPages },
    };
}

/**
 * Lấy tất cả feedback của một user theo learning path ID
 */
export async function getFeedbacksByUserId(userId: string) {
    const learningPath = await LearningPath.findOne({
        user_id: new Types.ObjectId(userId),
        isActive: true,
    }).populate({
        path: "feedbacks.day_study_id",
        select: "dayOfWeek status",
    });

    if (!learningPath || !learningPath.feedbacks) {
        return [];
    }

    // Sort by created_at desc
    const feedbacks = [...learningPath.feedbacks].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return feedbacks;
}

/**
 * Lấy thống kê feedback theo learning path
 */
export async function getFeedbackStats(learningPathId: string) {
    const learningPath = await LearningPath.findById(learningPathId);

    if (!learningPath || !learningPath.feedbacks || learningPath.feedbacks.length === 0) {
        return {
            totalFeedbacks: 0,
            averageRating: 0,
            positiveFeedbacks: 0,
            negativeFeedbacks: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
    }

    const feedbacks = learningPath.feedbacks;
    const totalFeedbacks = feedbacks.length;
    const sumRating = feedbacks.reduce((sum, fb) => sum + fb.rating, 0);
    const averageRating = Math.round((sumRating / totalFeedbacks) * 100) / 100;

    const positiveFeedbacks = feedbacks.filter((fb) => fb.is_positive).length;
    const negativeFeedbacks = totalFeedbacks - positiveFeedbacks;

    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    feedbacks.forEach((fb) => {
        ratingDistribution[fb.rating as keyof typeof ratingDistribution]++;
    });

    return {
        totalFeedbacks,
        averageRating,
        positiveFeedbacks,
        negativeFeedbacks,
        ratingDistribution,
    };
}

/**
 * Lấy thống kê feedback theo user ID
 */
export async function getFeedbackStatsByUserId(userId: string) {
    const learningPath = await LearningPath.findOne({
        user_id: new Types.ObjectId(userId),
        isActive: true,
    });

    if (!learningPath) {
        return {
            totalFeedbacks: 0,
            averageRating: 0,
            positiveFeedbacks: 0,
            negativeFeedbacks: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
    }

    return getFeedbackStats((learningPath as any)._id.toString());
}

/**
 * Lấy các lý do feedback phổ biến
 */
export async function getPopularFeedbackReasons(
    learningPathId: string,
    isPositive?: boolean
) {
    const learningPath = await LearningPath.findById(learningPathId);

    if (!learningPath || !learningPath.feedbacks) {
        return [];
    }

    let feedbacks = learningPath.feedbacks;

    if (isPositive !== undefined) {
        feedbacks = feedbacks.filter((fb) => fb.is_positive === isPositive);
    }

    // Count reasons
    const reasonCount: Record<string, number> = {};
    feedbacks.forEach((fb) => {
        fb.reasons.forEach((reason) => {
            reasonCount[reason] = (reasonCount[reason] || 0) + 1;
        });
    });

    // Convert to array and sort
    const result = Object.entries(reasonCount)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return result;
}

/**
 * Xóa feedback
 */
export async function deleteFeedback(
    dayStudyId: string,
    userId: string
): Promise<boolean> {
    const learningPath = await findLearningPathByDayStudy(dayStudyId, userId);
    if (!learningPath) return false;

    // Tìm và xóa feedback
    const result = await LearningPath.updateOne(
        { _id: learningPath._id },
        {
            $pull: {
                feedbacks: { day_study_id: new Types.ObjectId(dayStudyId) },
            },
            $set: { updated_at: new Date() },
        }
    );

    return result.modifiedCount > 0;
}
