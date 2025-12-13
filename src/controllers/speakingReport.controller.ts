import { Request, Response, NextFunction } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { ChatSession } from "../models/chat_session.model";
import { ChatMessage } from "../models/chat_message.model";

// Compute overall speaking report for a session based on per-message pronunciation_feedback
export const getSpeakingSessionReportController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res
        .status(400)
        .json(ApiResponse.fail("Thiếu tham số `sessionId`."));
    }

    const session = await ChatSession.findOne({ _id: sessionId, user_id: userId });
    if (!session) {
      return res
        .status(404)
        .json(ApiResponse.fail("Phiên luyện nói không tồn tại."));
    }

    // Nếu đã có metadata.report_overall thì dùng luôn (cache)
    const existingReport = (session as any).metadata?.report_overall;
    if (existingReport) {
      return res
        .status(200)
        .json(ApiResponse.success(existingReport, "Lấy báo cáo tổng quát phiên luyện nói thành công"));
    }

    const messages = await ChatMessage.find({
      session_id: sessionId,
      sender: "user",
    })
      .sort({ created_at: 1 })
      .lean();

    if (!messages.length) {
      const emptyReport = {
        fluency: 0,
        coherence: 0,
        lexicalRange: 0,
        grammaticalAccuracy: 0,
        averageScore: 0,
        totalTurns: 0,
        totalMistakes: 0,
        report_overall:
          "No user messages found in this session. Please complete a conversation to get a detailed report.",
      };

      // Lưu vào metadata để tránh tính lại
      (session as any).metadata = {
        ...(session as any).metadata,
        report_overall: emptyReport,
      };
      await session.save();

      return res
        .status(200)
        .json(ApiResponse.success(emptyReport, "Lấy báo cáo tổng quát phiên luyện nói thành công"));
    }

    let fluencySum = 0;
    let pronunciationSum = 0;
    let intonationSum = 0;
    let grammarSum = 0;
    let avgScoreSum = 0;
    let countWithFeedback = 0;
    let totalMistakes = 0;

    for (const msg of messages) {
      const pf = msg.meta?.pronunciation_feedback;
      if (!pf) continue;

      fluencySum += pf.fluencyScore ?? 0;
      grammarSum += pf.grammarScore ?? 0;
      pronunciationSum += pf.pronunciationScore ?? 0;
      intonationSum += pf.intonationScore ?? 0;
      avgScoreSum += pf.totalScore ?? 0;
      totalMistakes += pf.mistakes?.length ?? 0;
      countWithFeedback++;
    }

    const safeDiv = (v: number, c: number) => (c > 0 ? Math.round(v / c) : 0);

    const report = {
      fluency: safeDiv(fluencySum, countWithFeedback),
      pronunciation: safeDiv(pronunciationSum, countWithFeedback),
      intonation: safeDiv(intonationSum, countWithFeedback),
      grammaticalAccuracy: safeDiv(grammarSum, countWithFeedback),
      averageScore: safeDiv(avgScoreSum, countWithFeedback),
      totalTurns: countWithFeedback,
      totalMistakes,
      report_overall:
        "This overall report is computed from your per-turn pronunciation and grammar feedback. Future versions may use a dedicated LLM to generate more natural summaries.",
    };

    // Cache vào metadata.report_overall
    (session as any).metadata = {
      ...(session as any).metadata,
      report_overall: report,
    };
    await session.save();

    return res
      .status(200)
      .json(ApiResponse.success(report, "Lấy báo cáo tổng quát phiên luyện nói thành công"));
  } catch (err) {
    next(err);
  }
};
