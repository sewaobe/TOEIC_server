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
    DHP_CONFIG,
    MEMORY_SUGGESTION_POLICY,
    MemoryUiBucket,
    resolveMemoryUiBucket,
} from "../utils/dhp.util";
import { lookupSspMmcIntervalDays } from "../services/ssp_mmc_policy.service";
import {
    IUserVocabularyMemoryV2,
    UserVocabularyMemoryV2,
} from "../models/user_vocabulary_progress_v2.model";
import { FlashCardProgress } from "../models/flashcard_progress.model";
import { TopicVocabulary } from "../models/topic_vocabulary.model";
import { Vocabulary } from "../models/vocabulary";
import {
    buildSuggestionReasons,
    SuggestionReason,
} from "../utils/suggestionReason.util";

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
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SuggestionPriority = "high" | "medium" | "low";

export interface TodayReviewSummary {
    total: number;
    dueToday: number;
    atRisk: number;
    overdue: number;
    primaryReviewCount: number;
    overdueReviewCount: number;
}

export interface ReviewSchedulePoint {
    date: string;
    label: string;
    count: number;
}

export interface MemoryStatusSummaryItem {
    bucket: MemoryUiBucket;
    label: string;
    count: number;
    percentage: number;
}

export interface SuggestedVocabularyItem {
    id: string;
    vocabularyId: string;
    word: string;
    phonetic?: string;
    meaning?: string;
    type?: string;
    topic?: string;
    level?: string;
    priority: SuggestionPriority;
    priorityLabel: string;
    pRecallNow: number;
    dueAt: Date | null;
    dueLabel: string;
    memoryBucket: MemoryUiBucket;
    status: "learning" | "reviewing" | "mastered";
    halfLifeDays: number;
    difficulty: number;
    reviewCount: number;
    sessionCount: number;
}

export interface PaginatedSuggestions {
    items: SuggestedVocabularyItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    counters: {
        all: number;
        dueToday: number;
        atRisk: number;
        overdue: number;
        mastered: number;
    };
}

export interface SuggestionDetail {
    vocabulary_id: string;
    word: string;
    phonetic?: string;
    meaning?: string;
    topic_title?: string;
    level?: string;
    priority: SuggestionPriority;
    p_recall: number;
    half_life_days: number;
    last_reviewed_at: Date | null;
    due_at: Date | null;
    last_response_time_avg_ms: number | null;
    reasons: SuggestionReason[];
}

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

export async function getTodayReviewSummary(
    userId: string | Types.ObjectId
): Promise<TodayReviewSummary> {
    const userObjectId = toObjectId(userId, "userId");
    const now = new Date();
    const bounds = getVietnamDateBounds(now);
    const memories = await getScopedMemoryRecords(userObjectId);

    let dueToday = 0;
    let atRisk = 0;
    let overdue = 0;

    for (const memory of memories) {
        if (memory.status === "mastered") {
            continue;
        }

        const dueAt = memory.due_at ?? null;
        const pRecallNow = calculateMemoryPRecall(memory, now);

        if (dueAt && dueAt < bounds.startOfToday) {
            overdue += 1;
            continue;
        }

        if (
            dueAt &&
            dueAt >= bounds.startOfToday &&
            dueAt < bounds.startOfTomorrow
        ) {
            dueToday += 1;
            continue;
        }

        if (
            dueAt &&
            dueAt >= bounds.startOfTomorrow &&
            dueAt <= bounds.endOfAtRiskWindow &&
            pRecallNow < MEMORY_SUGGESTION_POLICY.AT_RISK_P_RECALL_THRESHOLD
        ) {
            atRisk += 1;
        }
    }

    return {
        total: dueToday + atRisk + overdue,
        dueToday,
        atRisk,
        overdue,
        primaryReviewCount: dueToday + atRisk,
        overdueReviewCount: overdue,
    };
}

export async function getReviewSchedule(
    userId: string | Types.ObjectId,
    rangeDays: 7 | 14 | 30 = 7
): Promise<ReviewSchedulePoint[]> {
    const userObjectId = toObjectId(userId, "userId");
    const bounds = getVietnamDateBounds(new Date());
    const memories = await getScopedMemoryRecords(userObjectId);
    const points: ReviewSchedulePoint[] = [];

    for (let dayIndex = 0; dayIndex < rangeDays; dayIndex++) {
        const start = new Date(bounds.startOfToday.getTime() + dayIndex * DAY_MS);
        const end = new Date(start.getTime() + DAY_MS);
        const count = memories.filter((memory) => {
            const dueAt = memory.due_at;
            return (
                memory.status !== "mastered" &&
                dueAt &&
                dueAt >= start &&
                dueAt < end
            );
        }).length;

        points.push({
            date: formatVietnamDateKey(start),
            label: resolveScheduleLabel(dayIndex),
            count,
        });
    }

    return points;
}

export async function getMemoryStatusSummary(
    userId: string | Types.ObjectId
): Promise<MemoryStatusSummaryItem[]> {
    const userObjectId = toObjectId(userId, "userId");
    const now = new Date();
    const bounds = getVietnamDateBounds(now);
    const memories = await getScopedMemoryRecords(userObjectId);

    const counts: Record<MemoryUiBucket, number> = {
        mastered: 0,
        active_reviewing: 0,
        at_risk: 0,
        overdue: 0,
    };

    for (const memory of memories) {
        const pRecallNow = calculateMemoryPRecall(memory, now);
        const bucket = resolveMemoryUiBucket({
            status: memory.status,
            dueAt: memory.due_at ?? null,
            pRecallNow,
            startOfToday: bounds.startOfToday,
            startOfTomorrow: bounds.startOfTomorrow,
            endOfAtRiskWindow: bounds.endOfAtRiskWindow,
        });

        counts[bucket] += 1;
    }

    const total = memories.length;

    return [
        toMemoryStatusSummaryItem("mastered", "Đã nắm vững", counts.mastered, total),
        toMemoryStatusSummaryItem(
            "active_reviewing",
            "Đang ôn",
            counts.active_reviewing,
            total
        ),
        toMemoryStatusSummaryItem("at_risk", "Sắp quên", counts.at_risk, total),
        toMemoryStatusSummaryItem("overdue", "Quá hạn", counts.overdue, total),
    ];
}

export async function getSuggestedVocabulary(
    userId: string | Types.ObjectId,
    options: {
        page?: number;
        limit?: number;
        search?: string;
        topic?: string;
        level?: string;
        priority?: SuggestionPriority | "all";
        bucket?: MemoryUiBucket | "all";
        sortBy?: "due_at" | "p_recall" | "word";
        sortOrder?: "asc" | "desc";
    }
): Promise<PaginatedSuggestions> {
    const userObjectId = toObjectId(userId, "userId");
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const now = new Date();
    const bounds = getVietnamDateBounds(now);
    const scope = await getLearnedVocabularyScope(userObjectId);
    const memories = await getScopedMemoryRecords(userObjectId, scope.vocabularyIds);
    const vocabularyIds = memories.map((memory) => memory.vocabulary_id);
    const vocabularies = await Vocabulary.find({ _id: { $in: vocabularyIds } }).lean();
    const vocabularyById = new Map(
        vocabularies.map((vocabulary: any) => [String(vocabulary._id), vocabulary])
    );

    const allItems = memories
        .map((memory) => {
            const vocabulary = vocabularyById.get(String(memory.vocabulary_id));
            if (!vocabulary) {
                return null;
            }

            return toSuggestedVocabularyItem({
                memory,
                vocabulary,
                topicMeta: scope.vocabularyTopicMap.get(String(memory.vocabulary_id)),
                now,
                bounds,
            });
        })
        .filter((item): item is SuggestedVocabularyItem => Boolean(item));

    const counters = buildSuggestionCounters(allItems, bounds);
    const filtered = filterSuggestionItems(allItems, options);
    const sorted = sortSuggestionItems(filtered, options.sortBy ?? "due_at", options.sortOrder ?? "asc");
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const items = sorted.slice(startIndex, startIndex + limit);

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages,
        },
        counters,
    };
}

export async function getSuggestionDetail(
    userId: string | Types.ObjectId,
    vocabularyId: string | Types.ObjectId
): Promise<SuggestionDetail | null> {
    const userObjectId = toObjectId(userId, "userId");
    const vocabularyObjectId = toObjectId(vocabularyId, "vocabularyId");
    const now = new Date();
    const bounds = getVietnamDateBounds(now);
    const scope = await getLearnedVocabularyScope(userObjectId);
    const vocabularyKey = String(vocabularyObjectId);

    if (!scope.vocabularyTopicMap.has(vocabularyKey)) {
        return null;
    }

    const [memory, vocabulary] = await Promise.all([
        UserVocabularyMemoryV2.findOne({
            user_id: userObjectId,
            vocabulary_id: vocabularyObjectId,
        }).lean(),
        Vocabulary.findById(vocabularyObjectId).lean(),
    ]);

    if (!memory || !vocabulary) {
        return null;
    }

    const pRecallNow = calculateMemoryPRecall(memory as any, now);
    const priority = resolveSuggestionPriority(pRecallNow);
    const topicMeta = scope.vocabularyTopicMap.get(vocabularyKey);

    return {
        vocabulary_id: vocabularyKey,
        word: (vocabulary as any).word,
        phonetic: (vocabulary as any).phonetic,
        meaning: (vocabulary as any).definition,
        topic_title: topicMeta?.title ?? (vocabulary as any).tags?.[0],
        level: topicMeta?.level,
        priority,
        p_recall: pRecallNow,
        half_life_days: roundNumber((memory as any).half_life_days, 6),
        last_reviewed_at: (memory as any).last_reviewed_at ?? null,
        due_at: (memory as any).due_at ?? null,
        last_response_time_avg_ms: (memory as any).last_response_time_avg ?? null,
        reasons: buildSuggestionReasons({
            now,
            dueAt: (memory as any).due_at ?? null,
            lastReviewedAt: (memory as any).last_reviewed_at ?? null,
            pRecallNow,
            difficulty: (memory as any).difficulty,
            lastHardCount: (memory as any).last_hard_count,
            lastSeenCount: (memory as any).last_seen_count,
            lastDhpRecallResult: (memory as any).last_dhp_recall_result,
            lastResponseTimeAvgMs: (memory as any).last_response_time_avg,
        }),
    };
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

async function getLearnedVocabularyScope(userObjectId: Types.ObjectId): Promise<{
    vocabularyIds: Types.ObjectId[];
    vocabularyTopicMap: Map<string, { topicId: string; title: string; level?: string }>;
}> {
    const topicIds = await FlashCardProgress.distinct("topic_vocabulary_id", {
        user_id: userObjectId,
    });

    if (topicIds.length === 0) {
        return {
            vocabularyIds: [],
            vocabularyTopicMap: new Map(),
        };
    }

    const topics = await TopicVocabulary.find({
        _id: { $in: topicIds },
    })
        .select("_id title level vocabularies_id")
        .lean();

    const vocabularyIdsByKey = new Map<string, Types.ObjectId>();
    const vocabularyTopicMap = new Map<
        string,
        { topicId: string; title: string; level?: string }
    >();

    for (const topic of topics as any[]) {
        for (const vocabularyId of topic.vocabularies_id ?? []) {
            const key = String(vocabularyId);
            if (!vocabularyIdsByKey.has(key)) {
                vocabularyIdsByKey.set(key, new Types.ObjectId(key));
                vocabularyTopicMap.set(key, {
                    topicId: String(topic._id),
                    title: topic.title,
                    level: topic.level,
                });
            }
        }
    }

    return {
        vocabularyIds: Array.from(vocabularyIdsByKey.values()),
        vocabularyTopicMap,
    };
}

async function getScopedMemoryRecords(
    userObjectId: Types.ObjectId,
    vocabularyIds?: Types.ObjectId[]
): Promise<IUserVocabularyMemoryV2[]> {
    const scopedVocabularyIds =
        vocabularyIds ?? (await getLearnedVocabularyScope(userObjectId)).vocabularyIds;

    if (scopedVocabularyIds.length === 0) {
        return [];
    }

    return UserVocabularyMemoryV2.find({
        user_id: userObjectId,
        vocabulary_id: { $in: scopedVocabularyIds },
    }).lean() as any;
}

function calculateMemoryPRecall(
    memory: Pick<IUserVocabularyMemoryV2, "half_life_days" | "last_reviewed_at">,
    now: Date
): number {
    if (!memory.last_reviewed_at) {
        return DHP_CONFIG.MAX_P_RECALL;
    }

    return roundNumber(
        calculateRecallProbability(memory.half_life_days, memory.last_reviewed_at, now),
        6
    );
}

function getVietnamDateBounds(now: Date): {
    startOfToday: Date;
    startOfTomorrow: Date;
    endOfAtRiskWindow: Date;
} {
    const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
    const year = vietnamNow.getUTCFullYear();
    const month = vietnamNow.getUTCMonth();
    const date = vietnamNow.getUTCDate();
    const startOfTodayUtcMs =
        Date.UTC(year, month, date, 0, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
    const startOfToday = new Date(startOfTodayUtcMs);
    const startOfTomorrow = new Date(startOfTodayUtcMs + DAY_MS);
    const endOfAtRiskWindow = new Date(startOfTodayUtcMs + 8 * DAY_MS - 1);

    return {
        startOfToday,
        startOfTomorrow,
        endOfAtRiskWindow,
    };
}

function formatVietnamDateKey(date: Date): string {
    const vietnamDate = new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS);
    const year = vietnamDate.getUTCFullYear();
    const month = String(vietnamDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(vietnamDate.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function resolveScheduleLabel(dayIndex: number): string {
    if (dayIndex === 0) {
        return "Hôm nay";
    }

    if (dayIndex === 1) {
        return "Ngày mai";
    }

    return `Ngày ${dayIndex + 1}`;
}

function toMemoryStatusSummaryItem(
    bucket: MemoryUiBucket,
    label: string,
    count: number,
    total: number
): MemoryStatusSummaryItem {
    return {
        bucket,
        label,
        count,
        percentage: total === 0 ? 0 : roundNumber((count / total) * 100, 2),
    };
}

function toSuggestedVocabularyItem(input: {
    memory: IUserVocabularyMemoryV2;
    vocabulary: any;
    topicMeta?: { topicId: string; title: string; level?: string };
    now: Date;
    bounds: ReturnType<typeof getVietnamDateBounds>;
}): SuggestedVocabularyItem {
    const { memory, vocabulary, topicMeta, now, bounds } = input;
    const pRecallNow = calculateMemoryPRecall(memory, now);
    const priority = resolveSuggestionPriority(pRecallNow);
    const memoryBucket = resolveMemoryUiBucket({
        status: memory.status,
        dueAt: memory.due_at ?? null,
        pRecallNow,
        startOfToday: bounds.startOfToday,
        startOfTomorrow: bounds.startOfTomorrow,
        endOfAtRiskWindow: bounds.endOfAtRiskWindow,
    });

    return {
        id: String(memory._id),
        vocabularyId: String(memory.vocabulary_id),
        word: vocabulary.word,
        phonetic: vocabulary.phonetic,
        meaning: vocabulary.definition,
        type: vocabulary.type,
        topic: topicMeta?.title ?? vocabulary.tags?.[0],
        level: topicMeta?.level,
        priority,
        priorityLabel: resolvePriorityLabel(priority),
        pRecallNow,
        dueAt: memory.due_at ?? null,
        dueLabel: resolveDueLabel(memory.due_at ?? null, bounds),
        memoryBucket,
        status: memory.status,
        halfLifeDays: roundNumber(memory.half_life_days, 6),
        difficulty: memory.difficulty,
        reviewCount: memory.review_count,
        sessionCount: memory.session_count,
    };
}

function resolveSuggestionPriority(pRecallNow: number): SuggestionPriority {
    if (pRecallNow < MEMORY_SUGGESTION_POLICY.PRIORITY_HIGH_P_RECALL_THRESHOLD) {
        return "high";
    }

    if (pRecallNow < MEMORY_SUGGESTION_POLICY.PRIORITY_MEDIUM_P_RECALL_THRESHOLD) {
        return "medium";
    }

    return "low";
}

function resolvePriorityLabel(priority: SuggestionPriority): string {
    if (priority === "high") {
        return "Cao";
    }

    if (priority === "medium") {
        return "Trung bình";
    }

    return "Thấp";
}

function resolveDueLabel(
    dueAt: Date | null,
    bounds: ReturnType<typeof getVietnamDateBounds>
): string {
    if (!dueAt) {
        return "Chưa có lịch";
    }

    if (dueAt < bounds.startOfToday) {
        return "Quá hạn";
    }

    if (dueAt >= bounds.startOfToday && dueAt < bounds.startOfTomorrow) {
        return "Hôm nay";
    }

    const dayDiff = Math.floor(
        (dueAt.getTime() - bounds.startOfToday.getTime()) / DAY_MS
    );

    if (dayDiff === 1) {
        return "Ngày mai";
    }

    return `${dayDiff} ngày tới`;
}

function buildSuggestionCounters(
    items: SuggestedVocabularyItem[],
    bounds: ReturnType<typeof getVietnamDateBounds>
): PaginatedSuggestions["counters"] {
    return items.reduce(
        (counters, item) => {
            counters.all += 1;

            if (item.memoryBucket === "mastered") {
                counters.mastered += 1;
            }

            if (item.memoryBucket === "overdue") {
                counters.overdue += 1;
            }

            if (
                item.dueAt &&
                item.dueAt >= bounds.startOfToday &&
                item.dueAt < bounds.startOfTomorrow &&
                item.status !== "mastered"
            ) {
                counters.dueToday += 1;
            }

            if (item.memoryBucket === "at_risk") {
                counters.atRisk += 1;
            }

            return counters;
        },
        {
            all: 0,
            dueToday: 0,
            atRisk: 0,
            overdue: 0,
            mastered: 0,
        }
    );
}

function filterSuggestionItems(
    items: SuggestedVocabularyItem[],
    options: {
        search?: string;
        topic?: string;
        level?: string;
        priority?: SuggestionPriority | "all";
        bucket?: MemoryUiBucket | "all";
    }
): SuggestedVocabularyItem[] {
    const search = options.search?.trim().toLowerCase();

    return items.filter((item) => {
        if (
            search &&
            !item.word.toLowerCase().includes(search) &&
            !item.meaning?.toLowerCase().includes(search)
        ) {
            return false;
        }

        if (options.topic && options.topic !== "all" && item.topic !== options.topic) {
            return false;
        }

        if (options.level && options.level !== "all" && item.level !== options.level) {
            return false;
        }

        if (
            options.priority &&
            options.priority !== "all" &&
            item.priority !== options.priority
        ) {
            return false;
        }

        if (
            options.bucket &&
            options.bucket !== "all" &&
            item.memoryBucket !== options.bucket
        ) {
            return false;
        }

        return true;
    });
}

function sortSuggestionItems(
    items: SuggestedVocabularyItem[],
    sortBy: "due_at" | "p_recall" | "word",
    sortOrder: "asc" | "desc"
): SuggestedVocabularyItem[] {
    const direction = sortOrder === "asc" ? 1 : -1;

    return [...items].sort((a, b) => {
        if (sortBy === "word") {
            return a.word.localeCompare(b.word) * direction;
        }

        if (sortBy === "p_recall") {
            return (a.pRecallNow - b.pRecallNow) * direction;
        }

        const aTime = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;

        return (aTime - bTime) * direction;
    });
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
