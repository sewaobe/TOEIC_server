import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import {
  FlashCardAttempt,
  DictationAttempt,
  QuizAttempt,
  ShadowingAttempt,
} from "../models";
import { ApiResponse } from "../utils/ApiResponse";

const toSeconds = (start?: Date, end?: Date) => {
  if (!start || !end) return undefined;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
};

export const getLessonHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, lessonId } = req.params;
    const userId = req.user?._id as string;

    if (!type || !lessonId) {
      return res
        .status(400)
        .json(ApiResponse.fail("Thiếu type hoặc lessonId cho lịch sử."));
    }

    const objectId = new Types.ObjectId(lessonId);
    const userObjectId = new Types.ObjectId(userId);
    const limit = 20;

    if (type === "flash_card") {
      const attempts = await FlashCardAttempt.find({
        user_id: userObjectId,
        topic_vocabulary_id: objectId,
      })
        .populate("results.vocabulary_id", "word")
        .sort({ started_at: -1 })
        .limit(limit)
        .lean();

      const mapped = attempts.map((a: any) => {
        const remember =
          a.results?.filter((r: any) => r.action === "remember").length || 0;
        const vague =
          a.results?.filter((r: any) => r.action === "vague").length || 0;
        const unknown =
          a.results?.filter((r: any) => r.action === "unknown").length || 0;
        const forgot =
          a.results?.filter((r: any) => r.action === "forgot").length || 0;
        const avgResponseTime = a.results?.length
          ? Number(
              (
                a.results.reduce(
                  (sum: number, r: any) => sum + Number(r.response_time || 0),
                  0
                ) / a.results.length
              ).toFixed(2)
            )
          : undefined;

        return {
          id: a._id.toString(),
          type: "flash_card",
          started_at: a.started_at,
          finished_at: a.finished_at,
          durationSec: toSeconds(a.started_at, a.finished_at),
          scoreLabel: `${a.accuracy ?? 0}%`,
          scoreValue: a.accuracy,
          submit_type: a.submit_type || "practice",
          meta: {
            wordsReviewed: a.results?.length ?? 0,
            remember,
            vague,
            unknown,
            forgot,
            avgResponseTime,
            wordSummaries: (a.results || []).map((r: any) => ({
              vocabText: r.vocabulary_id?.word || "",
              action: r.action,
              response_time: r.response_time,
            })),
          },
        };
      });

      return res
        .status(200)
        .json(ApiResponse.success(mapped, "Lấy lịch sử flashcard thành công."));
    }

    if (type === "quiz") {
      const attempts = await QuizAttempt.find({
        user_id: userObjectId,
        quiz_id: objectId,
      })
        .populate(
          "answers.question_id",
          "textQuestion choices correctAnswer name"
        )
        .sort({ started_at: -1 })
        .limit(limit)
        .lean();

      const mapped = attempts.map((a: any) => {
        const totalQuestions = a.answers?.length || 0;
        const correct =
          a.answers?.filter((ans: any) => ans.correct).length || 0;

        return {
          id: a._id.toString(),
          type: "quiz",
          started_at: a.started_at,
          finished_at: a.finished_at,
          durationSec: toSeconds(a.started_at, a.finished_at),
          scoreLabel: `${
            a.score ?? Math.round((correct / Math.max(totalQuestions, 1)) * 100)
          } điểm`,
          scoreValue:
            a.score ??
            Math.round((correct / Math.max(totalQuestions, 1)) * 100),
          submit_type: a.submit_type || "practice",
          meta: {
            totalQuestions,
            correct,
            perQuestion: (a.answers || []).map((ans: any, idx: number) => {
              const q: any = ans.question_id || {};
              const choices = q.choices || {};
              return {
                index: idx + 1,
                questionText: q.textQuestion || q.name || "",
                chosenKey: ans.chosen,
                chosenText: choices[ans.chosen],
                correctKey: q.correctAnswer,
                correctText: choices[q.correctAnswer],
                correct: ans.correct,
              };
            }),
          },
        };
      });

      return res
        .status(200)
        .json(ApiResponse.success(mapped, "Lấy lịch sử quiz thành công."));
    }

    if (type === "dictation") {
      const attempts = await DictationAttempt.find({
        user_id: userObjectId,
        dictation_id: objectId,
      })
        .sort({ started_at: -1 })
        .limit(limit)
        .populate({
          path: "dictation_id",
          select: "timings",
        })
        .lean();

      const mapped = attempts.map((a: any) => {
        const timings = a.dictation_id?.timings || [];
        const answers = a.answers || {};
        const totalSegments = timings.length;

        // Build segments array mapping user answers to correct text
        const segments = timings.map((seg: any, idx: number) => {
          const userText = answers[String(idx)] || "";
          const correctText = seg.text || "";
          // Simple comparison - consider correct if texts match (case-insensitive, trimmed)
          const isCorrect =
            userText.trim().toLowerCase() === correctText.trim().toLowerCase();
          return {
            index: idx + 1,
            correctText,
            userText,
            isCorrect,
          };
        });

        return {
          id: a._id.toString(),
          type: "dictation",
          started_at: a.started_at,
          finished_at: a.finished_at,
          durationSec: a.duration,
          scoreLabel: `${a.accuracy ?? 0}% chính xác`,
          scoreValue: a.accuracy,
          submit_type: a.submit_type || "practice",
          meta: {
            mistakes: Array.isArray(a.mistakes) ? a.mistakes.length : 0,
            totalSegments,
            segments,
          },
        };
      });

      return res
        .status(200)
        .json(ApiResponse.success(mapped, "Lấy lịch sử dictation thành công."));
    }

    if (type === "shadowing") {
      const attempts = await ShadowingAttempt.find({
        user_id: userObjectId,
        shadowing_id: objectId,
      })
        .sort({ started_at: -1 })
        .limit(limit)
        .lean();

      const mapped = attempts.map((a: any) => ({
        id: a._id.toString(),
        type: "shadowing",
        started_at: a.started_at,
        finished_at: a.finished_at,
        durationSec: a.duration,
        scoreLabel: `${a.similarity_score ?? 0}% similarity`,
        scoreValue: a.similarity_score,
        submit_type: a.submit_type || "practice",
        meta: {
          overall_feedback: a.overall_feedback,
          audioUrl: a.recorded_audio,
          scores: {
            accuracy: a.accuracy_score ?? a.similarity_score,
            fluency: a.fluency_score,
            intonation: a.intonation_score,
          },
          wordFeedback: a.pronunciation_feedback?.words || [],
        },
      }));

      return res
        .status(200)
        .json(ApiResponse.success(mapped, "Lấy lịch sử shadowing thành công."));
    }

    return res.status(400).json(ApiResponse.fail("Type lịch sử không hợp lệ."));
  } catch (error) {
    next(error);
  }
};
