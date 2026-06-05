import type { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { runLearningPathV2AbilityPipeline } from "../services/learning_path_v2/learning_path_v2.service";
import {
  getCurrentLearningPathCycleV2,
  getLearningPathV2Overview,
} from "../services/learning_path_v2/learning_path_v2.service";
import type { RawUserTestLikeInput } from "../types/learning_path_v2";

const toDateOrUndefined = (value: unknown): Date | undefined => {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }

  return undefined;
};

const formatCycleResponse = (
  cycleResult: NonNullable<
    NonNullable<
      Awaited<ReturnType<typeof runLearningPathV2AbilityPipeline>>["layer4_result"]
    >["cycle_result"]
  >
) => ({
  status: cycleResult.status,
  week_study: cycleResult.week_study,
  day_studies: cycleResult.day_studies,
  assessment_result:
    cycleResult.status === "cycle_created"
      ? cycleResult.assessment_result
      : null,
});

const handleLearningPathV2ControllerError = (
  error: unknown,
  res: Response,
  next: NextFunction
): void => {
  if (
    error instanceof Error &&
    error.message.startsWith("Không tìm thấy LearningPath")
  ) {
    res.status(404).json(ApiResponse.fail(error.message));
    return;
  }

  next(error);
};

export const initialGenerateLearningPathV2Controller = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId } = req.params;
    const userId = req.user._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    if (!req.body?.initial_assessment) {
      res
        .status(400)
        .json(ApiResponse.fail("Thiếu initial_assessment để tạo lộ trình."));
      return;
    }

    const targetCompletionDate = toDateOrUndefined(req.body.target_completion_date);

    if (!targetCompletionDate || Number.isNaN(targetCompletionDate.getTime())) {
      res
        .status(400)
        .json(ApiResponse.fail("target_completion_date không hợp lệ."));
      return;
    }

    /*
     * API này là replacement path cho flow tạo lộ trình cũ dùng Gemini:
     * chạy LearningPath v2 pipeline, tạo selected option, WeekStudy, DayStudy
     * và gắn placeholder assessment test cho cycle đầu tiên.
     */
    const result = await runLearningPathV2AbilityPipeline({
      trigger_type: "initial_generation",
      user_id: userId,
      learning_path_id: learningPathId,
      initial_assessment: req.body.initial_assessment as RawUserTestLikeInput,
      learning_path_created_at:
        toDateOrUndefined(req.body.learning_path_created_at) ?? new Date(),
      target_completion_date: targetCompletionDate,
    });

    const cycleResult = result.layer4_result?.cycle_result;

    res.status(201).json(
      ApiResponse.success(
        {
          normalized_result: result.normalized_result,
          user_test: result.user_test,
          user_skill: result.user_skill,
          scenario_decision: result.scenario_decision,
          strategy_options: result.layer4_result?.strategy_options ?? [],
          selected_strategy_option:
            result.layer4_result?.selected_strategy_option ?? null,
          current_cycle: cycleResult ? formatCycleResponse(cycleResult) : null,
        },
        "Tạo lộ trình LearningPath v2 thành công."
      )
    );
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};

export const getCurrentLearningPathCycleV2Controller = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId } = req.params;
    const userId = req.user._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const result = await getCurrentLearningPathCycleV2({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};

export const getLearningPathV2OverviewController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId } = req.params;
    const userId = req.user._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const result = await getLearningPathV2Overview({
      user_id: userId,
      learning_path_id: learningPathId,
    });

    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};
