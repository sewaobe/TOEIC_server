import { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { getAllTopicTitlesService } from "../services/lesson_manager.service";

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