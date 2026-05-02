export const DHP_CONFIG = {
    DIFFICULTY_MIN: 1,
    DIFFICULTY_MAX: 18,
    MASTERED_HALF_LIFE_DAYS: 90,
    MIN_P_RECALL: 0.0001,
    MAX_P_RECALL: 0.9999,
} as const;

export function clampDifficulty(difficulty: number): number {
    return Math.max(
        DHP_CONFIG.DIFFICULTY_MIN,
        Math.min(DHP_CONFIG.DIFFICULTY_MAX, Math.round(difficulty))
    );
}

export function clampPRecall(pRecall: number): number {
    return Math.max(
        DHP_CONFIG.MIN_P_RECALL,
        Math.min(DHP_CONFIG.MAX_P_RECALL, pRecall)
    );
}

export function log2(value: number): number {
    return Math.log(value) / Math.log(2);
}

export function calStartHalflife(difficulty: number): number {
    const d = clampDifficulty(difficulty);
    const p = Math.max(0.925 - 0.05 * d, 0.025);

    return -1 / log2(p);
}

export function calRecallHalflife(
    difficulty: number,
    halflifeDays: number,
    pRecall: number
): number {
    const d = clampDifficulty(difficulty);
    const h = Math.max(halflifeDays, 0.0001);
    const p = clampPRecall(pRecall);

    return (
        h *
        (1 +
            Math.exp(3.81) *
            Math.pow(d, -0.534) *
            Math.pow(h, -0.127) *
            Math.pow(1 - p, 0.97))
    );
}

export function calForgetHalflife(
    difficulty: number,
    halflifeDays: number,
    pRecall: number
): number {
    const d = clampDifficulty(difficulty);
    const h = Math.max(halflifeDays, 0.0001);
    const p = clampPRecall(pRecall);

    return (
        Math.exp(-0.041) *
        Math.pow(d, -0.041) *
        Math.pow(h, 0.377) *
        Math.pow(1 - p, -0.227)
    );
}

export function calculateRecallProbability(
    halflifeDays: number,
    lastReviewedAt: Date,
    now: Date
): number {
    const h = Math.max(halflifeDays, 0.0001);

    const deltaMs = now.getTime() - lastReviewedAt.getTime();
    const deltaDays = deltaMs / (1000 * 60 * 60 * 24);

    if (deltaDays <= 0) {
        return DHP_CONFIG.MAX_P_RECALL;
    }

    return clampPRecall(Math.pow(2, -deltaDays / h));
}

export function resolveMemoryStatus(
    halfLifeDays: number
): "learning" | "reviewing" | "mastered" {
    if (halfLifeDays >= DHP_CONFIG.MASTERED_HALF_LIFE_DAYS) {
        return "mastered";
    }

    return "reviewing";
}