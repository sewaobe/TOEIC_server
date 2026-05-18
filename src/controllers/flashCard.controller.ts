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
  submitFlashCardGameService,
} from "../services/flashCard.service";
import { ApiResponse } from "../utils/ApiResponse";
import { completeActivityAndUnlockNext } from "../services/day_study.service";
import { Types } from "mongoose";
import {
  updateHLRFromMatchingGame,
  updateHLRFromWordRecall,
} from "../services/hlr_integration.service";

export const getFlashCardById = async (
  req: Request,
  res: Response,
  next: NextFunction,
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
      }),
    );
  } catch (err) {
    next(err);
  }
};

export const submitFlashCard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const { flashCardAttempt, logs, dayStudyId, activityId } = req.body;
    const user_id = req.user._id;

    // Chuyển logs về đúng cấu trúc của field "results"
    const results = logs.map((log: any) => ({
      answer_event_id: log.answer_event_id || new Types.ObjectId().toString(),
      vocabulary_id: new Types.ObjectId(log.vocab_id),
      action: log.action,
      response_time: log.response_time,
      attempted_at: log.attempted_at ? new Date(log.attempted_at) : new Date(),
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

export const submitFlashCardGame = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

    const { topic_id, game_type, game_result } = req.body;
    const user_id = req.user._id;

    // Validate input
    if (!topic_id || !game_type || !game_result) {
      return res.status(400).json(ApiResponse.fail("Missing required fields"));
    }

    if (!["matching", "word_recall"].includes(game_type)) {
      return res.status(400).json(ApiResponse.fail("Invalid game type"));
    }

    // Prepare game metadata based on game type
    let game_metadata: any = {};
    if (game_type === "matching") {
      game_metadata = {
        totalPairs: game_result.totalPairs,
        correctPairs: game_result.correctPairs,
        wrongAttempts: game_result.wrongAttempts,
        score: game_result.score,
      };
    } else if (game_type === "word_recall") {
      game_metadata = {
        totalWords: game_result.totalWords,
        correctWords: game_result.correctWords,
        wrongWords: game_result.wrongWords,
        totalScore: game_result.totalScore,
        combo: game_result.combo,
        wrongList: game_result.wrongList || [],
      };
    }

    const result = await submitFlashCardGameService({
      user_id: new Types.ObjectId(user_id),
      topic_vocabulary_id: new Types.ObjectId(topic_id),
      game_type,
      game_metadata,
      accuracy: game_result.accuracy || 0,
      time_spent: game_result.timeSpent || 0,
      started_at: game_result.started_at
        ? new Date(game_result.started_at)
        : new Date(),
      finished_at: game_result.finished_at
        ? new Date(game_result.finished_at)
        : new Date(),
    });

    if (!result) {
      return res
        .status(500)
        .json(ApiResponse.fail("Submit game result thất bại"));
    }

    // ★ Tích hợp HLR: Cập nhật spaced repetition data cho game
    // Chạy async, không block response
    if (game_type === "matching" && game_result.vocabularyIds?.length > 0) {
      updateHLRFromMatchingGame(user_id.toString(), {
        vocabularyIds: game_result.vocabularyIds,
        correctPairIds: game_result.correctPairIds || [],
        wrongAttemptCounts: game_result.wrongAttemptCounts || {}, // Số lần sai cho từng từ
      }).catch((err) => {
        console.error("[HLR] Error in matching game submit:", err.message);
      });
    } else if (game_type === "word_recall") {
      const correctWordIds = game_result.correctWordIds || [];
      const wrongWordIds = game_result.wrongWordIds || [];
      if (correctWordIds.length > 0 || wrongWordIds.length > 0) {
        updateHLRFromWordRecall(user_id.toString(), {
          correctWordIds,
          wrongWordIds,
        }).catch((err) => {
          console.error("[HLR] Error in word recall submit:", err.message);
        });
      }
    }

    res
      .status(201)
      .json(ApiResponse.success(result, "Submit game result thành công"));
  } catch (err) {
    next(err);
  }
};

export const getHistoryFlashCardByTopic = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?._id) {
      return res
        .status(401)
        .json(ApiResponse.fail('Người dùng chưa đăng nhập!'));
    }

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
          "Lấy lịch sử làm bài của topic thành công!",
        ),
      );
  } catch (err) {
    next(err);
  }
};
