import {
  FlashCardAttempt,
  IFlashCardAttempt,
} from "./../models/flashcard_attempt.model";
import { Vocabulary } from "./../models/vocabulary";
import { NextFunction, Request, Response } from "express";
import {
  getFlashCardByIdService,
  getHistoryFlashCardByTopicService,
  submitFlashCardService,
} from "../services/flashCard.service";
import { ApiResponse } from "../utils/ApiResponse";
import { completeActivityAndUnlockNext } from "../services/day_study.service";
import { Types } from "mongoose";

export const getFlashCardById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const flashCard: any = await getFlashCardByIdService(req.params.id);
    console.log(flashCard);
    console.log(flashCard[0]?.topic[0]?.vocabularies);
    const vocab =
      flashCard[0]?.topic[0]?.vocabularies || flashCard[0]?.topic?.vocabularies;
    res.status(200).json(
      ApiResponse.success(vocab, "Get flash card successfully!", {
        topic_id: flashCard[0]?.topic[0]?._id,
      })
    );
  } catch (err) {
    next(err);
  }
};

export const submitFlashCard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { flashCardAttempt, logs, dayStudyId, activityId } = req.body;
    const user_id = req.user._id;

    // Chuyển logs về đúng cấu trúc của field "results"
    const results = logs.map((log: any) => ({
      vocabulary_id: new Types.ObjectId(log.vocab_id),
      eval_type: log.eval_type,
      response_time: log.response_time,
    }));

    // Gom dữ liệu đúng theo IFlashCardAttempt
    const flashCardAttemptFull: IFlashCardAttempt = {
      user_id: new Types.ObjectId(user_id),
      topic_vocabulary_id: new Types.ObjectId(flashCardAttempt.topic_id),
      results,
      accuracy: flashCardAttempt.accuracy,
      started_at: new Date(flashCardAttempt.started_at),
      finished_at: flashCardAttempt.finished_at
        ? new Date(flashCardAttempt.finished_at)
        : undefined,
    } as IFlashCardAttempt;

    const result = await submitFlashCardService(flashCardAttemptFull);

    if (!result)
      res.status(404).json(ApiResponse.fail("Submit Flash card thất bại"));

    // Unlock bài tiếp theo
    // await completeActivityAndUnlockNext(dayStudyId, activityId)

    res
      .status(201)
      .json(ApiResponse.success(result, "Submit Flash card thành công"));
  } catch (err) {
    next(err);
  }
};

export const getHistoryFlashCardByTopic = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { topicId } = req.params;
    const userId = req.user._id;
    if (!topicId) {
      return res.status(400).json(ApiResponse.fail("Topic Id error"));
    }

    const history = await getHistoryFlashCardByTopicService(topicId, userId);

    res
      .status(200)
      .json(
        ApiResponse.success(
          history,
          "Lấy lịch sử làm bài của topic thành công!"
        )
      );
  } catch (err) {
    next(err);
  }
};
