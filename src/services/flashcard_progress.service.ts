import mongoose, { Types } from "mongoose";
import { createHash, randomUUID } from "crypto";
import { FlashCardProgress, IFlashCardProgress } from "../models/flashcard_progress.model";
import { FlashCardAttempt } from "../models";
import { SubmissionType } from "../models/enums/SubmissionType";
import { IdempotencyRecord } from "../models/idempotency_record.model";
import {
    buildFlashcardSessionPreviewMetadata,
    buildReviewReinforcementCardPreview,
    FlashcardSessionPreviewMetadata,
    SHORT_TERM_REPEAT_POLICIES,
} from "./flashcard_session_preview.service";
import {
    calForgetHalflife,
    calculateRecallProbability,
    calRecallHalflife,
    calStartHalflife,
    clampDifficulty,
    DHP_CONFIG,
    resolveMemoryStatus,
} from "../utils/dhp.util";
import { lookupSspMmcIntervalDays } from "./ssp_mmc_policy.service";
import { UserVocabularyMemoryV2 } from "../models/user_vocabulary_progress_v2.model";
import { Vocabulary } from "../models/vocabulary";
import {
    FLASHCARD_FEEDBACK_ACTIONS,
    FlashcardFeedbackAction,
    FlashcardSessionCardPhase,
    FlashcardSessionCardState,
} from "../types/flashcardFeedback.type";
import { getVietnamDateBounds, isBeforeStartOfVietnamToday } from "../utils/vietnamDay.util";

const FLASHCARD_SESSION_START_SCOPE = "flashcard.session.start";
const FLASHCARD_SESSION_ANSWER_SCOPE = "flashcard.session.answer";

const NEW_CARD_BASE_DIFFICULTY = 3;
const NEW_CARD_VAGUE_DIFFICULTY_PENALTY = 2;
const NEW_CARD_UNKNOWN_DIFFICULTY_PENALTY = 4;
const REVIEW_VAGUE_DIFFICULTY_STEP = 1;
const REVIEW_FORGOT_DIFFICULTY_STEP = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const ALLOWED_ACTIONS_BY_PHASE: Record<FlashcardSessionCardPhase, FlashcardFeedbackAction[]> = {
    NEW_LEARNING: ["remember", "vague", "unknown"],
    NEW_GRADUATED: [],
    REVIEW_PENDING: ["remember", "vague", "forgot"],
    REVIEW_REINFORCEMENT: ["remember", "vague", "forgot"],
    REVIEW_RESOLVED: [],
};

type SessionStartResponse = {
    sessionId: string;
    newSession: any;
    preview_metadata: FlashcardSessionPreviewMetadata;
};

export type FlashcardAnswerInput = {
    vocabulary_id: string;
    action: FlashcardFeedbackAction;
    response_time: number;
    attempted_at: string;
};

const createRequestHash = (payload: unknown) => {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
};

const isDuplicateKeyError = (error: any) => error?.code === 11000;

const createHttpError = (status: number, message: string) => {
    const error = new Error(message) as Error & { status?: number };
    error.status = status;
    return error;
};

const toObjectId = (value: string | Types.ObjectId, fieldName: string) => {
    if (value instanceof Types.ObjectId) return value;
    if (!Types.ObjectId.isValid(value)) {
        throw createHttpError(400, `Invalid ${fieldName}`);
    }
    return new Types.ObjectId(value);
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

const roundNumber = (value: number, digits: number) => {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
};

const hasCardStates = (session: any) => Boolean(session?.card_states);

const getCardState = (session: any, vocabularyId: string): FlashcardSessionCardState | undefined => {
    const states = session.card_states;
    if (!states) return undefined;
    if (states instanceof Map) return states.get(vocabularyId);
    return states[vocabularyId];
};

const normalizeCardStatesForPreview = (session: any) => {
    if (session.card_states instanceof Map) return session.card_states;
    return session.card_states ?? {};
};

const assertModernSession = (session: any) => {
    if (!hasCardStates(session)) {
        throw createHttpError(
            409,
            "Flashcard session is outdated. Please start a new session."
        );
    }
};

const isExpiredActiveSession = (session: Pick<IFlashCardProgress, "last_activity">, now = new Date()) => {
    return isBeforeStartOfVietnamToday(new Date(session.last_activity), now);
};

const archiveExpiredActiveSession = async (session: any) => {
    session.status = "archived";
    session.archive_reason = "expired";
    await session.save();
};

const archiveExpiredActiveSessionsForUser = async (userId: string, now = new Date()) => {
    const { startOfToday } = getVietnamDateBounds(now);
    const expiredSessions = await FlashCardProgress.find({
        user_id: userId,
        status: "active",
        last_activity: { $lt: startOfToday },
    }).select("_id status archive_reason last_activity");

    await Promise.all(expiredSessions.map((session: any) => archiveExpiredActiveSession(session)));
};

const calculateRepeatAfterCards = (
    remainingCards: number,
    policy: { ratio: number; min: number; max: number }
) => {
    if (remainingCards <= 0) return 0;
    const raw = Math.round(remainingCards * policy.ratio);
    const clamped = Math.max(policy.min, Math.min(policy.max, raw));
    return Math.min(clamped, remainingCards);
};

const getRepeatAfterCards = (action: FlashcardFeedbackAction, remainingCards: number) => {
    if (action === "remember") return undefined;
    const policy =
        action === "vague"
            ? SHORT_TERM_REPEAT_POLICIES.vague
            : SHORT_TERM_REPEAT_POLICIES.unknown_or_forgot;
    return calculateRepeatAfterCards(remainingCards, policy);
};

const initializeCardStates = async (userId: string, vocabularyIds: string[]) => {
    const validIds = vocabularyIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
    const memories =
        validIds.length === 0
            ? []
            : await UserVocabularyMemoryV2.find({
                user_id: new Types.ObjectId(userId),
                vocabulary_id: { $in: validIds },
            }).select("vocabulary_id").lean();

    const reviewIds = new Set(memories.map((memory: any) => String(memory.vocabulary_id)));
    const cardStates: Record<string, FlashcardSessionCardState> = {};

    for (const vocabularyId of vocabularyIds) {
        cardStates[vocabularyId] = reviewIds.has(vocabularyId)
            ? { phase: "REVIEW_PENDING", long_term_committed: false, repeat_count: 0 }
            : { phase: "NEW_LEARNING", long_term_committed: false, repeat_count: 0 };
    }

    return cardStates;
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

const buildSessionStartResponse = async (userId: string, session: any): Promise<SessionStartResponse> => ({
    sessionId: session.session_id,
    newSession: session,
    preview_metadata: await buildFlashcardSessionPreviewMetadata({
        userId,
        vocabularyIds: session.order_queue ?? [],
        cardStates: normalizeCardStatesForPreview(session),
    }),
});

const completeIdempotencyRecord = async (recordId: any, responsePayload: any) => {
    await IdempotencyRecord.updateOne(
        { _id: recordId },
        {
            $set: {
                status: "completed",
                resource_type: "FlashCardProgress",
                resource_id: responsePayload.sessionId ?? responsePayload.progress?.session_id,
                response_payload: responsePayload,
            },
        }
    );
};

const hasPreviewMetadata = (payload: any) => Boolean(payload?.preview_metadata);

const enrichSessionStartResponse = async (
    userId: string,
    responsePayload: any
): Promise<SessionStartResponse> => ({
    ...responsePayload,
    preview_metadata:
        responsePayload.preview_metadata ??
        (await buildFlashcardSessionPreviewMetadata({
            userId,
            vocabularyIds: responsePayload.newSession?.order_queue ?? [],
            cardStates: normalizeCardStatesForPreview(responsePayload.newSession),
        })),
});

export const createFlashcardSessionService = async (
    userId: string,
    topicVocabularyId: string,
    order_queue: string[],
    idempotencyKey: string
) => {
    const requestHash = createRequestHash({ topicVocabularyId, order_queue });
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

    if (!idempotencyRecord) throw new Error("Unable to create idempotency record");
    if (idempotencyRecord.request_hash !== requestHash) {
        throw createHttpError(409, "Idempotency-Key was already used with a different request");
    }

    if (idempotencyRecord.status === "completed" && idempotencyRecord.response_payload) {
        const responsePayload = await enrichSessionStartResponse(userId, idempotencyRecord.response_payload);
        if (!hasPreviewMetadata(idempotencyRecord.response_payload)) {
            await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
        }
        return responsePayload;
    }

    const existingActiveSession = await FlashCardProgress.findOne({
        user_id: userObjectId,
        topic_vocabulary_id: new mongoose.Types.ObjectId(topicVocabularyId),
        status: "active",
    });

    if (existingActiveSession) {
        if (isExpiredActiveSession(existingActiveSession)) {
            await archiveExpiredActiveSession(existingActiveSession);
        } else {
            assertModernSession(existingActiveSession);
            await ensureFlashcardAttemptForSession(
                userId,
                existingActiveSession.topic_vocabulary_id,
                existingActiveSession.session_id
            );

            const responsePayload = await buildSessionStartResponse(userId, existingActiveSession);
            await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
            return responsePayload;
        }
    }

    const sessionId = randomUUID();
    const cardStates = await initializeCardStates(userId, order_queue);
    const newSession = new FlashCardProgress({
        session_id: sessionId,
        user_id: userObjectId,
        topic_vocabulary_id: new mongoose.Types.ObjectId(topicVocabularyId),
        order_queue,
        current_index: 0,
        logs: [],
        card_states: cardStates,
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
        if (isExpiredActiveSession(duplicateActiveSession)) {
            await archiveExpiredActiveSession(duplicateActiveSession);
            await newSession.save();
            await ensureFlashcardAttemptForSession(userId, newSession.topic_vocabulary_id, sessionId);

            const responsePayload = await buildSessionStartResponse(userId, newSession);
            await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
            return responsePayload;
        }
        assertModernSession(duplicateActiveSession);

        await ensureFlashcardAttemptForSession(
            userId,
            duplicateActiveSession.topic_vocabulary_id,
            duplicateActiveSession.session_id
        );

        const responsePayload = await buildSessionStartResponse(userId, duplicateActiveSession);
        await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
        return responsePayload;
    }

    await ensureFlashcardAttemptForSession(userId, newSession.topic_vocabulary_id, sessionId);

    const responsePayload = await buildSessionStartResponse(userId, newSession);
    await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
    return responsePayload;
};

export const getSession = async (sessionId: string, userId: string) => {
    const session = await FlashCardProgress.findOne({
        session_id: sessionId,
        user_id: userId,
        status: "active",
    });

    if (!session) return { progress: null };
    if (isExpiredActiveSession(session)) {
        await archiveExpiredActiveSession(session);
        return { progress: null };
    }
    assertModernSession(session);

    return {
        progress: session,
        preview_metadata: await buildFlashcardSessionPreviewMetadata({
            userId,
            vocabularyIds: session.order_queue ?? [],
            cardStates: normalizeCardStatesForPreview(session),
        }),
    };
};

export const getAllSessionActiveByUserService = async (
    userId: string,
    page: number,
    limit: number
) => {
    const skip = (page - 1) * limit;
    await archiveExpiredActiveSessionsForUser(userId);

    const { startOfToday } = getVietnamDateBounds(new Date());
    const query = { user_id: userId, status: "active", last_activity: { $gte: startOfToday } };
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
            progress_count: uniqueVocabIds.size,
        };
    });

    return {
        items,
        total,
        page,
        pageCount: Math.ceil(total / limit),
    };
};

function validateAnswerInput(input: FlashcardAnswerInput) {
    if (!input?.vocabulary_id || !Types.ObjectId.isValid(input.vocabulary_id)) {
        throw createHttpError(400, "vocabulary_id is required");
    }

    if (!FLASHCARD_FEEDBACK_ACTIONS.includes(input.action)) {
        throw createHttpError(400, "Invalid flashcard action");
    }

    if (typeof input.response_time !== "number" || input.response_time < 0) {
        throw createHttpError(400, "response_time must be a non-negative number");
    }

    const attemptedAt = new Date(input.attempted_at);
    if (!input.attempted_at || Number.isNaN(attemptedAt.getTime())) {
        throw createHttpError(400, "attempted_at must be a valid ISO date");
    }

    return attemptedAt;
}

async function appendAttemptResultIfNeeded(input: {
    attemptId: Types.ObjectId;
    answerEventId: string;
    vocabularyId: string;
    action: FlashcardFeedbackAction;
    responseTime: number;
    attemptedAt: Date;
}) {
    const updateResult = await FlashCardAttempt.updateOne(
        {
            _id: input.attemptId,
            "results.answer_event_id": { $ne: input.answerEventId },
        },
        {
            $push: {
                results: {
                    answer_event_id: input.answerEventId,
                    vocabulary_id: new Types.ObjectId(input.vocabularyId),
                    action: input.action,
                    response_time: input.responseTime,
                    attempted_at: input.attemptedAt,
                },
            },
        }
    );

    return updateResult.modifiedCount > 0;
}

function getAttemptResultsForVocabulary(attempt: any, vocabularyId: string) {
    return (attempt.results ?? []).filter((result: any) => String(result.vocabulary_id) === vocabularyId);
}

async function applyNewCardMemory(input: {
    userId: string;
    attempt: any;
    vocabularyId: string;
    answerEventId: string;
    processedAt: Date;
}) {
    const existing = await UserVocabularyMemoryV2.findOne({
        user_id: new Types.ObjectId(input.userId),
        vocabulary_id: new Types.ObjectId(input.vocabularyId),
    });
    if (existing?.last_flashcard_answer_event_id === input.answerEventId) return;
    if (existing) {
        throw createHttpError(409, "Unexpected existing memory for new card");
    }

    const results = getAttemptResultsForVocabulary(input.attempt, input.vocabularyId);
    const vagueCount = results.filter((result: any) => result.action === "vague").length;
    const unknownCount = results.filter((result: any) => result.action === "unknown").length;
    const rememberCount = results.filter((result: any) => result.action === "remember").length;
    const totalResponseTime = results.reduce((sum: number, result: any) => sum + Number(result.response_time || 0), 0);
    const avgResponseTime = results.length > 0 ? totalResponseTime / results.length : 0;
    const difficulty = clampDifficulty(
        NEW_CARD_BASE_DIFFICULTY +
        vagueCount * NEW_CARD_VAGUE_DIFFICULTY_PENALTY +
        unknownCount * NEW_CARD_UNKNOWN_DIFFICULTY_PENALTY
    );
    const halfLifeDays = calStartHalflife(difficulty);
    const intervalDays = lookupSspMmcIntervalDays(difficulty, halfLifeDays);

    try {
        await UserVocabularyMemoryV2.create({
            user_id: new Types.ObjectId(input.userId),
            vocabulary_id: new Types.ObjectId(input.vocabularyId),
            difficulty,
            half_life_days: halfLifeDays,
            last_reviewed_at: input.processedAt,
            due_at: addDays(input.processedAt, intervalDays),
            status: resolveMemoryStatus(halfLifeDays),
            review_count: results.length,
            session_count: 1,
            last_p_recall: undefined,
            last_interval_days: intervalDays,
            last_seen_count: results.length,
            last_remember_count: rememberCount || 1,
            last_vague_count: vagueCount,
            last_unknown_count: unknownCount,
            last_forgot_count: 0,
            last_response_time_avg: avgResponseTime,
            last_dhp_recall_result: "remembered",
            last_flashcard_answer_event_id: input.answerEventId,
        });
    } catch (error: any) {
        if (!isDuplicateKeyError(error)) throw error;
        const recovered = await UserVocabularyMemoryV2.findOne({
            user_id: new Types.ObjectId(input.userId),
            vocabulary_id: new Types.ObjectId(input.vocabularyId),
        });
        if (!recovered) throw error;
        if (recovered.last_flashcard_answer_event_id === input.answerEventId) return;
        throw createHttpError(409, "Unexpected memory creation conflict");
    }
}

async function applyReviewPendingMemory(input: {
    userId: string;
    vocabularyId: string;
    action: FlashcardFeedbackAction;
    answerEventId: string;
    responseTime: number;
    processedAt: Date;
}) {
    const memory = await UserVocabularyMemoryV2.findOne({
        user_id: new Types.ObjectId(input.userId),
        vocabulary_id: new Types.ObjectId(input.vocabularyId),
    });
    if (!memory) throw createHttpError(409, "Review memory not found for vocabulary");

    const currentDifficulty = clampDifficulty(memory.difficulty);
    const currentHalfLifeDays = memory.half_life_days;
    const lastReviewedAt = memory.last_reviewed_at ?? null;
    const pRecall = lastReviewedAt
        ? calculateRecallProbability(currentHalfLifeDays, lastReviewedAt, input.processedAt)
        : DHP_CONFIG.MAX_P_RECALL;

    const isRemember = input.action === "remember";
    const nextDifficulty = isRemember
        ? currentDifficulty
        : clampDifficulty(
            currentDifficulty +
            (input.action === "vague" ? REVIEW_VAGUE_DIFFICULTY_STEP : REVIEW_FORGOT_DIFFICULTY_STEP)
        );
    const nextHalfLifeDays = isRemember
        ? calRecallHalflife(currentDifficulty, currentHalfLifeDays, pRecall)
        : calForgetHalflife(currentDifficulty, currentHalfLifeDays, pRecall);
    const intervalDays = lookupSspMmcIntervalDays(nextDifficulty, nextHalfLifeDays);

    const updateResult = await UserVocabularyMemoryV2.updateOne(
        {
            _id: memory._id,
            last_flashcard_answer_event_id: { $ne: input.answerEventId },
        },
        {
            $set: {
                difficulty: nextDifficulty,
                half_life_days: nextHalfLifeDays,
                last_reviewed_at: input.processedAt,
                due_at: addDays(input.processedAt, intervalDays),
                status: resolveMemoryStatus(nextHalfLifeDays),
                last_p_recall: roundNumber(pRecall, 6),
                last_interval_days: intervalDays,
                last_seen_count: 1,
                last_remember_count: input.action === "remember" ? 1 : 0,
                last_vague_count: input.action === "vague" ? 1 : 0,
                last_unknown_count: 0,
                last_forgot_count: input.action === "forgot" ? 1 : 0,
                last_response_time_avg: input.responseTime,
                last_dhp_recall_result: isRemember ? "remembered" : "forgot",
                last_flashcard_answer_event_id: input.answerEventId,
            },
            $inc: {
                session_count: 1,
                review_count: 1,
            },
        }
    );

    if (updateResult.modifiedCount > 0) return;

    const refreshed = await UserVocabularyMemoryV2.findOne({ _id: memory._id });
    if (refreshed?.last_flashcard_answer_event_id === input.answerEventId) return;
    throw createHttpError(409, "Review memory update conflict");
}

async function applyReviewReinforcementMemory(input: {
    userId: string;
    vocabularyId: string;
    answerEventId: string;
}) {
    const memory = await UserVocabularyMemoryV2.findOne({
        user_id: new Types.ObjectId(input.userId),
        vocabulary_id: new Types.ObjectId(input.vocabularyId),
    });
    if (!memory) throw createHttpError(409, "Review memory not found for vocabulary");

    const updateResult = await UserVocabularyMemoryV2.updateOne(
        {
            user_id: new Types.ObjectId(input.userId),
            vocabulary_id: new Types.ObjectId(input.vocabularyId),
            last_flashcard_answer_event_id: { $ne: input.answerEventId },
        },
        {
            $inc: { review_count: 1 },
            $set: { last_flashcard_answer_event_id: input.answerEventId },
        }
    );

    if (updateResult.modifiedCount > 0) return;

    const refreshed = await UserVocabularyMemoryV2.findOne({
        user_id: new Types.ObjectId(input.userId),
        vocabulary_id: new Types.ObjectId(input.vocabularyId),
    });
    if (refreshed?.last_flashcard_answer_event_id === input.answerEventId) return;
    throw createHttpError(409, "Review reinforcement update conflict");
}

async function applyMemoryEffect(input: {
    userId: string;
    attempt: any;
    vocabularyId: string;
    action: FlashcardFeedbackAction;
    phase: FlashcardSessionCardPhase;
    answerEventId: string;
    responseTime: number;
    processedAt: Date;
}) {
    if (input.phase === "NEW_LEARNING" && input.action === "remember") {
        await applyNewCardMemory(input);
        return;
    }

    if (input.phase === "REVIEW_PENDING") {
        await applyReviewPendingMemory(input);
        return;
    }

    if (input.phase === "REVIEW_REINFORCEMENT") {
        await applyReviewReinforcementMemory(input);
    }
}

function transitionCardState(
    state: FlashcardSessionCardState,
    action: FlashcardFeedbackAction
): FlashcardSessionCardState {
    if (state.phase === "NEW_LEARNING") {
        if (action === "remember") {
            return { ...state, phase: "NEW_GRADUATED", long_term_committed: true };
        }
        return { ...state, repeat_count: state.repeat_count + 1 };
    }

    if (state.phase === "REVIEW_PENDING") {
        if (action === "remember") {
            return { ...state, phase: "REVIEW_RESOLVED", long_term_committed: true };
        }
        return {
            ...state,
            phase: "REVIEW_REINFORCEMENT",
            long_term_committed: true,
            repeat_count: state.repeat_count + 1,
        };
    }

    if (state.phase === "REVIEW_REINFORCEMENT") {
        if (action === "remember") {
            return { ...state, phase: "REVIEW_RESOLVED" };
        }
        return { ...state, repeat_count: state.repeat_count + 1 };
    }

    return state;
}

async function resolveVocabularyWord(vocabularyId: string) {
    const vocabulary = await Vocabulary.findById(vocabularyId).select("word").lean();
    return (vocabulary as any)?.word ?? "";
}

async function mutateProgressForAnswer(input: {
    progress: IFlashCardProgress;
    vocabularyId: string;
    vocabularyWord: string;
    action: FlashcardFeedbackAction;
    responseTime: number;
    attemptedAt: Date;
    answerEventId: string;
    nextState: FlashcardSessionCardState;
    processedAt: Date;
}) {
    const remainingQueue = [...(input.progress.order_queue ?? [])];
    remainingQueue.shift();

    const repeatAfterCards = getRepeatAfterCards(input.action, remainingQueue.length);
    if (repeatAfterCards !== undefined) {
        remainingQueue.splice(Math.min(repeatAfterCards, remainingQueue.length), 0, input.vocabularyId);
    }

    const logEntry = {
        answer_event_id: input.answerEventId,
        vocab_id: input.vocabularyId,
        vocab_word: input.vocabularyWord,
        action: input.action,
        response_time: input.responseTime,
        attempted_at: input.attemptedAt.toISOString(),
    };

    const updated = await FlashCardProgress.findOneAndUpdate(
        {
            _id: input.progress._id,
            status: "active",
            last_processed_answer_event_id: { $ne: input.answerEventId },
            "order_queue.0": input.vocabularyId,
        },
        {
            $set: {
                order_queue: remainingQueue,
                current_index: 0,
                last_activity: input.processedAt,
                last_processed_answer_event_id: input.answerEventId,
                [`card_states.${input.vocabularyId}`]: input.nextState,
            },
            $push: { logs: logEntry },
        },
        { new: true }
    );

    if (updated) return updated;

    const persisted = await FlashCardProgress.findById(input.progress._id);
    if (!persisted) throw createHttpError(404, "Flashcard session not found");
    if (persisted.last_processed_answer_event_id === input.answerEventId) return persisted;

    throw createHttpError(409, "Answered vocabulary is not the current card");
}

export async function answerFlashcardSessionService(
    userId: string,
    sessionId: string,
    body: FlashcardAnswerInput,
    idempotencyKey: string
) {
    const attemptedAt = validateAnswerInput(body);
    const requestHash = createRequestHash({ sessionId, body });
    const userObjectId = new Types.ObjectId(userId);
    let idempotencyRecord = await IdempotencyRecord.findOne({
        user_id: userObjectId,
        scope: FLASHCARD_SESSION_ANSWER_SCOPE,
        key: idempotencyKey,
    });

    if (!idempotencyRecord) {
        try {
            idempotencyRecord = await IdempotencyRecord.create({
                user_id: userObjectId,
                scope: FLASHCARD_SESSION_ANSWER_SCOPE,
                key: idempotencyKey,
                request_hash: requestHash,
                status: "processing",
            });
        } catch (error: any) {
            if (!isDuplicateKeyError(error)) throw error;
            idempotencyRecord = await IdempotencyRecord.findOne({
                user_id: userObjectId,
                scope: FLASHCARD_SESSION_ANSWER_SCOPE,
                key: idempotencyKey,
            });
        }
    }

    if (!idempotencyRecord) throw new Error("Unable to create idempotency record");
    if (idempotencyRecord.request_hash !== requestHash) {
        throw createHttpError(409, "Idempotency-Key was already used with a different request");
    }

    if (idempotencyRecord.status === "completed" && idempotencyRecord.response_payload) {
        return idempotencyRecord.response_payload;
    }

    const answerEventId = idempotencyKey;
    const progress = await FlashCardProgress.findOne({
        session_id: sessionId,
        user_id: userObjectId,
        status: "active",
    });
    if (!progress) throw createHttpError(404, "Flashcard session not found");
    if (isExpiredActiveSession(progress)) {
        await archiveExpiredActiveSession(progress);
        throw createHttpError(409, "Flashcard session has expired. Please start a new session.");
    }
    assertModernSession(progress);

    if (progress.last_processed_answer_event_id === answerEventId) {
        const persistedState = getCardState(progress, body.vocabulary_id);
        const shouldReturnPatch =
            (body.action === "vague" || body.action === "forgot") &&
            persistedState?.phase === "REVIEW_REINFORCEMENT";
        const preview_metadata_patch = shouldReturnPatch
            ? {
                cards: {
                    [body.vocabulary_id]: buildReviewReinforcementCardPreview(),
                },
            }
            : null;
        const responsePayload = { progress, preview_metadata_patch };
        await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
        return responsePayload;
    }

    if ((progress.order_queue ?? [])[0] !== body.vocabulary_id) {
        throw createHttpError(409, "Answered vocabulary is not the current card");
    }

    const currentState = getCardState(progress, body.vocabulary_id);
    if (!currentState) throw createHttpError(409, "Card state not found for vocabulary");

    if (!ALLOWED_ACTIONS_BY_PHASE[currentState.phase].includes(body.action)) {
        throw createHttpError(400, "Action is not allowed for current card phase");
    }

    const attempt = await ensureFlashcardAttemptForSession(
        userId,
        progress.topic_vocabulary_id,
        progress.session_id
    );
    if (!attempt) throw new Error("Unable to load flashcard attempt");
    const attemptId = attempt._id as Types.ObjectId;

    const processedAt = new Date();
    await appendAttemptResultIfNeeded({
        attemptId,
        answerEventId,
        vocabularyId: body.vocabulary_id,
        action: body.action,
        responseTime: body.response_time,
        attemptedAt,
    });

    let attemptForMemory = attempt;
    if (currentState.phase === "NEW_LEARNING" && body.action === "remember") {
        const refreshedAttempt = await FlashCardAttempt.findById(attemptId);
        if (refreshedAttempt) {
            attemptForMemory = refreshedAttempt;
        }
    }

    await applyMemoryEffect({
        userId,
        attempt: attemptForMemory,
        vocabularyId: body.vocabulary_id,
        action: body.action,
        phase: currentState.phase,
        answerEventId,
        responseTime: body.response_time,
        processedAt,
    });

    const nextState = transitionCardState(currentState, body.action);
    const vocabularyWord = await resolveVocabularyWord(body.vocabulary_id);
    const updatedProgress = await mutateProgressForAnswer({
        progress,
        vocabularyId: body.vocabulary_id,
        vocabularyWord,
        action: body.action,
        responseTime: body.response_time,
        attemptedAt,
        answerEventId,
        nextState,
        processedAt,
    });

    const preview_metadata_patch =
        currentState.phase === "REVIEW_PENDING" && (body.action === "vague" || body.action === "forgot")
            ? {
                cards: {
                    [body.vocabulary_id]: buildReviewReinforcementCardPreview(),
                },
            }
            : null;
    const responsePayload = { progress: updatedProgress, preview_metadata_patch };
    await completeIdempotencyRecord(idempotencyRecord._id, responsePayload);
    return responsePayload;
}

export const finalizeFlashcardSessionService = async (
    userId: string,
    session_id: string,
    accuracy: number,
    avg_time: number,
    total: number,
    started_at: string,
    finished_at: string
) => {
    const progress = await FlashCardProgress.findOne({ session_id, user_id: userId, status: "active" });
    if (!progress) throw new Error("Flashcard session not found");
    assertModernSession(progress);
    if ((progress.order_queue ?? []).length > 0) {
        throw createHttpError(409, "Flashcard session cannot be finalized before queue is empty");
    }

    const attempt = await FlashCardAttempt.findOne({ session_id });
    if (!attempt) throw new Error("Flashcard attempt not found");

    attempt.accuracy = accuracy;
    attempt.started_at = new Date(started_at);
    attempt.finished_at = new Date(finished_at);
    attempt.time_spent = avg_time && total ? avg_time * total : attempt.time_spent;
    await attempt.save();

    progress.status = "archived";
    progress.archive_reason = "completed";
    await progress.save();

    return {
        attempt,
        memoryUpdates: [],
    };
};

export const removeFlashcardSessionService = async (sessionId: string, userId: string) => {
    const session = await FlashCardProgress.findOne({ session_id: sessionId, user_id: userId });
    if (!session) throw new Error("Flashcard session not found");

    if (session.status === "archived") {
        return session;
    }

    session.status = "archived";
    session.archive_reason = "abandoned";
    return session.save();
};

export const __test__ = {
    appendAttemptResultIfNeeded,
    mutateProgressForAnswer,
    applyReviewPendingMemory,
    applyReviewReinforcementMemory,
    applyNewCardMemory,
};
