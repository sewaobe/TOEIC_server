import mongoose from "mongoose";
import { createHash, randomUUID } from "crypto";
import { FlashCardProgress } from "../models/flashcard_progress.model";
import { FlashCardAttempt } from "../models";
import { SubmissionType } from "../models/enums/SubmissionType";
import { updateVocabularyMemoryV2AfterFlashcardSession } from "./user_vocabulary_progress_v2.service";
import { IdempotencyRecord } from "../models/idempotency_record.model";

const FLASHCARD_SESSION_START_SCOPE = "flashcard.session.start";

const createRequestHash = (topicVocabularyId: string, order_queue: string[]) => {
    return createHash("sha256")
        .update(JSON.stringify({ topicVocabularyId, order_queue }))
        .digest("hex");
};

const isDuplicateKeyError = (error: any) => error?.code === 11000;

const createConflictError = (message: string) => {
    const error = new Error(message) as Error & { status?: number };
    error.status = 409;
    return error;
};

const ensureFlashcardAttemptForSession = async (
    userId: string,
    topicVocabularyId: mongoose.Types.ObjectId | string,
    sessionId: string
) => {
    const existingAttempt = await FlashCardAttempt.findOne({ session_id: sessionId });
    if (existingAttempt) return existingAttempt;

    try {
        return await FlashCardAttempt.create({
            session_id: sessionId,
            user_id: new mongoose.Types.ObjectId(userId),
            topic_vocabulary_id: topicVocabularyId,
            submit_type: SubmissionType.PRACTICE,
            results: [],
            accuracy: 0,
            started_at: new Date(),
        });
    } catch (error: any) {
        if (!isDuplicateKeyError(error)) throw error;
        return FlashCardAttempt.findOne({ session_id: sessionId });
    }
};

const buildSessionStartResponse = (session: any) => ({
    sessionId: session.session_id,
    newSession: session,
});

const completeIdempotencyRecord = async (recordId: any, responsePayload: any) => {
    await IdempotencyRecord.updateOne(
        { _id: recordId },
        {
            $set: {
                status: "completed",
                resource_type: "FlashCardProgress",
                resource_id: responsePayload.sessionId,
                response_payload: responsePayload,
            },
        }
    );
};

export const createFlashcardSessionService = async (
    userId: string,
    topicVocabularyId: string,
    order_queue: string[],
    idempotencyKey: string
) => {
    const requestHash = createRequestHash(topicVocabularyId, order_queue);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    let idempotencyRecord = await IdempotencyRecord.findOne({
        user_id: userObjectId,
        scope: FLASHCARD_SESSION_START_SCOPE,
        key: idempotencyKey,
    });

    if (!idempotencyRecord) {
        try {
            idempotencyRecord = await IdempotencyRecord.create({
                user_id: userObjectId,
                scope: FLASHCARD_SESSION_START_SCOPE,
                key: idempotencyKey,
                request_hash: requestHash,
                status: "processing",
            });
        } catch (error: any) {
            if (!isDuplicateKeyError(error)) throw error;
            idempotencyRecord = await IdempotencyRecord.findOne({
                user_id: userObjectId,
                scope: FLASHCARD_SESSION_START_SCOPE,
                key: idempotencyKey,
            });
        }
    }

    if (!idempotencyRecord) {
        throw new Error("Unable to create idempotency record");
    }

    if (idempotencyRecord.request_hash !== requestHash) {
        throw createConflictError("Idempotency-Key was already used with a different request");
    }

    if (idempotencyRecord.status === "completed" && idempotencyRecord.response_payload) {
        return idempotencyRecord.response_payload as { sessionId: string; newSession: any };
    }

    const existingActiveSession = await FlashCardProgress.findOne({
        user_id: userObjectId,
        topic_vocabulary_id: new mongoose.Types.ObjectId(topicVocabularyId),
        status: "active",
    });

    if (existingActiveSession) {
        await ensureFlashcardAttemptForSession(
            userId,
            existingActiveSession.topic_vocabulary_id,
            existingActiveSession.session_id
        );

        const responsePayload = buildSessionStartResponse(existingActiveSession);
        await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
        return responsePayload;
    }

    const sessionId = randomUUID();
    const newSession = new FlashCardProgress({
        session_id: sessionId,
        user_id: userObjectId,
        topic_vocabulary_id: new mongoose.Types.ObjectId(topicVocabularyId),
        order_queue,
        current_index: 0,
        logs: [],
        last_activity: new Date(),
        status: "active",
    });

    try {
        await newSession.save();
    } catch (error: any) {
        if (!isDuplicateKeyError(error)) throw error;

        const duplicateActiveSession = await FlashCardProgress.findOne({
            user_id: userObjectId,
            topic_vocabulary_id: new mongoose.Types.ObjectId(topicVocabularyId),
            status: "active",
        });

        if (!duplicateActiveSession) throw error;

        await ensureFlashcardAttemptForSession(
            userId,
            duplicateActiveSession.topic_vocabulary_id,
            duplicateActiveSession.session_id
        );

        const responsePayload = buildSessionStartResponse(duplicateActiveSession);
        await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
        return responsePayload;
    }

    await ensureFlashcardAttemptForSession(userId, newSession.topic_vocabulary_id, sessionId);

    const responsePayload = buildSessionStartResponse(newSession);
    await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
    return responsePayload;
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
            attempted_at: l.attempt_at
        })),
        accuracy,
        started_at,
        finished_at,
    });

    const memoryUpdates = await updateVocabularyMemoryV2AfterFlashcardSession({
        userId,
        logs,
        finishedAt: finished_at,
    });

    progress.status = "archived";
    progress.archive_reason = "completed";
    await progress.save();

    return {
        attempt,
        memoryUpdates
    };
}

export const removeFlashcardSessionService = async (sessionId: string, userId: string) => {
    const session = await FlashCardProgress.findOne({ session_id: sessionId, user_id: userId });
    if (!session) throw new Error("Flashcard session not found");

    session.status = "archived";
    session.archive_reason = "abandoned";
    const saved = await session.save();
    return saved;
}   
