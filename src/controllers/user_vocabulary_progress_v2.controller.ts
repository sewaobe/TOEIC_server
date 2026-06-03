import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
    getSuggestionFilterOptions,
    getMemoryStatusSummary,
    getReviewSchedule,
    SuggestionBucket,
    getSuggestionDetail,
    getSuggestedVocabulary,
    getTodayReviewSummary,
} from "../services/user_vocabulary_progress_v2.service";

export const getTodayReviewSummaryController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json(ApiResponse.fail("Unauthorized"));
        }

        const data = await getTodayReviewSummary(userId);

        return res
            .status(200)
            .json(ApiResponse.success(data, "Lấy tổng quan ôn tập hôm nay thành công"));
    } catch (error) {
        next(error);
    }
};

export const getReviewScheduleController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json(ApiResponse.fail("Unauthorized"));
        }

        const rangeDays = parseRangeDays(req.query.rangeDays as string);
        if (!rangeDays) {
            return res
                .status(400)
                .json(ApiResponse.fail("rangeDays must be 7, 14 or 30"));
        }

        const data = await getReviewSchedule(userId, rangeDays);

        return res
            .status(200)
            .json(ApiResponse.success(data, "Lấy lộ trình ôn tập thành công"));
    } catch (error) {
        next(error);
    }
};

export const getMemoryStatusSummaryController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json(ApiResponse.fail("Unauthorized"));
        }

        const data = await getMemoryStatusSummary(userId);

        return res
            .status(200)
            .json(ApiResponse.success(data, "Lấy trạng thái ghi nhớ thành công"));
    } catch (error) {
        next(error);
    }
};

export const getSuggestedVocabularyController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json(ApiResponse.fail("Unauthorized"));
        }

        const page = parsePositiveInteger(req.query.page as string, 1);
        const limit = parsePositiveInteger(req.query.limit as string, 20);

        if (limit < 1 || limit > 100) {
            return res
                .status(400)
                .json(ApiResponse.fail("limit must be between 1 and 100"));
        }

        const bucket = parseBucket(req.query.bucket as string);
        if (!bucket) {
            return res.status(400).json(
                ApiResponse.fail(
                    "bucket must be all, due_today, due_now, upcoming_today, mastered, active_reviewing or overdue"
                )
            );
        }

        const sortBy = parseSortBy(req.query.sortBy as string);
        if (!sortBy) {
            return res
                .status(400)
                .json(ApiResponse.fail("sortBy must be due_at, p_recall or word"));
        }

        const sortOrder = parseSortOrder(req.query.sortOrder as string);
        if (!sortOrder) {
            return res
                .status(400)
                .json(ApiResponse.fail("sortOrder must be asc or desc"));
        }

        const data = await getSuggestedVocabulary(userId, {
            page,
            limit,
            search: req.query.search as string,
            topic: req.query.topic as string,
            level: req.query.level as string,
            bucket,
            sortBy,
            sortOrder,
        });

        return res
            .status(200)
            .json(ApiResponse.success(data, "Lấy từ vựng gợi ý thành công"));
    } catch (error) {
        next(error);
    }
};

export const getSuggestionFilterOptionsController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json(ApiResponse.fail("Unauthorized"));
        }

        const data = await getSuggestionFilterOptions(userId);

        return res
            .status(200)
            .json(ApiResponse.success(data, "Lấy filter options cho bảng gợi ý từ vựng thành công"));
    } catch (error) {
        next(error);
    }
};

export const getSuggestionDetailController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json(ApiResponse.fail("Unauthorized"));
        }

        const vocabularyId = req.params.vocabulary_id;
        if (!vocabularyId) {
            return res
                .status(400)
                .json(ApiResponse.fail("vocabulary_id is required"));
        }

        const data = await getSuggestionDetail(userId, vocabularyId);
        if (!data) {
            return res
                .status(404)
                .json(ApiResponse.fail("Suggestion detail not found"));
        }

        return res
            .status(200)
            .json(ApiResponse.success(data, "Lấy chi tiết gợi ý thành công"));
    } catch (error) {
        next(error);
    }
};

function getAuthenticatedUserId(req: Request): string | undefined {
    return (req as any).user?.id || (req as any).user?._id;
}

function parseRangeDays(value?: string): 7 | 14 | 30 | undefined {
    if (!value) {
        return 7;
    }

    const parsed = Number(value);
    if (parsed === 7 || parsed === 14 || parsed === 30) {
        return parsed;
    }

    return undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);

    if (!value || !Number.isInteger(parsed) || parsed < 1) {
        return fallback;
    }

    return parsed;
}

function parseBucket(value?: string): SuggestionBucket | undefined {
    if (!value) {
        return "all";
    }

    if (
        value === "all" ||
        value === "due_today" ||
        value === "due_now" ||
        value === "upcoming_today" ||
        value === "mastered" ||
        value === "active_reviewing" ||
        value === "overdue"
    ) {
        return value;
    }

    return undefined;
}

function parseSortBy(value?: string): "due_at" | "p_recall" | "word" | undefined {
    if (!value) {
        return "due_at";
    }

    if (value === "due_at" || value === "p_recall" || value === "word") {
        return value;
    }

    return undefined;
}

function parseSortOrder(value?: string): "asc" | "desc" | undefined {
    if (!value) {
        return "asc";
    }

    if (value === "asc" || value === "desc") {
        return value;
    }

    return undefined;
}
