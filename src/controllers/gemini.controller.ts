import { NextFunction, Request, Response } from "express";

import {
  buildLearningPathFromGemini,
  buildWeeklyLearningPath,
} from "../services/learningPath.generator";
import {
  analyzeDictationWithAI,
  analyzeShadowingByURL,
  dictionaryLookup,
  generateToeicPlan,
  translateText,
  generateMindMapFromText,
} from "../services/gemini.service";
import { ApiResponse } from "../utils/ApiResponse";
import { Shadowing } from "../models/shadowing.model";
import { GroupUser } from "../models";
import { ensureMentorAssignedForUser } from "../services/mentor_assignment.service";

export async function generateToeicPlanController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    console.log("🎯 ========================================");
    console.log("🎯 API /gemini/generate-toeic-plan CALLED");
    console.log("🎯 ========================================");

    const userInput = req.body;
    const userId = req.user?._id?.toString();

    console.log("📥 Request body:", JSON.stringify(userInput, null, 2));
    console.log("👤 User ID:", userId);

    if (!userId) {
      console.log("❌ User not authenticated");
      return res
        .status(401)
        .json(ApiResponse.fail("Người dùng chưa đăng nhập"));
    }

    // Tìm mentor đã được gán cho user này; nếu chưa có, auto-gán
    console.log("🔍 Đang tìm mentor cho user...");
    let group = await GroupUser.findOne({ students: userId }).lean();
    console.log(
      "📦 Group found:",
      group ? JSON.stringify(group, null, 2) : "null"
    );

    if (!group || !group.mentor_id) {
      console.log("⚙️ Chưa có mentor, tiến hành auto-assign...");
      const assignedMentorId = await ensureMentorAssignedForUser(userId);
      if (!assignedMentorId) {
        console.log("❌ Không thể tự gán mentor (không có CTV phù hợp)");
        return res
          .status(400)
          .json(
            ApiResponse.fail(
              "Người dùng chưa được gán mentor và không tìm thấy CTV phù hợp. Vui lòng liên hệ admin."
            )
          );
      }
      // reload group sau khi gán
      group = await GroupUser.findOne({ students: userId }).lean();
    }

    const mentorId = group!.mentor_id.toString();
    console.log(`🧑‍🏫 Mentor ID for user ${userId}: ${mentorId}`);

    // Dùng RAG-based weekly plan thay vì mock data
    console.log("🚀 Đang gọi buildWeeklyLearningPath...");
    const result = await buildWeeklyLearningPath(userId, userInput, mentorId);
    console.log(
      "✅ buildWeeklyLearningPath hoàn thành:",
      result ? "có dữ liệu" : "null"
    );

    return res
      .status(200)
      .json(
        ApiResponse.success(result, "Tạo lộ trình học 1 tuần thành công (RAG)!")
      );
  } catch (error: any) {
    next(error);
  }
}

// ========== NEW: GENERATE WEEKLY PLAN WITH RAG ==========
export async function generateWeeklyPlanController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userInput = req.body;
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res
        .status(401)
        .json(ApiResponse.fail("Người dùng chưa đăng nhập"));
    }

    // Tìm mentor đã được gán cho user này (từ GroupUser)
    const group = await GroupUser.findOne({ students: userId }).lean();
    if (!group || !group.mentor_id) {
      return res
        .status(400)
        .json(
          ApiResponse.fail(
            "Người dùng chưa được gán mentor. Vui lòng liên hệ admin."
          )
        );
    }

    const mentorId = group.mentor_id.toString();
    console.log(`🧑‍🏫 Mentor ID for user ${userId}: ${mentorId}`);

    // Build weekly learning path with RAG
    const result = await buildWeeklyLearningPath(userId, userInput, mentorId);

    return res
      .status(200)
      .json(
        ApiResponse.success(result, "Tạo lộ trình học 1 tuần thành công (RAG)!")
      );
  } catch (error: any) {
    next(error);
  }
}

export const dictionaryController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { query } = req.body;

    const result = await dictionaryLookup(query);

    return res
      .status(200)
      .json(ApiResponse.success(result, "Tra cứu từ điển thành công!"));
  } catch (error: any) {
    next(error);
  }
};

export const translateController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    const result = await translateText(text, sourceLang, targetLang);
    return res
      .status(200)
      .json(ApiResponse.success(result, "Dịch văn bản thành công!"));
  } catch (error) {
    next(error);
  }
};

export const analyzeDictationController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startedAt = Date.now();
  try {
    const { logs, dictation } = req.body;
    console.info("[DictationAI:legacy] request start", {
      dictationId: dictation?._id,
      title: dictation?.title,
      logs: Array.isArray(logs) ? logs.length : 0,
    });

    if (!logs || !Array.isArray(logs) || !dictation) {
      return res
        .status(400)
        .json(ApiResponse.fail("Thiếu dữ liệu logs hoặc dictation."));
    }

    const result = await analyzeDictationWithAI(logs, dictation);
    console.info("[DictationAI:legacy] request success", {
      dictationId: dictation?._id,
      elapsedMs: Date.now() - startedAt,
    });

    return res
      .status(200)
      .json(
        ApiResponse.success(result, "Phân tích bài luyện Dictation thành công!")
      );
  } catch (error) {
    console.error("[DictationAI:legacy] request failed", {
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : error,
    });
    next(error);
  }
};

export const analyzeShadowingController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { user_audio_url, level, segmentIndex, shadowing } = req.body;

    const shadowingId = shadowing?._id;

    if (!user_audio_url || shadowingId === undefined)
      return res
        .status(400)
        .json(ApiResponse.fail("Thiếu dữ liệu âm thanh hoặc bài shadowing."));

    const shadowingData = await Shadowing.findById(shadowingId);
    if (!shadowingData)
      return res
        .status(404)
        .json(ApiResponse.fail("Không tìm thấy bài shadowing."));

    const segment = shadowingData.timings[segmentIndex];
    if (!segment)
      return res
        .status(400)
        .json(
          ApiResponse.fail(`Không tìm thấy segment index ${segmentIndex}.`)
        );

    const meta = {
      level: level || shadowingData.level,
      segmentIndex,
      nativeText: segment.text,
    };

    const result = await analyzeShadowingByURL(user_audio_url, meta);
    return res
      .status(200)
      .json(ApiResponse.success(result, "✅ Phân tích thành công!"));
  } catch (err) {
    next(err);
  }
};

export const generateMindMapController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== "string") {
      return res
        .status(400)
        .json(ApiResponse.fail("Thiếu nội dung để tạo mind map."));
    }

    if (content.trim().length < 10) {
      return res
        .status(400)
        .json(ApiResponse.fail("Nội dung quá ngắn để tạo mind map."));
    }

    const result = await generateMindMapFromText(content);

    return res
      .status(200)
      .json(ApiResponse.success(result, "Tạo mind map thành công!"));
  } catch (error) {
    next(error);
  }
};
