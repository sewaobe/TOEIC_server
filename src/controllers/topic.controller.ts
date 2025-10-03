import { NextFunction, Request, Response } from "express";
import { ITopic } from "../models";
import { getTopicByIdService } from "../services/topic.service";
import { ApiResponse } from "../utils/ApiResponse";

export const getAllTopicOfCollaborator = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { topicId } = req.body;
        const topics: ITopic[] | null = await getTopicByIdService(topicId);

        if (!topics) {
            res.status(404).json(ApiResponse.fail("Lấy danh sách chủ đề từ vựng thất bại!"));
        }

        res.status(200).json(ApiResponse.success(topics, "Lấy danh sách chủ đề từ vựng thành công",))
    }
    catch (err) {
        next(err);
    }
}