export type SuggestionReasonCode =
    | "OVERDUE"
    | "DUE_TODAY"
    | "UPCOMING_DUE"
    | "LOW_RECALL_PROBABILITY"
    | "LAST_SESSION_RECALL_FAILURE"
    | "LAST_DHP_FORGOT"
    | "HIGH_DIFFICULTY"
    | "REPEATED_IN_LAST_SESSION"
    | "LONG_RESPONSE_TIME";

export type SuggestionSeverity = "high" | "medium" | "low";

export interface SuggestionReason {
    code: SuggestionReasonCode;
    title: string;
    description: string;
    severity: SuggestionSeverity;
}

export interface BuildSuggestionReasonsInput {
    now: Date;
    dueAt?: Date | null;
    lastReviewedAt?: Date | null;
    pRecallNow?: number | null;
    difficulty?: number | null;
    lastRecallFailureCount?: number | null;
    lastSeenCount?: number | null;
    lastDhpRecallResult?: "remembered" | "forgot" | null;
    lastResponseTimeAvgMs?: number | null;
}

const LOW_RECALL_THRESHOLD = 0.5;
const HIGH_DIFFICULTY_THRESHOLD = 13;
const REPEATED_SEEN_THRESHOLD = 3;
const LONG_RESPONSE_TIME_MS = 5000;
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const REASON_RANK: Record<SuggestionReasonCode, number> = {
    OVERDUE: 100,
    DUE_TODAY: 95,
    LOW_RECALL_PROBABILITY: 90,
    LAST_DHP_FORGOT: 85,
    LAST_SESSION_RECALL_FAILURE: 80,
    HIGH_DIFFICULTY: 70,
    REPEATED_IN_LAST_SESSION: 65,
    LONG_RESPONSE_TIME: 55,
    UPCOMING_DUE: 50,
};

export function buildSuggestionReasons(
    input: BuildSuggestionReasonsInput
): SuggestionReason[] {
    const reasons: SuggestionReason[] = [];
    const dueAt = input.dueAt ?? null;

    if (dueAt) {
        if (isBeforeStartOfVietnamToday(dueAt, input.now)) {
            reasons.push({
                code: "OVERDUE",
                title: "Đã quá hạn ôn tập",
                description: "Từ này đã vượt lịch ôn dự kiến, nên được ưu tiên ôn lại.",
                severity: "high",
            });
        } else if (isSameVietnamDay(dueAt, input.now)) {
            reasons.push({
                code: "DUE_TODAY",
                title: "Đã đến thời điểm ôn lại",
                description: "Từ này được lên lịch ôn vào hôm nay để duy trì trí nhớ.",
                severity: "high",
            });
        } else if (isWithinNextVietnamDays(dueAt, input.now, 3)) {
            reasons.push({
                code: "UPCOMING_DUE",
                title: "Sắp đến hạn ôn tập",
                description: "Từ này sẽ đến hạn trong vài ngày tới, bạn có thể ôn sớm nếu muốn.",
                severity: "low",
            });
        }
    }

    if (
        typeof input.pRecallNow === "number" &&
        Number.isFinite(input.pRecallNow) &&
        input.pRecallNow < LOW_RECALL_THRESHOLD
    ) {
        reasons.push({
            code: "LOW_RECALL_PROBABILITY",
            title: "Nguy cơ quên cao",
            description: `Hệ thống ước tính bạn chỉ còn nhớ khoảng ${formatPercent(
                input.pRecallNow
            )}, nên cần ôn sớm.`,
            severity: "high",
        });
    }

    if (input.lastDhpRecallResult === "forgot") {
        reasons.push({
            code: "LAST_DHP_FORGOT",
            title: "Phiên gần nhất cho thấy trí nhớ chưa ổn định",
            description: "Kết quả học gần nhất được hệ thống xem là chưa nhớ chắc.",
            severity: "medium",
        });
    }

    if ((input.lastRecallFailureCount ?? 0) > 0) {
        reasons.push({
            code: "LAST_SESSION_RECALL_FAILURE",
            title: "Bạn từng gặp khó với từ này",
            description: "Trong lần ôn gần nhất, phản hồi của bạn cho thấy khả năng nhớ chưa chắc.",
            severity: "medium",
        });
    }

    if (
        typeof input.difficulty === "number" &&
        input.difficulty >= HIGH_DIFFICULTY_THRESHOLD
    ) {
        reasons.push({
            code: "HIGH_DIFFICULTY",
            title: "Từ này có độ khó cao với bạn",
            description: "Mức difficulty hiện tại cao hơn nhiều từ khác trong danh sách.",
            severity: "medium",
        });
    }

    if ((input.lastSeenCount ?? 0) >= REPEATED_SEEN_THRESHOLD) {
        reasons.push({
            code: "REPEATED_IN_LAST_SESSION",
            title: "Bạn đã phải ôn lại nhiều lần trong phiên trước",
            description: "Từ này từng xuất hiện nhiều lần trước khi bạn hoàn thành phiên học.",
            severity: "medium",
        });
    }

    if (
        typeof input.lastResponseTimeAvgMs === "number" &&
        input.lastResponseTimeAvgMs >= LONG_RESPONSE_TIME_MS
    ) {
        reasons.push({
            code: "LONG_RESPONSE_TIME",
            title: "Bạn mất nhiều thời gian với từ này",
            description: "Thời gian phản hồi trung bình ở lần học gần nhất khá cao.",
            severity: "low",
        });
    }

    return pickTopReasons(dedupeReasons(reasons), 3);
}

function pickTopReasons(
    reasons: SuggestionReason[],
    limit: number
): SuggestionReason[] {
    return [...reasons]
        .sort((a, b) => REASON_RANK[b.code] - REASON_RANK[a.code])
        .slice(0, limit);
}

function dedupeReasons(reasons: SuggestionReason[]): SuggestionReason[] {
    const seen = new Set<SuggestionReasonCode>();
    const result: SuggestionReason[] = [];

    for (const reason of reasons) {
        if (seen.has(reason.code)) {
            continue;
        }

        seen.add(reason.code);
        result.push(reason);
    }

    return result;
}

function isSameVietnamDay(a: Date, b: Date): boolean {
    return startOfVietnamDay(a).getTime() === startOfVietnamDay(b).getTime();
}

function isBeforeStartOfVietnamToday(date: Date, now: Date): boolean {
    return date.getTime() < startOfVietnamDay(now).getTime();
}

function isWithinNextVietnamDays(date: Date, now: Date, days: number): boolean {
    const startTomorrow = addDays(startOfVietnamDay(now), 1);
    const end = addDays(startOfVietnamDay(now), days + 1);

    return date.getTime() >= startTomorrow.getTime() && date.getTime() < end.getTime();
}

function startOfVietnamDay(date: Date): Date {
    const vietnamDate = new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS);
    const year = vietnamDate.getUTCFullYear();
    const month = vietnamDate.getUTCMonth();
    const day = vietnamDate.getUTCDate();

    return new Date(Date.UTC(year, month, day) - VIETNAM_UTC_OFFSET_MS);
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * DAY_MS);
}

function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
}
