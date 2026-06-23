import type { NextFunction, Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import {
  ensureLearningPathV2MentorAssigned,
  assertLearningPathV3SchedulerReady,
  getCurrentLearningPathCycleV2,
  getLearningPathV2GenerationContext,
  getLearningPathV2NodeDetail,
  getLearningPathV2Overview,
  getLearningPathV2SkillMap,
  LearningPathV3SchedulerNotReadyError,
  LearningPathV2MockLearningError,
  mockCompleteLearningPathV2CurrentWeek,
  runLearningPathV2AbilityPipeline,
  upsertLearningPathV2Setup,
} from "../services/learning_path_v2/learning_path_v2.service";
import {
  buildRawUserTestLikeInputFromUserTest,
  getLatestUserTestBySubmitType,
} from "../services/user_test.service";
import { UserTestSubmitType } from "../models/enums/UserTestSubmitType";
import { LearningPath } from "../models";
import { getLearningPathStrategyOptionPreview, getLearningPathStrategyOverview, selectLearningPathStrategyOptionForV2 } from "../services/learning_path_strategy_option.service";
import {
  submitLearningPathV2Assessment,
  type LearningPathV2AssessmentType,
} from "../services/learning_path_v2/learning_path_v2_assessment.service";

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
  if (error instanceof LearningPathV3SchedulerNotReadyError) {
    res.status(error.statusCode).json(ApiResponse.fail(error.message));
    return;
  }

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
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    /**
     * Chặn trước khi gán mentor hoặc cập nhật ability để checkpoint contract không tạo dữ liệu nửa chừng.
     * Endpoint sẽ được mở lại khi Skill ROI engine có thể tạo WeekStudy V3 hoàn chỉnh.
     */
    assertLearningPathV3SchedulerReady();

    const learningPath = await LearningPath.findOne({
      _id: learningPathId,
      user_id: userId,
      isActive: true,
    });

    if (!learningPath) {
      res.status(404).json(ApiResponse.fail("Không tìm thấy LearningPath."));
      return;
    }

    if ((learningPath.week_study_ids?.length ?? 0) > 0) {
      res
        .status(400)
        .json(ApiResponse.fail("Lộ trình đã được tạo, không thể tạo lại."));
      return;
    }

    const latestInitialTest = await getLatestUserTestBySubmitType({
      user_id: userId,
      submit_type: UserTestSubmitType.INITIAL_ASSESSMENT,
    });

    if (!latestInitialTest) {
      res
        .status(400)
        .json(ApiResponse.fail("Chưa có bài entry test để tạo lộ trình."));
      return;
    }

    const rawResult =
      await buildRawUserTestLikeInputFromUserTest(latestInitialTest);
    const targetCompletionDate =
      toDateOrUndefined(req.body.target_completion_date) ??
      learningPath.target_completion_date;

    if (!targetCompletionDate || Number.isNaN(targetCompletionDate.getTime())) {
      res
        .status(400)
        .json(ApiResponse.fail("LearningPath chưa có target_completion_date."));
      return;
    }

    await ensureLearningPathV2MentorAssigned({
      user_id: userId,
      learning_path_id: learningPathId,
      current_score: latestInitialTest.score,
      target_score: learningPath.target_score
    });

    /*
     * API này là replacement path cho flow tạo lộ trình cũ dùng Gemini:
     * chạy LearningPath v2 pipeline, tạo selected option, WeekStudy, DayStudy
     * và gắn placeholder assessment test cho cycle đầu tiên.
     */
    const result = await runLearningPathV2AbilityPipeline({
      trigger_type: "initial_generation",
      user_id: userId,
      learning_path_id: learningPathId,
      source_user_test: latestInitialTest,
      raw_result: rawResult,
      learning_path_created_at:
        learningPath.created_at ??
        toDateOrUndefined(req.body.learning_path_created_at) ??
        new Date(),
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

export const upsertLearningPathV2SetupController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const {
      target_score,
      target_completion_date,
      time_per_day,
      days_per_week,
    } = req.body ?? {};

    const targetCompletionDate = toDateOrUndefined(target_completion_date);
    const targetScore = Number(target_score);
    const timePerDay = Number(time_per_day);
    const daysPerWeek = Number(days_per_week);

    if (
      !Number.isFinite(targetScore) ||
      !targetCompletionDate ||
      Number.isNaN(targetCompletionDate.getTime()) ||
      !Number.isFinite(timePerDay) ||
      !Number.isFinite(daysPerWeek)
    ) {
      res.status(400).json(ApiResponse.fail("Payload setup không hợp lệ."));
      return;
    }

    const result = await upsertLearningPathV2Setup({
      user_id: userId,
      target_score: targetScore,
      target_completion_date: targetCompletionDate,
      time_per_day: timePerDay,
      days_per_week: daysPerWeek,
    });

    res
      .status(200)
      .json(
        ApiResponse.success(
          result,
          "Lưu thiết lập LearningPath v2 thành công."
        )
      );
  } catch (error) {
    next(error);
  }
};

export const getLearningPathV2GenerationContextController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const result = await getLearningPathV2GenerationContext({
      user_id: userId,
    });

    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    next(error);
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

export const getLearningPathV2NodeDetailController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId, lessonManagerId } = req.params;
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const result = await getLearningPathV2NodeDetail({
      user_id: String(userId),
      learning_path_id: learningPathId,
      lesson_manager_id: lessonManagerId,
    });
    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};

export const mockLearningPathV2CurrentWeekController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const result = await mockCompleteLearningPathV2CurrentWeek({
      user_id: String(userId),
      learning_path_id: learningPathId,
    });

    res
      .status(200)
      .json(
        ApiResponse.success(
          result,
          "Đã hoàn thành nhanh các bài học trong tuần. Bài kiểm tra cuối đã sẵn sàng."
        )
      );
  } catch (error) {
    if (error instanceof LearningPathV2MockLearningError) {
      res.status(error.statusCode).json(ApiResponse.fail(error.message));
      return;
    }

    handleLearningPathV2ControllerError(error, res, next);
  }
};


export const getLearningPathV2SkillMapController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const tab =
      typeof req.query.tab === "string" ? req.query.tab : "parts";

    const result = await getLearningPathV2SkillMap({
      user_id: userId,
      learning_path_id: learningPathId,
      tab,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      part_type:
        typeof req.query.part_type === "string"
          ? Number(req.query.part_type)
          : undefined,
      skill_group:
        typeof req.query.skill_group === "string"
          ? req.query.skill_group
          : undefined,
      focus_only: req.query.focus_only === "true",
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      page:
        typeof req.query.page === "string"
          ? Number(req.query.page)
          : undefined,
      limit:
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined,
    });

    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};

export const getLearningPathV2StrategyController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const result = await getLearningPathStrategyOverview({
      user_id: String(userId),
      learning_path_id: learningPathId,
    });

    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};

export const selectLearningPathV2StrategyOptionController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId, optionId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const result = await selectLearningPathStrategyOptionForV2({
      user_id: String(userId),
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};

export const getLearningPathV2StrategyOptionPreviewController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId, optionId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("KhÃ´ng tÃ¬m tháº¥y user_id."));
      return;
    }

    const result = await getLearningPathStrategyOptionPreview({
      user_id: String(userId),
      learning_path_id: learningPathId,
      strategy_option_id: optionId,
    });

    res.status(200).json(ApiResponse.success(result));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};

export const submitLearningPathV2AssessmentController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { learningPathId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json(ApiResponse.fail("Không tìm thấy user_id."));
      return;
    }

    const {
      test_id,
      testId,
      answers,
      duration,
      assessment_type,
      week_study_id,
      day_study_id,
    } = req.body ?? {};
    const normalizedAssessmentType = assessment_type as LearningPathV2AssessmentType;

    if (
      !learningPathId ||
      !(test_id || testId) ||
      !Array.isArray(answers) ||
      !Number.isFinite(Number(duration)) ||
      !["mini_test", "full_test"].includes(normalizedAssessmentType)
    ) {
      res.status(400).json(ApiResponse.fail("Payload assessment không hợp lệ."));
      return;
    }

    const result = await submitLearningPathV2Assessment({
      user_id: String(userId),
      learning_path_id: learningPathId,
      test_id: String(test_id ?? testId),
      answers,
      duration: Number(duration),
      assessment_type: normalizedAssessmentType,
      week_study_id:
        typeof week_study_id === "string" ? week_study_id : undefined,
      day_study_id:
        typeof day_study_id === "string" ? day_study_id : undefined,
    });

    res
      .status(200)
      .json(ApiResponse.success(result, "Nộp assessment LearningPath v2 thành công."));
  } catch (error) {
    handleLearningPathV2ControllerError(error, res, next);
  }
};
