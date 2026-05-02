import { Types } from "mongoose";
import {
    FlashcardSessionLog,
    summarizeFlashcardLogs,
    VocabularySessionSummary,
} from "../utils/flashcardSessionSummary.util";
import {
    calStartHalflife,
    calRecallHalflife,
    calculateRecallProbability,
    clampDifficulty,
    resolveMemoryStatus,
    calForgetHalflife,
} from "../utils/dhp.util";
import { lookupSspMmcIntervalDays } from "../services/ssp_mmc_policy.service";
import { UserVocabularyMemoryV2 } from "../models/user_vocabulary_progress_v2.model";

export interface UpdateVocabularyMemoryV2Params {
    userId: string | Types.ObjectId;
    logs: FlashcardSessionLog[];
    finishedAt: string | Date;
}

export interface VocabularyMemoryV2UpdateResult {
    vocabularyId: string;
    isNewMemory: boolean;

    previousDifficulty?: number;
    previousHalfLifeDays?: number;

    observedDifficulty: number;
    nextDifficulty: number;

    previousPRecall?: number;
    nextHalfLifeDays: number;

    nextIntervalDays: number;
    dueAt: Date;
    status: "learning" | "reviewing" | "mastered";

    seenCount: number;
    hardCount: number;
    mediumCount: number;
    easyCount: number;
    skipCount: number;
    learningEffort: number;
    recallFailureScore: number;
    dhpRecallResult: "remembered" | "forgot";
}

const OBSERVED_DIFFICULTY_WEIGHT = 0.35;
const MAX_DIFFICULTY_STEP_PER_SESSION = 3;

export async function updateVocabularyMemoryV2AfterFlashcardSession(
    params: UpdateVocabularyMemoryV2Params
): Promise<VocabularyMemoryV2UpdateResult[]> {
    const userObjectId = toObjectId(params.userId, "userId");
    const finishedAt = toValidDate(params.finishedAt, "finishedAt");

    if (!Array.isArray(params.logs) || params.logs.length === 0) {
        return [];
    }

    const summaries = summarizeFlashcardLogs(params.logs);

    const results: VocabularyMemoryV2UpdateResult[] = [];

    for (const summary of summaries) {
        const vocabularyObjectId = toObjectId(
            summary.vocabularyId,
            "vocabularyId"
        );

        const existingMemory = await UserVocabularyMemoryV2.findOne({
            user_id: userObjectId,
            vocabulary_id: vocabularyObjectId,
        });

        if (!existingMemory) {
            const created = await createInitialMemory({
                userObjectId,
                vocabularyObjectId,
                summary,
                finishedAt,
            });

            results.push(created);
            continue;
        }

        const updated = await updateExistingMemory({
            memory: existingMemory,
            summary,
            finishedAt,
        });

        results.push(updated);
    }

    return results;
}

async function createInitialMemory(input: {
    userObjectId: Types.ObjectId;
    vocabularyObjectId: Types.ObjectId;
    summary: VocabularySessionSummary;
    finishedAt: Date;
}): Promise<VocabularyMemoryV2UpdateResult> {
    const { userObjectId, vocabularyObjectId, summary, finishedAt } = input;

    const difficulty = clampDifficulty(summary.initialDifficulty);

    const halfLifeDays = calStartHalflife(difficulty);

    const nextIntervalDays = lookupSspMmcIntervalDays(
        difficulty,
        halfLifeDays
    );

    const dueAt = addDays(finishedAt, nextIntervalDays);

    const status = resolveMemoryStatus(halfLifeDays);

    await UserVocabularyMemoryV2.create({
        user_id: userObjectId,
        vocabulary_id: vocabularyObjectId,

        difficulty,
        half_life_days: halfLifeDays,

        last_reviewed_at: finishedAt,
        due_at: dueAt,
        status,

        review_count: summary.seenCount,
        session_count: 1,

        last_p_recall: undefined,
        last_interval_days: nextIntervalDays,

        last_seen_count: summary.seenCount,
        last_hard_count: summary.hardCount,
        last_medium_count: summary.mediumCount,
        last_easy_count: summary.easyCount,
        last_skip_count: summary.skipCount,
        last_learning_effort: summary.learningEffort,
        last_response_time_avg: summary.avgResponseTimeMs,
        last_recall_failure_score: summary.recallFailureScore,
        last_dhp_recall_result: summary.dhpRecallResult,
    });

    return {
        vocabularyId: summary.vocabularyId,
        isNewMemory: true,

        observedDifficulty: difficulty,
        nextDifficulty: difficulty,

        nextHalfLifeDays: roundNumber(halfLifeDays, 6),
        nextIntervalDays,
        dueAt,
        status,

        seenCount: summary.seenCount,
        hardCount: summary.hardCount,
        mediumCount: summary.mediumCount,
        easyCount: summary.easyCount,
        skipCount: summary.skipCount,
        learningEffort: roundNumber(summary.learningEffort, 4),
        recallFailureScore: roundNumber(summary.recallFailureScore, 4),
        dhpRecallResult: summary.dhpRecallResult,
    };
}

async function updateExistingMemory(input: {
    memory: any;
    summary: VocabularySessionSummary;
    finishedAt: Date;
}): Promise<VocabularyMemoryV2UpdateResult> {
    const { memory, summary, finishedAt } = input;

    const previousDifficulty = memory.difficulty;
    const previousHalfLifeDays = memory.half_life_days;

    const lastReviewedAt: Date | null = memory.last_reviewed_at ?? null;

    const previousPRecall = lastReviewedAt
        ? calculateRecallProbability(previousHalfLifeDays, lastReviewedAt, finishedAt)
        : undefined;

    /**
     * Vì session của bạn bắt user học tới khi bấm skip / I remember this,
     * v1 coi session hoàn thành là remembered.
     */
    let nextHalfLifeDays = previousHalfLifeDays;

    if (previousPRecall !== undefined) {
        if (summary.dhpRecallResult === "forgot") {
            nextHalfLifeDays = calForgetHalflife(
                previousDifficulty,
                previousHalfLifeDays,
                previousPRecall
            );
        } else {
            const rawRecallHalfLifeDays = calRecallHalflife(
                previousDifficulty,
                previousHalfLifeDays,
                previousPRecall
            );

            nextHalfLifeDays = applySessionQualityToRecallGain(
                previousHalfLifeDays,
                rawRecallHalfLifeDays,
                summary
            );
        }
    }

    /**
     * observedDifficulty lấy từ logs hiện tại.
     * Không thay difficulty nhảy mạnh ngay lập tức,
     * mà smooth để tránh 1 session bất thường làm memory dao động quá nhiều.
     */
    const observedDifficulty = clampDifficulty(summary.initialDifficulty);

    const nextDifficulty = calculateSmoothedDifficulty(
        previousDifficulty,
        observedDifficulty
    );

    const nextIntervalDays = lookupSspMmcIntervalDays(
        nextDifficulty,
        nextHalfLifeDays
    );

    const dueAt = addDays(finishedAt, nextIntervalDays);

    const status = resolveMemoryStatus(nextHalfLifeDays);

    memory.difficulty = nextDifficulty;
    memory.half_life_days = nextHalfLifeDays;

    memory.last_reviewed_at = finishedAt;
    memory.due_at = dueAt;
    memory.status = status;

    memory.review_count = (memory.review_count ?? 0) + summary.seenCount;
    memory.session_count = (memory.session_count ?? 0) + 1;

    memory.last_p_recall =
        previousPRecall === undefined ? undefined : previousPRecall;
    memory.last_interval_days = nextIntervalDays;

    memory.last_seen_count = summary.seenCount;
    memory.last_hard_count = summary.hardCount;
    memory.last_medium_count = summary.mediumCount;
    memory.last_easy_count = summary.easyCount;
    memory.last_skip_count = summary.skipCount;
    memory.last_learning_effort = summary.learningEffort;
    memory.last_response_time_avg = summary.avgResponseTimeMs;
    memory.last_recall_failure_score = summary.recallFailureScore;
    memory.last_dhp_recall_result = summary.dhpRecallResult;

    await memory.save();

    return {
        vocabularyId: summary.vocabularyId,
        isNewMemory: false,

        previousDifficulty,
        previousHalfLifeDays: roundNumber(previousHalfLifeDays, 6),

        observedDifficulty,
        nextDifficulty,

        previousPRecall:
            previousPRecall === undefined ? undefined : roundNumber(previousPRecall, 6),

        nextHalfLifeDays: roundNumber(nextHalfLifeDays, 6),

        nextIntervalDays,
        dueAt,
        status,

        seenCount: summary.seenCount,
        hardCount: summary.hardCount,
        mediumCount: summary.mediumCount,
        easyCount: summary.easyCount,
        skipCount: summary.skipCount,
        learningEffort: roundNumber(summary.learningEffort, 4),
        recallFailureScore: roundNumber(summary.recallFailureScore, 4),
        dhpRecallResult: summary.dhpRecallResult,
    };
}

function calculateSmoothedDifficulty(
    currentDifficulty: number,
    observedDifficulty: number
): number {
    const current = clampDifficulty(currentDifficulty);
    const observed = clampDifficulty(observedDifficulty);

    const raw =
        current * (1 - OBSERVED_DIFFICULTY_WEIGHT) +
        observed * OBSERVED_DIFFICULTY_WEIGHT;

    const delta = raw - current;

    const limitedDelta = Math.max(
        -MAX_DIFFICULTY_STEP_PER_SESSION,
        Math.min(MAX_DIFFICULTY_STEP_PER_SESSION, delta)
    );

    return clampDifficulty(current + limitedDelta);
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toObjectId(value: string | Types.ObjectId, fieldName: string): Types.ObjectId {
    if (value instanceof Types.ObjectId) {
        return value;
    }

    if (!Types.ObjectId.isValid(value)) {
        throw new Error(`Invalid ${fieldName}: ${value}`);
    }

    return new Types.ObjectId(value);
}

function toValidDate(value: string | Date, fieldName: string): Date {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid ${fieldName}: ${value}`);
    }

    return date;
}

function roundNumber(value: number, digits: number): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function applySessionQualityToRecallGain(
    previousHalfLifeDays: number,
    rawRecallHalfLifeDays: number,
    summary: VocabularySessionSummary
): number {
    const gain = Math.max(0, rawRecallHalfLifeDays - previousHalfLifeDays);
    const qualityMultiplier = calculateRecallQualityMultiplier(summary);

    return previousHalfLifeDays + gain * qualityMultiplier;
}

function calculateRecallQualityMultiplier(
    summary: VocabularySessionSummary
): number {
    if (summary.hardCount > 0) {
        return 0.35;
    }

    if (summary.mediumCount > 0) {
        return 0.55;
    }

    if (summary.easyCount > 0) {
        return 0.75;
    }

    return 1.0;
}