import { CareSignalType } from "../../models/student_care_conversation.model";
import { CareSignal, CareQuestionOption } from "./student-care.types";

export interface CareQuestionTemplate {
  templateId: string;
  version: number;
  signalType: CareSignalType;
  buildQuestion: (signal: CareSignal) => string;
  primaryOptions: CareQuestionOption[];
  secondaryOptionsByPrimary: Record<string, CareQuestionOption[]>;
}

const commonSecondary: CareQuestionOption[] = [
  { code: "need_method_guidance", label: "Em cần được hướng dẫn cách học phần này.", requires_support: true },
  { code: "need_easier_material", label: "Bài hiện tại hơi khó, em cần bài dễ hơn.", requires_support: true },
  { code: "lack_time", label: "Em thiếu thời gian học đều.", requires_support: false },
  { code: "technical_or_other", label: "Em gặp vấn đề khác.", requires_support: true, allow_note: true },
];

export const CARE_QUESTION_TEMPLATES: CareQuestionTemplate[] = [
  {
    templateId: "low_engagement_support_question",
    version: 1,
    signalType: "low_engagement",
    buildQuestion: (signal) => {
      const inactiveDays = signal.metrics?.daysSinceLastActive;
      return `Mình thấy bạn đã ngưng học ${inactiveDays ?? "một thời gian"} ngày. Điều gì đang làm bạn khó quay lại học nhất?`;
    },
    primaryOptions: [
      { code: "busy_schedule", label: "Em đang bận nên chưa sắp xếp được thời gian.", requires_secondary: true },
      { code: "lost_motivation", label: "Em hơi mất động lực học.", requires_secondary: true, requires_support: true },
      { code: "lesson_too_hard", label: "Bài hiện tại khó nên em bị kẹt.", requires_secondary: true, requires_support: true },
      { code: "other_reason", label: "Lý do khác.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      busy_schedule: [
        { code: "short_session_ok", label: "Em có thể học phiên ngắn 10-15 phút.", requires_support: false },
        { code: "need_new_schedule", label: "Em cần CTV gợi ý lịch học phù hợp hơn.", requires_support: true },
      ],
      lost_motivation: commonSecondary,
      lesson_too_hard: commonSecondary,
      other_reason: commonSecondary,
    },
  },
  {
    templateId: "assessment_missing_support_question",
    version: 1,
    signalType: "no_recent_assessment",
    buildQuestion: () =>
      "Gần đây bạn chưa có bài đánh giá mới nên hệ thống khó cập nhật năng lực. Bạn đang vướng gì ở việc làm Mini Test hoặc Full Test?",
    primaryOptions: [
      { code: "test_too_long", label: "Bài đánh giá hơi dài, em chưa có thời gian.", requires_secondary: true },
      { code: "not_ready_for_test", label: "Em chưa tự tin làm bài đánh giá.", requires_secondary: true, requires_support: true },
      { code: "do_not_know_where", label: "Em chưa biết nên làm bài nào.", requires_support: true },
      { code: "other_reason", label: "Lý do khác.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      test_too_long: [
        { code: "can_do_mini_test", label: "Em có thể làm Mini Test trước.", requires_support: false },
        { code: "need_time_suggestion", label: "Em cần CTV gợi ý thời điểm làm bài.", requires_support: true },
      ],
      not_ready_for_test: commonSecondary,
      do_not_know_where: commonSecondary,
      other_reason: commonSecondary,
    },
  },
  {
    templateId: "score_gain_support_question",
    version: 1,
    signalType: "studying_without_score_gain",
    buildQuestion: () =>
      "Mình thấy bạn vẫn học nhưng checkpoint chưa cải thiện rõ. Khi học xong bài, bạn đang gặp khó nhất ở bước nào?",
    primaryOptions: [
      { code: "not_reviewing_mistakes", label: "Em chưa biết cách review câu sai.", requires_secondary: true, requires_support: true },
      { code: "understand_lesson_but_fail_quiz", label: "Em hiểu bài nhưng làm quiz vẫn sai.", requires_secondary: true, requires_support: true },
      { code: "finish_too_fast", label: "Em chỉ hoàn thành nhanh, chưa luyện kỹ.", requires_secondary: true },
      { code: "other_reason", label: "Lý do khác.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      not_reviewing_mistakes: commonSecondary,
      understand_lesson_but_fail_quiz: commonSecondary,
      finish_too_fast: [
        { code: "will_slow_down", label: "Em sẽ học chậm lại và làm kỹ hơn.", requires_support: false },
        { code: "need_review_plan", label: "Em cần CTV gợi ý cách review.", requires_support: true },
      ],
      other_reason: commonSecondary,
    },
  },
  {
    templateId: "skill_plateau_support_question",
    version: 1,
    signalType: "skill_plateau",
    buildQuestion: (signal) =>
      `Phần ${signal.relatedSkill || signal.relatedPart || "đang yếu"} chưa cải thiện rõ. Bạn thường vướng ở điểm nào nhất?`,
    primaryOptions: [
      { code: "does_not_understand_method", label: "Em chưa biết cách làm dạng này.", requires_secondary: true, requires_support: true },
      { code: "vocabulary_gap", label: "Em thiếu từ vựng hoặc cụm diễn đạt.", requires_secondary: true, requires_support: true },
      { code: "time_pressure", label: "Em hiểu nhưng không kịp thời gian.", requires_secondary: true, requires_support: true },
      { code: "other_reason", label: "Lý do khác.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      does_not_understand_method: commonSecondary,
      vocabulary_gap: commonSecondary,
      time_pressure: commonSecondary,
      other_reason: commonSecondary,
    },
  },
  {
    templateId: "declining_skill_support_question",
    version: 1,
    signalType: "declining_skill",
    buildQuestion: (signal) =>
      `Mình thấy ${signal.relatedSkill || "một kỹ năng"} có dấu hiệu giảm ở checkpoint gần đây. Bạn nghĩ nguyên nhân chính là gì?`,
    primaryOptions: [
      { code: "rushed_recent_tests", label: "Em làm bài gần đây hơi vội.", requires_secondary: true },
      { code: "forgot_old_knowledge", label: "Em quên lại kiến thức cũ.", requires_secondary: true, requires_support: true },
      { code: "lesson_too_hard", label: "Bài gần đây khó hơn năng lực hiện tại.", requires_secondary: true, requires_support: true },
      { code: "other_reason", label: "Lý do khác.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      rushed_recent_tests: commonSecondary,
      forgot_old_knowledge: commonSecondary,
      lesson_too_hard: commonSecondary,
      other_reason: commonSecondary,
    },
  },
];

export function getTemplateForSignal(signalType: CareSignalType) {
  return CARE_QUESTION_TEMPLATES.find((template) => template.signalType === signalType);
}


