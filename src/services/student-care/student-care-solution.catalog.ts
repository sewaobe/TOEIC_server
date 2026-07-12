import { CareSignalType } from "../../models/student_care_conversation.model";
import { SuggestedSolution } from "./student-care.types";

export function resolveSuggestedSolutions(input: {
  signalType: CareSignalType;
  primaryAnswerCode: string;
  secondaryAnswerCode?: string;
  signalSnapshot: Record<string, any>;
}): SuggestedSolution[] {
  const { signalType, primaryAnswerCode, secondaryAnswerCode, signalSnapshot } = input;
  const relatedPart = signalSnapshot?.related_part;
  const relatedSkill = signalSnapshot?.related_skill;
  const codes = new Set([primaryAnswerCode, secondaryAnswerCode].filter(Boolean));
  const solutions: SuggestedSolution[] = [];

  if (signalType === "low_engagement" || codes.has("busy_schedule") || codes.has("lack_time")) {
    solutions.push({
      code: "recommend_short_session",
      title: "Gợi ý phiên học ngắn",
      description: "Đề nghị học viên quay lại bằng phiên 10-15 phút để giữ nhịp trước mốc xóa lộ trình.",
      action_type: "recommend_short_session",
    });
  }

  if (signalType === "no_recent_assessment" || codes.has("do_not_know_where") || codes.has("can_do_mini_test")) {
    solutions.push({
      code: "request_mini_test",
      title: "Yêu cầu làm checkpoint",
      description: "Hướng học viên làm Mini Test hoặc Full Test phù hợp để IRT cập nhật lại năng lực.",
      action_type: "request_assessment",
    });
  }

  if (
    signalType === "studying_without_score_gain" ||
    codes.has("not_reviewing_mistakes") ||
    codes.has("understand_lesson_but_fail_quiz") ||
    codes.has("need_review_plan")
  ) {
    solutions.push({
      code: "review_wrong_answers",
      title: "Hướng dẫn review câu sai",
      description: "Nhắc học viên ghi lại lỗi lặp lại, làm lại quiz/dictation/shadowing và không chỉ click hoàn thành.",
      action_type: "review_wrong_answers",
      action_payload: {
        part: relatedPart ?? null,
        skill: relatedSkill ?? null,
      },
    });
  }

  if (
    signalType === "skill_plateau" ||
    signalType === "declining_skill" ||
    codes.has("does_not_understand_method") ||
    codes.has("vocabulary_gap") ||
    codes.has("time_pressure") ||
    codes.has("lesson_too_hard")
  ) {
    solutions.push({
      code: "manual_support",
      title: "Hỗ trợ 1-1 theo điểm yếu",
      description: "CTV nên hỏi thêm ví dụ cụ thể học viên sai ở đâu, sau đó hướng dẫn cách làm cho part/skill liên quan.",
      action_type: "manual_support",
      action_payload: {
        part: relatedPart ?? null,
        skill: relatedSkill ?? null,
      },
    });
  }

  if (solutions.length === 0) {
    solutions.push({
      code: "send_advice",
      title: "Gửi lời khuyên học tập",
      description: "Phản hồi ngắn theo vấn đề học viên chọn và hẹn theo dõi lại sau vài ngày.",
      action_type: "send_advice",
    });
  }

  return solutions;
}


