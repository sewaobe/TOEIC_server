import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { createLessonManagerService, deleteLessonManagerService, getAllLessonManagerService, getAllTopicTitlesService, getLessonManagerByIdService, updateLessonManagerService } from "../services/lesson_manager.service";

export const getAllTopicTitlesController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const topics = await getAllTopicTitlesService();
        res.status(200).json(
            ApiResponse.success(topics, "Fetched topic titles successfully")
        )
    }
    catch (err) {
        next(err);
    }
}

export const getAllLessonManagerController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const userId = req.user._id;

        const result = await getAllLessonManagerService(page, limit, userId);

        res.status(200).json(
            ApiResponse.success(result.data, "Fetched lesson managers successfully", result.pagination)
        );
    }
    catch (err) {
        next(err);
    }
}

export const getLessonManagerByIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lessonManagerId = req.params.id;
        const userId = req.user._id;
        const lessonManager = await getLessonManagerByIdService(lessonManagerId, userId);
        res.status(200).json(
            ApiResponse.success(lessonManager, "Fetched lesson manager successfully")
        );
    }
    catch (err) {
        next(err);
    }
}

export const createLessonManagerController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const payload = req.body;
        const result = await createLessonManagerService(payload, userId);
        res.status(201).json(
            ApiResponse.success(result, "Created lesson manager successfully")
        );
    }
    catch (err) {
        next(err);
    }
}

export const updateLessonManagerController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.user._id;
        const lessonManagerId = req.params.id;
        const payload = req.body;
        const result = await updateLessonManagerService(payload, lessonManagerId, userId);

        res.status(200).json(
            ApiResponse.success(result, "Updated lesson manager successfully")
        );
    }
    catch (err) {
        next(err);
    }
}

export const deleteLessonManagerController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const lessonManagerId = req.params.id;
        const userId = req.user._id;

        const result = await deleteLessonManagerService(lessonManagerId, userId);

        res.status(200).json(
            ApiResponse.success(result, "Deleted lesson manager successfully")
        );
    }
    catch (err) {
        next(err);
    }
}