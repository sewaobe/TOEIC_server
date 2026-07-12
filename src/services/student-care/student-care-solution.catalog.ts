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
      title: "Gá»£i Ã½ phiÃªn há»c ngáº¯n",
      description: "Äá» nghá»‹ há»c viÃªn quay láº¡i báº±ng phiÃªn 10-15 phÃºt Ä‘á»ƒ giá»¯ nhá»‹p trÆ°á»›c má»‘c xÃ³a lá»™ trÃ¬nh.",
      action_type: "recommend_short_session",
    });
  }

  if (signalType === "no_recent_assessment" || codes.has("do_not_know_where") || codes.has("can_do_mini_test")) {
    solutions.push({
      code: "request_mini_test",
      title: "YÃªu cáº§u lÃ m checkpoint",
      description: "HÆ°á»›ng há»c viÃªn lÃ m Mini Test hoáº·c Full Test phÃ¹ há»£p Ä‘á»ƒ IRT cáº­p nháº­t láº¡i nÄƒng lá»±c.",
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
      title: "HÆ°á»›ng dáº«n review cÃ¢u sai",
      description: "Nháº¯c há»c viÃªn ghi láº¡i lá»—i láº·p láº¡i, lÃ m láº¡i quiz/dictation/shadowing vÃ  khÃ´ng chá»‰ click hoÃ n thÃ nh.",
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
      title: "Há»— trá»£ 1-1 theo Ä‘iá»ƒm yáº¿u",
      description: "CTV nÃªn há»i thÃªm vÃ­ dá»¥ cá»¥ thá»ƒ há»c viÃªn sai á»Ÿ Ä‘Ã¢u, sau Ä‘Ã³ hÆ°á»›ng dáº«n cÃ¡ch lÃ m cho part/skill liÃªn quan.",
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
      title: "Gá»­i lá»i khuyÃªn há»c táº­p",
      description: "Pháº£n há»“i ngáº¯n theo váº¥n Ä‘á» há»c viÃªn chá»n vÃ  háº¹n theo dÃµi láº¡i sau vÃ i ngÃ y.",
      action_type: "send_advice",
    });
  }

  return solutions;
}


