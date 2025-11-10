import { IPracticeSession, PracticeSession, PracticeType, SessionStatus } from "../models/practice_session.model";
import { VocabularyDefinitionAttempt } from "../models/vocabulary_definition_attempt.model";
import { Types } from "mongoose";

/**
 * Tạo hoặc resume session
 * - Nếu có session in_progress cho topic này → return session đó
 * - Nếu không → tạo mới (KHÔNG cancel session khác)
 */
export const startOrResumeSessionService = async (
    userId: string,
    practiceType: PracticeType,
    topicId: string,
    totalItems: number
) => {
    const userObjectId = new Types.ObjectId(userId);
    const topicObjectId = new Types.ObjectId(topicId);

    // 1. Check session in_progress cho topic này
    const existingSession = await PracticeSession.findOne({
        user_id: userObjectId,
        practice_type: practiceType,
        topic_id: topicObjectId,
        status: "in_progress"
    });

    if (existingSession) {
        // Resume session cũ
        return {
            session: existingSession,
            isResume: true
        };
    }

    // 2. Tạo session mới (KHÔNG cancel các session khác - cho phép multiple in_progress)
    const newSession = await PracticeSession.create({
        user_id: userObjectId,
        practice_type: practiceType,
        topic_id: topicObjectId,
        total_items: totalItems,
        status: "in_progress"
    });

    return {
        session: newSession,
        isResume: false
    };
};

/**
 * Update progress của session
 */
export const updateSessionProgressService = async (
    sessionId: string,
    data: {
        current_index?: number;
        completed_items?: number;
        correct_count?: number;
        total_accuracy?: number;
    }
) => {
    const session = await PracticeSession.findByIdAndUpdate(
        sessionId,
        {
            $set: {
                ...data,
                last_activity_at: new Date()
            }
        },
        { new: true }
    );

    if (!session) {
        throw new Error("Session not found");
    }

    return session;
};

/**
 * Complete session và submit attempts
 */
export const completeSessionService = async (
    sessionId: string,
    attempts: any[]
) => {
    const session = await PracticeSession.findById(sessionId);
    
    if (!session) {
        throw new Error("Session not found");
    }

    // Tính toán kết quả cuối cùng
    const correctCount = attempts.filter(a => a.is_correct).length;
    const totalAccuracy = attempts.length > 0 
        ? attempts.reduce((sum, a) => sum + a.accuracy_score, 0) / attempts.length 
        : 0;

    // Update session
    session.status = "completed";
    session.completed_items = attempts.length;
    session.correct_count = correctCount;
    session.total_accuracy = totalAccuracy;
    session.completed_at = new Date();
    session.last_activity_at = new Date();
    
    await session.save();

    // Lưu attempts với session_id
    const attemptsWithSession = attempts.map(a => ({
        ...a,
        session_id: sessionId,
        user_id: session.user_id
    }));

    const savedAttempts = await VocabularyDefinitionAttempt.insertMany(attemptsWithSession);

    return {
        session,
        attempts: savedAttempts
    };
};

/**
 * Get session by topic
 */
export const getSessionByTopicService = async (
    userId: string,
    practiceType: PracticeType,
    topicId: string
) => {
    const session = await PracticeSession.findOne({
        user_id: new Types.ObjectId(userId),
        practice_type: practiceType,
        topic_id: new Types.ObjectId(topicId),
        status: "in_progress"
    });

    return session;
};

/**
 * Get all sessions của user (để hiển thị progress trên cards)
 * Trả về MỘT session mới nhất cho mỗi topic, ưu tiên: in_progress > completed > cancelled
 */
export const getUserSessionsService = async (
    userId: string,
    practiceType?: PracticeType,
    status?: SessionStatus,
    page = 1,
    limit = 100
) => {
    const matchQuery: any = { user_id: new Types.ObjectId(userId) }; // Convert to ObjectId
    
    if (practiceType) {
        matchQuery.practice_type = practiceType;
    }
    
    if (status) {
        matchQuery.status = status;
    }

    // Aggregation để lấy session mới nhất cho mỗi topic
    const sessions = await PracticeSession.aggregate([
        { $match: matchQuery },
        // Sort để ưu tiên in_progress, sau đó completed, cuối cùng là cancelled
        {
            $addFields: {
                statusPriority: {
                    $switch: {
                        branches: [
                            { case: { $eq: ["$status", "in_progress"] }, then: 1 },
                            { case: { $eq: ["$status", "completed"] }, then: 2 },
                            { case: { $eq: ["$status", "cancelled"] }, then: 3 }
                        ],
                        default: 4
                    }
                }
            }
        },
        { $sort: { statusPriority: 1, last_activity_at: -1 } },
        // Group theo topic_id, lấy session đầu tiên (mới nhất với priority cao nhất)
        {
            $group: {
                _id: "$topic_id",
                session: { $first: "$$ROOT" }
            }
        },
        { $replaceRoot: { newRoot: "$session" } },
        { $skip: (page - 1) * limit },
        { $limit: limit }
    ]);

    const totalAgg = await PracticeSession.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: "$topic_id"
            }
        },
        { $count: "total" }
    ]);

    const total = totalAgg.length > 0 ? totalAgg[0].total : 0;
    const pageCount = Math.ceil(total / limit);

    return {
        items: sessions,
        total,
        page,
        pageCount
    };
};

/**
 * Get attempts của 1 session
 */
export const getSessionAttemptsService = async (
    sessionId: string,
    userId: string
) => {
    const attempts = await VocabularyDefinitionAttempt.find({
        session_id: new Types.ObjectId(sessionId),
        user_id: new Types.ObjectId(userId)
    }).sort({ attempt_at: 1 });

    return attempts;
};

/**
 * Save attempt ngay khi submit (không đợi complete)
 */
export const saveAttemptService = async (
    sessionId: string,
    userId: string,
    attempt: any
) => {
    const attemptWithIds = {
        ...attempt,
        session_id: new Types.ObjectId(sessionId),
        user_id: new Types.ObjectId(userId)
    };

    const savedAttempt = await VocabularyDefinitionAttempt.create(attemptWithIds);
    return savedAttempt;
};

/**
 * Cancel session và xóa hết attempts của session đó
 */
export const cancelSessionService = async (sessionId: string) => {
    // 1. Xóa tất cả attempts của session này
    await VocabularyDefinitionAttempt.deleteMany({
        session_id: new Types.ObjectId(sessionId)
    });

    // 2. Update session status
    const session = await PracticeSession.findByIdAndUpdate(
        sessionId,
        {
            $set: {
                status: "cancelled",
                completed_at: new Date()
            }
        },
        { new: true }
    );

    if (!session) {
        throw new Error("Session not found");
    }

    return session;
};
