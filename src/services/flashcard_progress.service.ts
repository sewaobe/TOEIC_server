import mongoose from "mongoose";
import { FlashCardProgress } from "../models/flashcard_progress.model";
import { FlashCardAttempt } from "../models";
import { SubmissionType } from "../models/enums/SubmissionType";

export const createFlashcardSessionService = async (userId: string, topicVocabularyId: string, order_queue: string[]) => {
    const sessionId = crypto.randomUUID();
    const newSession = new FlashCardProgress({
        session_id: sessionId,
        user_id: new mongoose.Types.ObjectId(userId),
        topic_vocabulary_id: new mongoose.Types.ObjectId(topicVocabularyId),
        order_queue,
        current_index: 0,
        logs: [],
        last_activity: new Date(),
        status: "active",
    });
    await newSession.save();
    return { sessionId, newSession };
}

export const updateFlashcardProgressService = async (
    sessionId: string,
    userId: string,
    order_queue: string[],
    current_index: number,
    logs_delta: any[]
) => {
    const progress = await FlashCardProgress.findOneAndUpdate(
        { session_id: sessionId, user_id: userId, status: "active" },
        {
            $set: {
                order_queue,
                current_index,
                last_activity: new Date(),
                logs: logs_delta, // ghi đè toàn bộ logs FE gửi về
            },
        },
        { upsert: true, new: true }
    );

    return progress;
};

export const getSession = async (sessionId: string, userId: string) => {
    const session = await FlashCardProgress.findOne(
        { session_id: sessionId, user_id: userId, status: "active" }
    );

    return session;
}

export const getAllSessionActiveByUserService = async (
    userId: string,
    page: number,
    limit: number
) => {
    const skip = (page - 1) * limit;
    const query = { user_id: userId, status: "active" };

    const total = await FlashCardProgress.countDocuments(query);

    const sessions = await FlashCardProgress.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ last_activity: -1 })
        .select("session_id topic_vocabulary_id last_activity status logs")
        .populate({
            path: "topic_vocabulary_id",
            select: "_id title description isPublic",
        })
        .lean();

    const items = sessions.map((s) => {
        const topic = (s.topic_vocabulary_id || {}) as any;

        // Tính số lượng từ vựng duy nhất
        const uniqueVocabIds = new Set(
            (s.logs || [])
                .map((log: any) => log.vocab_id)
                .filter((id: string) => typeof id === "string")
        );

        return {
            _id: s._id,
            session_id: s.session_id,
            topic: {
                _id: topic._id?.toString?.() || "unknown",
                title: topic.title || "Danh sách chưa đặt tên",
                description: topic.description || "",
                isPublic: topic.isPublic || false,
            },
            last_activity: s.last_activity,
            status: s.status,
            progress_count: uniqueVocabIds.size, // số từ duy nhất
        };
    });

    return {
        items,
        total,
        page,
        pageCount: Math.ceil(total / limit),
    };
};


export const finalizeFlashcardSessionService = async (
    userId: string,
    session_id: string,
    accuracy: number,
    avg_time: number,
    total: number,
    logs: any[],
    started_at: string,
    finished_at: string
) => {
    const progress = await FlashCardProgress.findOne({ session_id, user_id: userId });
    if (!progress) throw new Error("Flashcard session not found");

    const attempt = await FlashCardAttempt.create({
        user_id: userId,
        topic_vocabulary_id: progress.topic_vocabulary_id,
        submit_type: SubmissionType.PRACTICE,
        results: logs.map((l) => ({
            vocabulary_id: l.vocab_id,
            eval_type: l.eval_type,
            response_time: l.response_time,
        })),
        accuracy,
        started_at,
        finished_at,
    });

    progress.status = "archived";
    progress.archive_reason = "completed";
    await progress.save();

    return attempt;
}

export const removeFlashcardSessionService = async (sessionId: string, userId: string) => {
    const session = await FlashCardProgress.findOne({ session_id: sessionId, user_id: userId });
    if (!session) throw new Error("Flashcard session not found");

    session.status = "archived";
    session.archive_reason = "abandoned";
    const saved = await session.save();
    return saved;
}   
