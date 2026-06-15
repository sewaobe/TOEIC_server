import { Types } from "mongoose";
import { DayStudy, LearningPath, UserTest, WeekStudy } from "../../models";
import type { IUserTest } from "../../models";
import type { IDayStudy } from "../../models/day_study.model";
import { SessionType } from "../../models/enums/SessionType";
import { UserTestSubmitType } from "../../models/enums/UserTestSubmitType";
import { WeekStudyStatus } from "../../models/enums/WeekStudyStatus";
import { emitToUser } from "../../socket/emitToUser.socket";
import { submitMiniTestService, submitTest } from "../test.service";
import { buildRawUserTestLikeInputFromUserTest } from "../user_test.service";
import { updateUserProgress } from "../user_progress.service";
import { runLearningPathV2AbilityPipeline } from "./learning_path_v2.service";

export type LearningPathV2AssessmentType = "mini_test" | "full_test";

type SubmitLearningPathV2AssessmentInput = {
  user_id: string;
  learning_path_id: string;
  test_id: string;
  answers: {
    question_id: string;
    selectedOption: string;
  }[];
  duration: number;
  assessment_type: LearningPathV2AssessmentType;
  week_study_id?: string;
  day_study_id?: string;
};

const toObjectId = (id: string, label: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error(`${label} khong hop le.`);
  }

  return new Types.ObjectId(id);
};

const resolveWeekStudyId = async (input: {
  week_study_id?: string;
  day_study_id?: string;
}): Promise<string | undefined> => {
  if (input.week_study_id) return input.week_study_id;
  if (!input.day_study_id || !Types.ObjectId.isValid(input.day_study_id)) {
    return undefined;
  }

  const dayStudy = await DayStudy.findById(input.day_study_id)
    .select("week_id")
    .lean();

  return dayStudy?.week_id ? String(dayStudy.week_id) : undefined;
};

const findSavedUserTest = async (userTestId: unknown): Promise<IUserTest> => {
  const saved = await UserTest.findById(userTestId);
  if (!saved) {
    throw new Error("Khong tim thay UserTest sau khi submit assessment.");
  }

  return saved;
};

const getAssessmentSessionType = (
  assessmentType: LearningPathV2AssessmentType
): SessionType.MINI_TEST | SessionType.FULL_TEST =>
  assessmentType === "mini_test" ? SessionType.MINI_TEST : SessionType.FULL_TEST;

const loadAssessmentDayStudy = async (input: {
  day_study_id?: string;
  week_study_id?: string;
  assessment_type: LearningPathV2AssessmentType;
}): Promise<IDayStudy | null> => {
  const assessmentKind = getAssessmentSessionType(input.assessment_type);

  if (input.day_study_id && Types.ObjectId.isValid(input.day_study_id)) {
    const dayStudy = await DayStudy.findById(input.day_study_id);
    if (
      dayStudy?.sessions?.some((session) =>
        session.items?.some((item) => item.kind === assessmentKind)
      )
    ) {
      return dayStudy;
    }
  }

  if (!input.week_study_id || !Types.ObjectId.isValid(input.week_study_id)) {
    return null;
  }

  const dayStudies = await DayStudy.find({
    week_id: input.week_study_id,
  }).sort({ dayOfWeek: -1 });

  return (
    dayStudies.find((dayStudy) =>
      dayStudy.sessions?.some((session) =>
        session.items?.some((item) => item.kind === assessmentKind)
      )
    ) ?? null
  );
};

const completeAssessmentDayStudy = async (input: {
  day_study_id?: string;
  week_study_id?: string;
  learning_path_id: string;
  user_id: string;
  assessment_type: LearningPathV2AssessmentType;
}): Promise<void> => {
  const assessmentKind = getAssessmentSessionType(input.assessment_type);
  const dayStudy = await loadAssessmentDayStudy({
    day_study_id: input.day_study_id,
    week_study_id: input.week_study_id,
    assessment_type: input.assessment_type,
  });

  if (!dayStudy) {
    throw new Error("Không tìm thấy DayStudy assessment để cập nhật trạng thái.");
  }

  let foundAssessmentItem = false;

  dayStudy.sessions.forEach((session) => {
    session.items.forEach((item) => {
      if (item.kind === assessmentKind) {
        item.status = WeekStudyStatus.COMPLETED;
        foundAssessmentItem = true;
      }
    });

    if (
      session.items.length > 0 &&
      session.items.every((item) => item.status === WeekStudyStatus.COMPLETED)
    ) {
      session.status = WeekStudyStatus.COMPLETED;
    }
  });

  if (!foundAssessmentItem) {
    throw new Error("Không tìm thấy item Mini Test hoặc Full Test trong DayStudy.");
  }

  if (
    dayStudy.sessions.length > 0 &&
    dayStudy.sessions.every(
      (session) => session.status === WeekStudyStatus.COMPLETED
    )
  ) {
    dayStudy.status = WeekStudyStatus.COMPLETED;
  }

  dayStudy.markModified("sessions");
  await dayStudy.save();

  const weekStudyId = input.week_study_id ?? String(dayStudy.week_id);
  const weekDayStudies = await DayStudy.find({ week_id: weekStudyId }).select(
    "status"
  );
  const isWeekCompleted =
    weekDayStudies.length > 0 &&
    weekDayStudies.every((day) => day.status === WeekStudyStatus.COMPLETED);

  if (isWeekCompleted) {
    await WeekStudy.findByIdAndUpdate(weekStudyId, {
      status: WeekStudyStatus.COMPLETED,
      ended_at: new Date(),
    });
  }

  try {
    await updateUserProgress(
      toObjectId(input.user_id, "user_id"),
      toObjectId(input.learning_path_id, "learning_path_id")
    );
  } catch (error) {
    console.error("Lỗi khi cập nhật UserProgress sau assessment:", error);
  }
};

const emitAssessmentSubmitted = (input: {
  user_id: string;
  learning_path_id: string;
  assessment_type: LearningPathV2AssessmentType;
  trigger_type: "mini_test_completion" | "full_test_review";
  userTestId: unknown;
  testId: string;
  score: number;
  totalCorrect: number;
  totalQuestions: number;
  detailedAnswers: unknown[];
  parts: unknown[];
}): void => {
  emitToUser(input.user_id, "learning_path_assessment_submitted", {
    learning_path_id: input.learning_path_id,
    assessment_type: input.assessment_type,
    trigger_type: input.trigger_type,
    userTestId: String(input.userTestId),
    testId: input.testId,
    score: input.score,
    totalCorrect: input.totalCorrect,
    totalQuestions: input.totalQuestions,
    detailedAnswers: input.detailedAnswers,
    parts: input.parts,
  });
};

export const submitLearningPathV2Assessment = async (
  input: SubmitLearningPathV2AssessmentInput
) => {
  const learningPath = await LearningPath.findOne({
    _id: toObjectId(input.learning_path_id, "learning_path_id"),
    user_id: toObjectId(input.user_id, "user_id"),
    isActive: true,
  });

  if (!learningPath) {
    throw new Error("Khong tim thay LearningPath v2 dang hoat dong.");
  }

  const weekStudyId = await resolveWeekStudyId({
    week_study_id: input.week_study_id,
    day_study_id: input.day_study_id,
  });
  const triggerType =
    input.assessment_type === "mini_test"
      ? "mini_test_completion"
      : "full_test_review";

  if (triggerType === "mini_test_completion" && !weekStudyId) {
    throw new Error("Mini test completion can week_study_id hoac day_study_id.");
  }

  const submitResult =
    input.assessment_type === "mini_test"
      ? await submitMiniTestService(
          input.user_id,
          input.test_id,
          input.answers,
          input.duration
        )
      : await submitTest(
          input.user_id,
          input.test_id,
          input.answers,
          input.duration,
          "full_test",
          UserTestSubmitType.FULL_TEST
        );

  await completeAssessmentDayStudy({
    day_study_id: input.day_study_id,
    week_study_id: weekStudyId,
    learning_path_id: input.learning_path_id,
    user_id: input.user_id,
    assessment_type: input.assessment_type,
  });

  const userTestId =
    "userTestId" in submitResult ? submitResult.userTestId : submitResult.resultId;
  const userTest = await findSavedUserTest(userTestId);
  const detailedAnswers =
    "detailedAnswers" in submitResult
      ? submitResult.detailedAnswers
      : submitResult.answers;
  const totalCorrect =
    "totalCorrect" in submitResult
      ? submitResult.totalCorrect
      : detailedAnswers.filter((answer: any) => answer?.isCorrect).length;
  const totalQuestions =
    "totalQuestions" in submitResult
      ? submitResult.totalQuestions
      : detailedAnswers.length;

  emitAssessmentSubmitted({
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    assessment_type: input.assessment_type,
    trigger_type: triggerType,
    userTestId,
    testId: input.test_id,
    score: submitResult.score,
    totalCorrect,
    totalQuestions,
    detailedAnswers,
    parts: (userTest.parts ?? ("parts" in submitResult ? submitResult.parts : [])) as unknown[],
  });

  const rawResult = await buildRawUserTestLikeInputFromUserTest(userTest);
  const pipelineResult = await runLearningPathV2AbilityPipeline({
    trigger_type: triggerType,
    user_id: input.user_id,
    learning_path_id: input.learning_path_id,
    source_user_test: userTest,
    raw_result: rawResult,
    learning_path_created_at: learningPath.created_at ?? new Date(),
    target_completion_date: learningPath.target_completion_date,
    week_study_id: weekStudyId,
  } as any);

  return {
    score: submitResult.score,
    detailedAnswers,
    userTestId: String(userTestId),
    totalCorrect,
    totalQuestions,
    parts: userTest.parts ?? [],
    pipeline: {
      trigger_type: triggerType,
      scenario_decision: pipelineResult.scenario_decision,
      layer4_result: pipelineResult.layer4_result,
    },
  };
};
