import { LegacyFlashcardEvalType } from "../types/flashcardFeedback.type";

export type FlashcardEvalType = LegacyFlashcardEvalType;

export type DhpRecallResult = "remembered" | "forgot";

export interface FlashcardSessionLog {
    vocab_id: string;
    vocab_word?: string;
    eval_type: FlashcardEvalType;
    response_time: number; // milliseconds
    attempted_at: string;
}

export interface VocabularySessionSummary {
    vocabularyId: string;

    seenCount: number;
    hardCount: number;
    mediumCount: number;
    easyCount: number;
    skipCount: number;

    firstAttemptedAt: Date;
    lastAttemptedAt: Date;

    totalResponseTimeMs: number;
    avgResponseTimeMs: number;

    learningEffort: number;
    initialDifficulty: number;

    recallFailureScore: number;
    dhpRecallResult: DhpRecallResult;
}

const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 18;
const RECALL_FORGOT_THRESHOLD = 6;

export function summarizeFlashcardLogs(
    logs: FlashcardSessionLog[]
): VocabularySessionSummary[] {
    const grouped = new Map<string, FlashcardSessionLog[]>();

    for (const log of logs) {
        if (!log.vocab_id) continue;

        const current = grouped.get(log.vocab_id) ?? [];
        current.push(log);
        grouped.set(log.vocab_id, current);
    }

    const summaries: VocabularySessionSummary[] = [];

    for (const [vocabularyId, vocabLogs] of grouped.entries()) {
        const sortedLogs = [...vocabLogs].sort(
            (a, b) =>
                new Date(a.attempted_at).getTime() -
                new Date(b.attempted_at).getTime()
        );

        if (sortedLogs.length === 0) continue;

        const hardCount = countEval(sortedLogs, "hard");
        const mediumCount = countEval(sortedLogs, "medium");
        const easyCount = countEval(sortedLogs, "easy");
        const skipCount = countEval(sortedLogs, "skip");

        const seenCount = sortedLogs.length;

        const totalResponseTimeMs = sortedLogs.reduce(
            (sum, log) => sum + safeNonNegativeNumber(log.response_time),
            0
        );

        const avgResponseTimeMs =
            seenCount > 0 ? totalResponseTimeMs / seenCount : 0;

        const learningEffort = calculateLearningEffort({
            hardCount,
            mediumCount,
            easyCount,
            seenCount,
            avgResponseTimeMs,
        });

        const initialDifficulty = mapEffortToDifficulty(learningEffort);

        const recallFailureScore = calculateRecallFailureScore({
            hardCount,
            mediumCount,
            easyCount,
            seenCount,
        });

        const dhpRecallResult = inferDhpRecallResult({
            hardCount,
            mediumCount,
            easyCount,
            seenCount,
        });

        summaries.push({
            vocabularyId,
            seenCount,
            hardCount,
            mediumCount,
            easyCount,
            skipCount,
            firstAttemptedAt: new Date(sortedLogs[0].attempted_at),
            lastAttemptedAt: new Date(sortedLogs[sortedLogs.length - 1].attempted_at),
            totalResponseTimeMs,
            avgResponseTimeMs,
            learningEffort,
            initialDifficulty,
            recallFailureScore,
            dhpRecallResult
        });
    }

    return summaries;
}

function countEval(
    logs: FlashcardSessionLog[],
    evalType: FlashcardEvalType
): number {
    return logs.filter((log) => log.eval_type === evalType).length;
}

function calculateLearningEffort(input: {
    hardCount: number;
    mediumCount: number;
    easyCount: number;
    seenCount: number;
    avgResponseTimeMs: number;
}): number {
    const {
        hardCount,
        mediumCount,
        easyCount,
        seenCount,
        avgResponseTimeMs,
    } = input;

    /**
     * Ý nghĩa:
     * - hard: tín hiệu khó mạnh nhất
     * - medium: khó vừa
     * - easy: vẫn chưa remove khỏi session, nên tính effort nhẹ
     * - skip: không cộng effort vì đây là hành động kết thúc card
     */
    const buttonEffort =
        hardCount * 4 +
        mediumCount * 2 +
        easyCount * 1;

    /**
     * seenCount càng nhiều nghĩa là user cần nhiều lượt hơn mới kết thúc card.
     */
    const repeatEffort = Math.max(0, seenCount - 1) * 1.5;

    /**
     * response_time là milliseconds.
     * Mình scale nhẹ để response time không áp đảo nút bấm.
     *
     * Ví dụ:
     * avg 5s  -> +1
     * avg 10s -> +2
     * avg 15s trở lên -> max +3
     */
    const avgSeconds = avgResponseTimeMs / 1000;
    const responseEffort = Math.min(avgSeconds / 5, 3);

    return buttonEffort + repeatEffort + responseEffort;
}

function mapEffortToDifficulty(learningEffort: number): number {
    /**
     * Mapping v1:
     * - skip ngay lần đầu thường effort rất thấp → difficulty khoảng 3
     * - hard/medium nhiều lần → difficulty tăng dần
     */
    if (learningEffort <= 0.5) return 3;
    if (learningEffort <= 2) return 5;
    if (learningEffort <= 4) return 7;
    if (learningEffort <= 7) return 10;
    if (learningEffort <= 11) return 13;
    if (learningEffort <= 16) return 16;

    return 18;
}

function safeNonNegativeNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function clampDifficulty(difficulty: number): number {
    return Math.max(
        DIFFICULTY_MIN,
        Math.min(DIFFICULTY_MAX, Math.round(difficulty))
    );
}

export function calculateRecallFailureScore(input: {
    hardCount: number;
    mediumCount: number;
    easyCount: number;
    seenCount: number;
}): number {
    const { hardCount, mediumCount, easyCount, seenCount } = input;

    const buttonFailureScore =
        hardCount * 3 +
        mediumCount * 2 +
        easyCount * 0.5;

    const repeatPenalty = Math.max(0, seenCount - 1) * 0.5;

    return buttonFailureScore + repeatPenalty;
}

export function inferDhpRecallResult(input: {
    hardCount: number;
    mediumCount: number;
    easyCount: number;
    seenCount: number;
}): DhpRecallResult {
    const score = calculateRecallFailureScore(input);

    return score >= RECALL_FORGOT_THRESHOLD ? "forgot" : "remembered";
}


// const summaries = summarizeFlashcardLogs([
//     {
//         vocab_id: "v1",
//         vocab_word: "apple",
//         eval_type: "hard",
//         response_time: 5000,
//         attempted_at: new Date("2026-05-02T10:00:00Z").toISOString(),
//     },
//     {
//         vocab_id: "v1",
//         vocab_word: "apple",
//         eval_type: "medium",
//         response_time: 3000,
//         attempted_at: new Date("2026-05-02T10:01:00Z").toISOString(),
//     },
//     {
//         vocab_id: "v1",
//         vocab_word: "apple",
//         eval_type: "skip",
//         response_time: 1000,
//         attempted_at: new Date("2026-05-02T10:02:00Z").toISOString(),
//     },
//     {
//         vocab_id: "v2",
//         vocab_word: "book",
//         eval_type: "skip",
//         response_time: 1000,
//         attempted_at: new Date("2026-05-02T10:03:00Z").toISOString(),
//     },
// ]);
// console.log(summaries);
