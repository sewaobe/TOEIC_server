const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getVietnamDateBounds(now: Date): {
    startOfToday: Date;
    startOfTomorrow: Date;
} {
    const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
    const year = vietnamNow.getUTCFullYear();
    const month = vietnamNow.getUTCMonth();
    const date = vietnamNow.getUTCDate();
    const startOfTodayUtcMs =
        Date.UTC(year, month, date, 0, 0, 0, 0) - VIETNAM_UTC_OFFSET_MS;
    const startOfToday = new Date(startOfTodayUtcMs);
    const startOfTomorrow = new Date(startOfTodayUtcMs + DAY_MS);

    return {
        startOfToday,
        startOfTomorrow,
    };
}

export function isBeforeStartOfVietnamToday(date: Date, now: Date): boolean {
    return date.getTime() < getVietnamDateBounds(now).startOfToday.getTime();
}
