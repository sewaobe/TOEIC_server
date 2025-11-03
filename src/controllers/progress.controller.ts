import { NextFunction, Request, Response } from "express";

import { ApiResponse } from "../utils/ApiResponse";
import { getTotalScoreTestInMonth, getTotalUserTestInMonth, getSkillsOverview, getSkillActivities, getPartAccuracyStats } from "../services/progress.service";

export const getTotalScoreTestInMonthController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;

        const overview = await getTotalScoreTestInMonth(userId);

        res.status(200).json(
            ApiResponse.success(overview, "Lấy thống kê tiến độ học tập thành công")
        )
    } catch (error) {
        next(error);
    }
}

export const getTotalUserTestInMonthController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const year = req.query.year ? Number(req.query.year) : undefined;
        const month = req.query.month ? (req.query.month === "all" ? "all" : Number(req.query.month)) : undefined;

        const userTests = await getTotalUserTestInMonth(userId, year, month);

        res.status(200).json(
            ApiResponse.success(userTests, "Lấy thống kê tiến độ học tập thành công")
        )
    } catch (error) {
        next(error);
    }
}

// 🎯 Controller: Lấy tổng quan progress 4 kỹ năng
export const getSkillsOverviewController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const skillsProgress = await getSkillsOverview(userId);

        res.status(200).json(
            ApiResponse.success(skillsProgress, "Lấy tổng quan kỹ năng thành công")
        );
    } catch (error) {
        next(error);
    }
};

// 📋 Controller: Lấy chi tiết activities của 1 skill
export const getSkillActivitiesController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const { skillType } = req.params as { skillType: "listening" | "reading" | "vocabulary" | "speaking" };

        // Validate skillType
        const validSkills = ["listening", "reading", "vocabulary", "speaking"];
        if (!validSkills.includes(skillType)) {
            return res.status(400).json(
                ApiResponse.fail("Loại kỹ năng không hợp lệ. Chỉ chấp nhận: listening, reading, vocabulary, speaking")
            );
        }

        const activities = await getSkillActivities(userId, skillType);

        res.status(200).json(
            ApiResponse.success(activities, `Lấy lịch sử luyện tập ${skillType} thành công`)
        );
    } catch (error) {
        next(error);
    }
};

// 📊 Controller: Lấy độ chính xác từng Part
export const getPartAccuracyStatsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const year = req.query.year ? Number(req.query.year) : undefined;
        const month = req.query.month ? (req.query.month === "all" ? "all" : Number(req.query.month)) : undefined;

        const stats = await getPartAccuracyStats(userId, year, month);

        res.status(200).json(
            ApiResponse.success(stats, "Lấy thống kê độ chính xác từng Part thành công")
        );
    } catch (error) {
        next(error);
    }
};