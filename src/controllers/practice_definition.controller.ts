import { NextFunction, Request, Response } from "express";
import {
    getAllPracticeDefinitionTopicsService,
    getPracticeDefinitionTopicByIdService,
    getVocabularyWordsByTopicService,
    getRandomVocabularyWordsService
} from "../services/practice_definition.service";
import { ApiResponse } from "../utils/ApiResponse";

/**
 * Lấy danh sách topics cho Definition practice
 */
export const getAllPracticeDefinitionTopicsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const level = req.query.level as string;
        const search = req.query.search as string;
        const isPublic = req.query.isPublic === "true";
        const created_by = req.query.created_by as string;

        const result = await getAllPracticeDefinitionTopicsService(page, limit, {
            level,
            search,
            isPublic,
            created_by
        });

        res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách topics thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Lấy chi tiết 1 topic
 */
export const getPracticeDefinitionTopicByIdController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { topicId } = req.params;

        const result = await getPracticeDefinitionTopicByIdService(topicId);

        if (!result) {
            return res.status(404).json(
                ApiResponse.fail("Topic không tồn tại.")
            );
        }

        res.status(200).json(
            ApiResponse.success(result, "Lấy chi tiết topic thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Lấy danh sách vocabulary words của topic
 */
export const getVocabularyWordsByTopicController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { topicId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const result = await getVocabularyWordsByTopicService(topicId, page, limit);

        res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách từ vựng thành công.")
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Lấy random words để luyện tập
 */
export const getRandomVocabularyWordsController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { topicId } = req.params;
        const count = parseInt(req.query.count as string) || 10;

        const result = await getRandomVocabularyWordsService(topicId, count);

        res.status(200).json(
            ApiResponse.success(result, "Lấy danh sách từ vựng random thành công.")
        );
    } catch (err) {
        next(err);
    }
};
