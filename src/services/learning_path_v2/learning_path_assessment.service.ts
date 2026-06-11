import { Types } from "mongoose";
import { DayStudy, WeekStudy } from "../../models";
import type { IDayStudy } from "../../models/day_study.model";
import type { IWeekStudy } from "../../models/week_study.model";
import { SessionType } from "../../models/enums/SessionType";

type WeekCycleAssessmentInput = {
  user_id: string;
  learning_path_id: string;
  week_study_id: string;
};

type AttachAssessmentTestInput = {
  week_study_id: string;
  test_id: Types.ObjectId;
};

type AttachAssessmentTestResult = {
  day_study: IDayStudy;
};

type GenerateAssessmentTestResult = AttachAssessmentTestResult & {
  test_id: Types.ObjectId;
};

const getAssessmentSessionType = (
  weekStudy: IWeekStudy
): SessionType.MINI_TEST | SessionType.FULL_TEST => {
  if (!weekStudy.assessment_type) {
    throw new Error("WeekStudy chưa có assessment_type để gắn test.");
  }

  if (weekStudy.assessment_type === "mini_test") {
    return SessionType.MINI_TEST;
  }

  if (weekStudy.assessment_type === "full_test") {
    return SessionType.FULL_TEST;
  }

  throw new Error("WeekStudy chưa có assessment_type để gắn test.");
};

export const generateMiniTestFromWeekCycle = async (
  input: WeekCycleAssessmentInput
): Promise<{ test_id: Types.ObjectId }> => {
  void input;

  /*
   * Placeholder: sau này chọn question theo weekStudy.focus_skill_keys
   * và focus_part_types, hiện tại chưa generate test thật.
   */
  return { test_id: new Types.ObjectId() };
};

export const generateFullTestFromWeekCycle = async (
  input: WeekCycleAssessmentInput
): Promise<{ test_id: Types.ObjectId }> => {
  void input;

  /*
   * Placeholder: sau này generate full TOEIC test thật,
   * hiện tại chỉ tạo test_id giả để gắn vào DayStudy.
   */
  return { test_id: new Types.ObjectId() };
};

export const attachAssessmentTestToWeekCycle = async (
  input: AttachAssessmentTestInput
): Promise<AttachAssessmentTestResult> => {
  const weekStudy = await WeekStudy.findOne({ _id: input.week_study_id });

  if (!weekStudy) {
    throw new Error("Không tìm thấy WeekStudy để gắn assessment test.");
  }

  const assessmentKind = getAssessmentSessionType(weekStudy);

  if (!weekStudy.days || weekStudy.days.length === 0) {
    throw new Error("WeekStudy chưa có DayStudy để gắn assessment test.");
  }

  const dayStudy = await DayStudy.findOne({ week_id: weekStudy._id }).sort({
    dayOfWeek: -1,
  });

  if (!dayStudy) {
    throw new Error("Không tìm thấy DayStudy assessment cuối cycle.");
  }

  const assessmentItem = dayStudy.sessions
    .flatMap((session) => session.items)
    .find((item) => item.kind === assessmentKind);

  if (!assessmentItem) {
    throw new Error("Không tìm thấy assessment item trong DayStudy cuối cycle.");
  }

  assessmentItem.activity_id = input.test_id;
  await dayStudy.save();

  return { day_study: dayStudy };
};

export const generateAssessmentTestFromWeekCycle = async (
  input: WeekCycleAssessmentInput
): Promise<GenerateAssessmentTestResult> => {
  const weekStudy = await WeekStudy.findOne({ _id: input.week_study_id });

  if (!weekStudy?.assessment_type) {
    throw new Error("WeekStudy chưa có assessment_type để generate test.");
  }

  /*
   * assessment_type quyết định generate mini/full test. test_id chỉ gắn vào
   * DayStudy assessment item.activity_id, không dùng WeekStudy.additional_tests.
   * Hiện tại đây là placeholder generation, chưa tạo test thật.
   */
  const generated =
    weekStudy.assessment_type === "mini_test"
      ? await generateMiniTestFromWeekCycle(input)
      : await generateFullTestFromWeekCycle(input);

  const attached = await attachAssessmentTestToWeekCycle({
    week_study_id: input.week_study_id,
    test_id: generated.test_id,
  });

  return {
    test_id: generated.test_id,
    day_study: attached.day_study,
  };
};
