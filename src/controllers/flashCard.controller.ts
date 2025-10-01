import { FlashCardAttempt, IFlashCardAttempt } from './../models/flashcard_attempt.model';
import { Vocabulary } from './../models/vocabulary';
import { NextFunction, Request, Response } from "express";
import { getFlashCardByIdService, getHistoryFlashCardByTopicService, submitFlashCardService } from "../services/flashCard.service";
import { ApiResponse } from "../utils/ApiResponse";
import { IFlashCardAttemptDetail } from '../models/flashcard_attempt_detail.model';
import { completeActivityAndUnlockNext } from '../services/day_study.service';

export const getFlashCardById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const flashCard: any = await getFlashCardByIdService(req.params.id);
        res.status(200).json(ApiResponse.success(flashCard[0]?.topic?.vocabularies, "Get flash card successfully!", {
            topic_id: flashCard[0]?.topic?._id
        }));
    } catch (err) {
        next(err);
    }
}

export const submitFlashCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { flashCardAttempt, logs, dayStudyId, activityId } = req.body;
        console.log(dayStudyId, activityId)
        const user_id = req.user._id;
        console.log(user_id);
        const flashCardAttemptFull: IFlashCardAttempt = {
            ...flashCardAttempt,
            user_id
        }
        const result = await submitFlashCardService(flashCardAttemptFull, logs as IFlashCardAttemptDetail[]);

        if (!result) res.status(404).json(ApiResponse.fail("Submit Flash card thất bại"))

        // Unlock bài tiếp theo
        await completeActivityAndUnlockNext(dayStudyId, activityId)

        res.status(201).json(ApiResponse.success(null, "Submit Flash card thành công"));
    } catch (err) {
        next(err)
    }
}

export const getHistoryFlashCardByTopic = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { topicId } = req.params;
        const userId = req.user._id;
        if (!topicId) {
            return res
                .status(400)
                .json(ApiResponse.fail("Topic Id error"));
        }

        const history = await getHistoryFlashCardByTopicService(topicId, userId);

        res.status(200).json(ApiResponse.success(history, "Lấy lịch sử làm bài của topic thành công!"));
    } catch (err) {
        next(err);
    }
}