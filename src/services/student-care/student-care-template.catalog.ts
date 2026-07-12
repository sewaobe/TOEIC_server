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
  { code: "need_method_guidance", label: "Em cáº§n Ä‘Æ°á»£c hÆ°á»›ng dáº«n cÃ¡ch há»c pháº§n nÃ y.", requires_support: true },
  { code: "need_easier_material", label: "BÃ i hiá»‡n táº¡i hÆ¡i khÃ³, em cáº§n bÃ i dá»… hÆ¡n.", requires_support: true },
  { code: "lack_time", label: "Em thiáº¿u thá»i gian há»c Ä‘á»u.", requires_support: false },
  { code: "technical_or_other", label: "Em gáº·p váº¥n Ä‘á» khÃ¡c.", requires_support: true, allow_note: true },
];

export const CARE_QUESTION_TEMPLATES: CareQuestionTemplate[] = [
  {
    templateId: "low_engagement_support_question",
    version: 1,
    signalType: "low_engagement",
    buildQuestion: (signal) => {
      const inactiveDays = signal.metrics?.daysSinceLastActive;
      return `MÃ¬nh tháº¥y báº¡n Ä‘Ã£ ngÆ°ng há»c ${inactiveDays ?? "má»™t thá»i gian"} ngÃ y. Äiá»u gÃ¬ Ä‘ang lÃ m báº¡n khÃ³ quay láº¡i há»c nháº¥t?`;
    },
    primaryOptions: [
      { code: "busy_schedule", label: "Em Ä‘ang báº­n nÃªn chÆ°a sáº¯p xáº¿p Ä‘Æ°á»£c thá»i gian.", requires_secondary: true },
      { code: "lost_motivation", label: "Em hÆ¡i máº¥t Ä‘á»™ng lá»±c há»c.", requires_secondary: true, requires_support: true },
      { code: "lesson_too_hard", label: "BÃ i hiá»‡n táº¡i khÃ³ nÃªn em bá»‹ káº¹t.", requires_secondary: true, requires_support: true },
      { code: "other_reason", label: "LÃ½ do khÃ¡c.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      busy_schedule: [
        { code: "short_session_ok", label: "Em cÃ³ thá»ƒ há»c phiÃªn ngáº¯n 10-15 phÃºt.", requires_support: false },
        { code: "need_new_schedule", label: "Em cáº§n CTV gá»£i Ã½ lá»‹ch há»c phÃ¹ há»£p hÆ¡n.", requires_support: true },
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
      "Gáº§n Ä‘Ã¢y báº¡n chÆ°a cÃ³ bÃ i Ä‘Ã¡nh giÃ¡ má»›i nÃªn há»‡ thá»‘ng khÃ³ cáº­p nháº­t nÄƒng lá»±c. Báº¡n Ä‘ang vÆ°á»›ng gÃ¬ á»Ÿ viá»‡c lÃ m Mini Test hoáº·c Full Test?",
    primaryOptions: [
      { code: "test_too_long", label: "BÃ i Ä‘Ã¡nh giÃ¡ hÆ¡i dÃ i, em chÆ°a cÃ³ thá»i gian.", requires_secondary: true },
      { code: "not_ready_for_test", label: "Em chÆ°a tá»± tin lÃ m bÃ i Ä‘Ã¡nh giÃ¡.", requires_secondary: true, requires_support: true },
      { code: "do_not_know_where", label: "Em chÆ°a biáº¿t nÃªn lÃ m bÃ i nÃ o.", requires_support: true },
      { code: "other_reason", label: "LÃ½ do khÃ¡c.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      test_too_long: [
        { code: "can_do_mini_test", label: "Em cÃ³ thá»ƒ lÃ m Mini Test trÆ°á»›c.", requires_support: false },
        { code: "need_time_suggestion", label: "Em cáº§n CTV gá»£i Ã½ thá»i Ä‘iá»ƒm lÃ m bÃ i.", requires_support: true },
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
      "MÃ¬nh tháº¥y báº¡n váº«n há»c nhÆ°ng checkpoint chÆ°a cáº£i thiá»‡n rÃµ. Khi há»c xong bÃ i, báº¡n Ä‘ang gáº·p khÃ³ nháº¥t á»Ÿ bÆ°á»›c nÃ o?",
    primaryOptions: [
      { code: "not_reviewing_mistakes", label: "Em chÆ°a biáº¿t cÃ¡ch review cÃ¢u sai.", requires_secondary: true, requires_support: true },
      { code: "understand_lesson_but_fail_quiz", label: "Em hiá»ƒu bÃ i nhÆ°ng lÃ m quiz váº«n sai.", requires_secondary: true, requires_support: true },
      { code: "finish_too_fast", label: "Em chá»‰ hoÃ n thÃ nh nhanh, chÆ°a luyá»‡n ká»¹.", requires_secondary: true },
      { code: "other_reason", label: "LÃ½ do khÃ¡c.", allow_note: true, requires_support: true },
    ],
    secondaryOptionsByPrimary: {
      not_reviewing_mistakes: commonSecondary,
      understand_lesson_but_fail_quiz: commonSecondary,
      finish_too_fast: [
        { code: "will_slow_down", label: "Em sáº½ há»c cháº­m láº¡i vÃ  lÃ m ká»¹ hÆ¡n.", requires_support: false },
        { code: "need_review_plan", label: "Em cáº§n CTV gá»£i Ã½ cÃ¡ch review.", requires_support: true },
      ],
      other_reason: commonSecondary,
    },
  },
  {
    templateId: "skill_plateau_support_question",
    version: 1,
    signalType: "skill_plateau",
    buildQuestion: (signal) =>
      `Pháº§n ${signal.relatedSkill || signal.relatedPart || "Ä‘ang yáº¿u"} chÆ°a cáº£i thiá»‡n rÃµ. Báº¡n thÆ°á»ng vÆ°á»›ng á»Ÿ Ä‘iá»ƒm nÃ o nháº¥t?`,
    primaryOptions: [
      { code: "does_not_understand_method", label: "Em chÆ°a biáº¿t cÃ¡ch lÃ m dáº¡ng nÃ y.", requires_secondary: true, requires_support: true },
      { code: "vocabulary_gap", label: "Em thiáº¿u tá»« vá»±ng hoáº·c cá»¥m diá»…n Ä‘áº¡t.", requires_secondary: true, requires_support: true },
      { code: "time_pressure", label: "Em hiá»ƒu nhÆ°ng khÃ´ng ká»‹p thá»i gian.", requires_secondary: true, requires_support: true },
      { code: "other_reason", label: "LÃ½ do khÃ¡c.", allow_note: true, requires_support: true },
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
      `MÃ¬nh tháº¥y ${signal.relatedSkill || "má»™t ká»¹ nÄƒng"} cÃ³ dáº¥u hiá»‡u giáº£m á»Ÿ checkpoint gáº§n Ä‘Ã¢y. Báº¡n nghÄ© nguyÃªn nhÃ¢n chÃ­nh lÃ  gÃ¬?`,
    primaryOptions: [
      { code: "rushed_recent_tests", label: "Em lÃ m bÃ i gáº§n Ä‘Ã¢y hÆ¡i vá»™i.", requires_secondary: true },
      { code: "forgot_old_knowledge", label: "Em quÃªn láº¡i kiáº¿n thá»©c cÅ©.", requires_secondary: true, requires_support: true },
      { code: "lesson_too_hard", label: "BÃ i gáº§n Ä‘Ã¢y khÃ³ hÆ¡n nÄƒng lá»±c hiá»‡n táº¡i.", requires_secondary: true, requires_support: true },
      { code: "other_reason", label: "LÃ½ do khÃ¡c.", allow_note: true, requires_support: true },
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


