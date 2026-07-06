import { ChatIntent, ChatRouteContext } from "../types/chat.types";

export type IntentEntity =
  | "roadmap"
  | "flashcard"
  | "question"
  | "lesson"
  | "attempt"
  | "user_profile"
  | "progress"
  | "toeic_knowledge"
  | "app"
  | "smalltalk"
  | "out_of_project";

export type IntentAction =
  | "general_ask"
  | "ask_status"
  | "locate_ui"
  | "open"
  | "navigate"
  | "create"
  | "explain"
  | "translate"
  | "analyze"
  | "next_step"
  | "recommend"
  | "adjust";

export type IntentActionConfidence = "high" | "medium" | "low";

export type IntentRequiredContext = "userId" | "questionId" | "attemptId";

export interface IntentSignalMetadata {
  entities: IntentEntity[];
  actions: IntentAction[];
  defaultAction?: IntentAction;
  requiredContext?: IntentRequiredContext[];
  forbiddenActions?: IntentAction[];
}

export interface ExtractedIntentSignal {
  entity?: IntentEntity;
  action: IntentAction;
  actionConfidence: IntentActionConfidence;
  intentHint?: ChatIntent;
  reasonCodes: string[];
}

export function normalizeIntentSignalText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSmalltalkText(value: string) {
  const tokens = value.split(" ").filter(Boolean);
  const hasConcreteRequest =
    /\b(roadmap|lo trinh|flashcard|toeic|part\s*[1-7]|cau nay|dap an|dich|translate|giai thich|tao|create|mo|open|trang|tab|muc|nut|man hinh|tien do|tien bo|profile|cham hoc|nang luc|bai test|de thi|hoc gi|next|ke tiep)\b/.test(value);
  if (hasConcreteRequest) return false;
  if (
    /^(hi|hello|hey|alo|xin chao|chao|chao ban|cam on|cam on ban|cam on nhe|cam on nhieu|cam on ban nhieu|thanks|thank you|ok|okay|oke|duoc roi|uh|um|roi)\b/.test(value)
  ) {
    return tokens.length <= 10;
  }

  return (
    tokens.length <= 10 &&
    /\b(chan|nan|met|stress|het dong luc|buon ngu)\b/.test(value)
  );
}

function hasPersonalExamAttemptSignal(value: string) {
  const hasExamAnchor =
    /\b(de thi nay|de thi hien tai|de thi dang xem|de thi gan nhat|de thi moi nhat|de thi vua lam|de thi vua nop|de thi cua toi)\b/.test(value);
  const hasAttemptAction =
    /\b(phan tich|review|tom tat|danh gia|xem|sai|loi|yeu|manh|mat diem|diem|ket qua|dang nao|nhom cau|the nao|ra sao|o dau|phan nao|part nao)\b/.test(value);
  const theoryOrNavigation =
    /\b(format|cau truc|dinh dang|co may|bao nhieu|nen luyen|cach luyen|cach lam|lam sao|meo|chien luoc|o dau trong app|muc nao|tab nao|trang nao|nut nao|trong app|tren web)\b/.test(value);
  return hasExamAnchor && hasAttemptAction && !theoryOrNavigation;
}

function hasFlashcardCreateSignal(value: string) {
  const hasCreateAction =
    /\b(tao|tao nhanh|sinh|generate|lam cho toi|lam.*bo|lap|build|create|them|add|luu|save)\b/.test(value);
  const hasCountedWordRequest =
    /\b\d{1,2}\s*(tu|tu vung|word|words?|flashcard|cards?)\b/.test(value);
  const hasFlashcardTarget =
    /\b(flashcards?|flash cards?|cards?|bo tu|the tu vung|tu vung|vocab|word|tu de hoc|hoc tu|tu moi)\b/.test(value);
  const hasTopicOrQuestionSource =
    /\b(chu de|ve|theo chu de|tu chu de|tu cau nay|trong cau nay|cau sai nay|cau nay|tu sai|cac tu sai|wrong answers|mistakes|my mistakes|this word|tu nay|vocab nay|bai vua lam|hay sai|de hoc)\b/.test(value) ||
    /\b(office|business|meeting|travel|workplace|company|email|project|sales|customer|house)\b/.test(value);
  return hasCreateAction && (hasFlashcardTarget || hasCountedWordRequest) && (hasTopicOrQuestionSource || hasFlashcardTarget);
}

function hasQuestionFlashcardCreateSignal(value: string) {
  const hasQuestionAnchor =
    /\b(cau nay|cau sai nay|tu cau nay|trong cau nay|question nay|this question)\b/.test(value);
  const hasFlashcardConversion =
    /\b(thanh flashcard|thanh the|de hoc|bo tu|flashcard|cards?)\b/.test(value);
  return hasQuestionAnchor && (hasFlashcardCreateSignal(value) || hasFlashcardConversion);
}

function hasVocabularyLookupSignal(value: string) {
  return (
    /\b(tu nay|cum nay|tu vung|vocab|word|phrase|nghia|collocation|synonym|paraphrase|keyword)\b/.test(value) ||
    /\b(giai thich|explain|nghia cua|meaning of)\s+tu\s+[a-z0-9]+\b/.test(value) ||
    /\btu\s+[a-z0-9]+\s+(trong cau nay|trong ngu canh nay|nghia la gi|co nghia gi)\b/.test(value)
  );
}

function hasRoadmapNextStepSignal(value: string) {
  return /\b(hom nay.*hoc gi|hom nay.*nen hoc|bai tiep theo|lesson tiep theo|hoc gi tiep|nen hoc gi tiep|tiep theo hoc gi|goi y bai hoc tiep theo|hoc gi theo lo trinh|bai hoc tiep theo cua toi|goi y theo tien do hien tai|buoc tiep theo|next step|today plan)\b/.test(value);
}

function hasQuestionSimilarPracticeSignal(value: string) {
  return /\b(luyen cau tuong tu|bai luyen tuong tu|cau tuong tu|cung tag|dang cau nay|skill cua cau nay|bai tap lien quan|lien quan den cau|cau dang xem|lam them dang|na na|cung pattern|more drills|duong dan luyen|de xuat practice|cung dang|giong cau|similar|practice dang nay|luyen them|cho them.*cau)\b/.test(value);
}

function hasLessonRecommendationSignal(value: string) {
  if (
    hasRoadmapNextStepSignal(value) ||
    hasQuestionSimilarPracticeSignal(value) ||
    hasQuestionFlashcardCreateSignal(value) ||
    hasFlashcardCreateSignal(value) ||
    hasVocabularyLookupSignal(value) ||
    /\b(dich|translate|ban dich|nghia tieng viet)\b/.test(value)
  ) {
    return false;
  }
  const hasAction =
    /\b(goi y|de xuat|tim|cho toi|cho minh|recommend|suggest|find|list|danh sach)\b/.test(value);
  const hasLearningObject =
    /\b(bai hoc|lessons?|bai luyen|activity|activities|unit|hoc phan)\b/.test(value);
  const hasAcademicFilter =
    /\b(part\s*[1-7]|phan\s*[1-7]|ngu phap|grammar|dang|chu de|ky nang|skill|tag|relative clause|menh de|tu loai|danh tu|dong tu|tinh tu|trang tu|gioi tu|lien tu|cau bi dong|suy luan|inference|main idea|chi tiet|detail|company|office|travel|shopping|email|meeting|reading|listening)\b/.test(value);
  return hasAction && hasLearningObject && hasAcademicFilter;
}

function hasGrammarContextSignal(value: string) {
  return /\b(grammar|grammar point|ngu phap|cau truc|loai tu|danh tu|trang tu|tinh tu|dong tu|chu ngu|vi ngu|chia|dau hieu|thi|tense|participle|past participle|v ing|to v|menh de|cho trong)\b/.test(value);
}

function hasPhilosophicalIdentitySignal(value: string) {
  return /\b(cuoc doi|tren doi|ngoai doi|nguoi tot|song nhu the nao|y nghia cuoc song|ban chat|con nguoi)\b/.test(value);
}

function hasAccountMutationSignal(value: string) {
  return /\b(doi|sua|cap nhat|update|change|xoa|quen)\b/.test(value) &&
    /\b(tai khoan|account|email|ten hien thi|username|mat khau|password|avatar|profile|ho so)\b/.test(value);
}

function hasUserProfileSignal(value: string) {
  if (hasPhilosophicalIdentitySignal(value)) return false;
  const directIdentity =
    /\b(toi la ai|minh la ai|ban biet gi ve toi|ban dang biet gi ve toi|ban co biet toi la ai)\b/.test(value);
  const profileAnchor =
    /\b(thong tin ca nhan|ho so|profile|account|tai khoan|email dang dang nhap|email cua toi|ten hien thi|ten cua toi|username|user name|dang dung tai khoan|dang nhap tai khoan)\b/.test(value);
  const updateOrNavigation =
    hasAccountMutationSignal(value) ||
    /\b(mo|vao|mat khau|password|avatar)\b/.test(value);
  return (directIdentity || profileAnchor) && !updateOrNavigation;
}

function hasAppNavigationSignal(value: string) {
  const hasDirectUiAnchor =
    /\b(trong app|tren web|tab nao|muc nao trong app|trang nao|nut nao|man hinh|dashboard|bam o dau|click o dau|xem o dau|cho nao trong app|nam o dau)\b/.test(value);
  const hasUiFeature =
    /\b(review cau sai|cau sai|dap an|ket qua|tien do|bai test|bai thi|lam test|lam de|luyen de|bai lam|chi tiet)\b/.test(value);
  const hasWhereQuestion =
    /\b(o dau|cho nao|nam dau|nam o dau|xem.*cho nao|xem.*o dau)\b/.test(value);
  const isGeneralToeicAdvice =
    /\b(nen|bao nhieu|moi tuan|moi ngay|cach|meo|chien luoc|format|cau truc|dinh dang)\b/.test(value);
  const isProgressLevelStatus =
    /\b(dang o muc nao|toi o muc nao|minh o muc nao|trinh do nao|level nao)\b/.test(value);

  if (isProgressLevelStatus || isGeneralToeicAdvice) return false;
  return hasDirectUiAnchor || (hasWhereQuestion && hasUiFeature);
}

function hasQuestionContext(routeContext?: ChatRouteContext) {
  return Boolean(routeContext?.questionId && routeContext?.attemptId);
}

function inferEntity(value: string): IntentEntity | undefined {
  if (isSmalltalkText(value)) {
    return "smalltalk";
  }
  if (hasUserProfileSignal(value)) {
    return "user_profile";
  }
  if (hasAccountMutationSignal(value)) {
    return "app";
  }
  if (/\b(thoi tiet|weather|co mua|sai gon.*mua|troi mua|troi nang|mua hay nang|gia vang|gia do|usd|bitcoin|btc|crypto|bong da|tran bong|phim|nau|recipe|laptop|dien thoai|may anh|du lich|ve tau|ve may bay|facebook|caption|quang cao|ban ao|trang tri|chuyen vui|chinh tri|cong nghe moi nhat|tin tuc|quan an)\b/.test(value)) {
    return "out_of_project";
  }
  if (
    /\b(roadmap|lo trinh|ke hoach hoc|ke hoach|plan hoc|study plan|today plan)\b/.test(value) ||
    /\b(plan|lesson|recommendation)\b.*\b(chon|why|sao|ly do|reason)\b/.test(value) ||
    /\b(hom nay).*\b(hoc|lesson|task|bai)\b/.test(value) ||
    /\b(tiep theo|ke tiep|next step|next action|lesson tiep|bai tiep theo|den luot)\b/.test(value) ||
    /\b(he thong|stage|cycle|roadmap|plan|ke hoach|muc tieu)\b.*\b(chon|xep|de xuat|goi y|uu tien|tap trung|dan toi)\b/.test(value)
  ) return "roadmap";
  if (hasLessonRecommendationSignal(value)) return "lesson";
  if (
    hasFlashcardCreateSignal(value) ||
    /\b(flashcard|flash card|cards?|deck|on tu|bo tu|bo the|hoc tu|the tu|the hoc|the da luu|vocab nay|save vocab)\b/.test(value)
  ) return "flashcard";
  if (hasAppNavigationSignal(value)) return "app";
  if (
    /\b(cau nay|cau do|cau hien tai|cau dang xem|cau\s*\d+|question\s*\d+|dap an nay|doan nay|tu nay|cum nay|passage nay|bai doc nay|trong bai doc|option|lua chon|cho trong|highlight|highlighted|keyword)\b/.test(
      value
    )
  ) {
    return "question";
  }
  if (/\b(luyen cau tuong tu|bai luyen tuong tu|cau tuong tu|cung tag|dang cau nay|skill cua cau nay|bai tap lien quan|lam them dang|na na|cung pattern|more drills|duong dan luyen|de xuat practice|cung dang|giong cau|similar|practice dang nay|luyen them)\b/.test(value)) {
    return "question";
  }
  if (
    hasPersonalExamAttemptSignal(value) ||
    /\b(de gan nhat|de moi nhat|bai nay|bai test|bai thi|bai gan nhat|bai vua lam|bai moi nhat|bai lam|test gan nhat|lan test|attempt|ket qua bai|vua nop|moi nop|vua lam)\b/.test(
      value
    )
  ) {
    return "attempt";
  }
  if (/\b(trong app|tren web|tab|nut|man hinh|dashboard|review cau sai|trang(?! thai)|o dau trong app|cho nao trong app|nam dau)\b/.test(value)) return "app";
  if (/\b(tien do|tien bo|tinh hinh hoc|hoc tap|tong the|tong quan|profile hoc|buc tranh|di dung huong|theo kip|cham hoc|nang luc|ability map|ban do nang luc|trinh do|streak|target|muc tieu|diem hien tai|diem gan nhat|ky nang|skill|part nao|manh|yeu|level|listening hay reading|reading listening)\b/.test(value)) {
    return "progress";
  }
  if (/\b(toeic|part\s*[1-7]|reading|listening|grammar|ngu phap|vocabulary|tu vung|meo|chien luoc|collocation)\b/.test(value)) {
    return "toeic_knowledge";
  }
  if (/\b(app|web|trang(?! thai)|tab|muc|nut|man hinh|bam dau|click dau|o dau|cho nao|nam dau|dashboard|review cau sai|lam test|luyen de|ket qua)\b/.test(value)) return "app";
  return undefined;
}

function inferAction(value: string): { action: IntentAction; confidence: IntentActionConfidence; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const roadmapProgressWhere = /\b(dang o dau trong lo trinh|toi o dau trong lo trinh|minh o dau trong lo trinh)\b/.test(value);
  const progressLevelStatus = /\b(dang o muc nao|toi o muc nao|minh o muc nao|trinh do nao|level nao)\b/.test(value);

  const uiLocate =
    /\b(trong app|tren web|tab nao|muc nao|trang nao|nut nao|bam o dau|click o dau|xem o dau|o dau|cho nao|nam o dau|o dau trong app|o dau tren web|xem.*cho nao)\b/.test(
      value
    );
  const nonUiWhere =
    /\b(o dau tot|o dau hieu qua|trung tam nao|nen hoc o dau tot|nen hoc o dau hieu qua)\b/.test(value);

  if (/\b(tao|tao nhanh|sinh|generate|lam cho toi|lam.*bo|lap|build|create|them|add|luu|save|gom.*flashcard|thanh flashcard|thanh the|bien.*thanh|deck moi|bo.*moi)\b/.test(value)) {
    reasonCodes.push("action_create");
    return { action: "create", confidence: "high", reasonCodes };
  }
  if (/\b(mo|open|bat)\b/.test(value)) {
    reasonCodes.push("action_open");
    return { action: "open", confidence: "high", reasonCodes };
  }
  if (/\b(di den|dan.*toi|dua.*ve|dieu huong.*toi|chuyen toi|chuyen sang|chuyen qua|cho (toi|minh) vao|vao phan|vao lo trinh|navigate)\b/.test(value)) {
    reasonCodes.push("action_navigate");
    return { action: "navigate", confidence: "high", reasonCodes };
  }
  if (
    /\b(xem|muon xem|cho.*xem|nhin|show)\b/.test(value) &&
    /\b(trang|tab|page|giao dien|man hinh|roadmap|lo trinh|flashcard|dashboard)\b/.test(value) &&
    !/\b(tien do|trang thai|status|ket qua|bai lam)\b/.test(value)
  ) {
    reasonCodes.push("action_open");
    return { action: "open", confidence: "high", reasonCodes };
  }
  if (roadmapProgressWhere || progressLevelStatus) {
    reasonCodes.push("action_ask_status");
    return { action: "ask_status", confidence: "high", reasonCodes };
  }
  if (
    /\b(bai test|bai thi|lan test|attempt|bai vua|vua nop|moi nop|ket qua bai)\b/.test(value) &&
    /\b(phan tich|review|tom tat|sai|loi|yeu|mat diem|ket qua|dang nao|nhom cau)\b/.test(value)
  ) {
    reasonCodes.push("action_analyze");
    return { action: "analyze", confidence: "high", reasonCodes };
  }
  if (hasPersonalExamAttemptSignal(value)) {
    reasonCodes.push("action_analyze");
    return { action: "analyze", confidence: "high", reasonCodes };
  }
  if (uiLocate && !nonUiWhere) {
    reasonCodes.push("action_locate_ui");
    return { action: "locate_ui", confidence: "high", reasonCodes };
  }
  if (/\b(buoc tiep theo|next step|next action|hoc gi|lam gi tiep|tiep theo hoc gi|stage tiep theo|giai doan tiep theo|hom nay.*hoc|hom nay.*bai|hom nay.*lesson|hom nay.*task|nen hoc gi tiep|lesson tiep|bai tiep theo|task.*ke tiep|nhiem vu ke tiep|den luot.*hoc|chon.*hoat dong tiep|roadmap bao.*lam)\b/.test(value)) {
    reasonCodes.push("action_next_step");
    return { action: "next_step", confidence: "high", reasonCodes };
  }
  if (/\b(dich|translate|nghia tieng viet|chuyen.*sang tieng viet)\b/.test(value)) {
    reasonCodes.push("action_translate");
    return { action: "translate", confidence: "high", reasonCodes };
  }
  if (/\b(giai thich|vi sao|tai sao|why|reason|ly do|logic|nguyen nhan|lien quan gi|dua tren gi|nghia la gi|dap an.*sai|dap an.*dung)\b/.test(value)) {
    reasonCodes.push("action_explain");
    return { action: "explain", confidence: "high", reasonCodes };
  }
  if (/\b(phan tich|review|tong ket|sai phan nao|sai nhieu|yeu phan nao|mau loi)\b/.test(value)) {
    reasonCodes.push("action_analyze");
    return { action: "analyze", confidence: "high", reasonCodes };
  }
  if (/\b(doi|chinh|dieu chinh|adjust|update|cap nhat|giam|tang|sua lai|sap xep lai|uu tien|nang|nhe)\b/.test(value) && /\b(roadmap|lo trinh|ke hoach|plan)\b/.test(value)) {
    reasonCodes.push("action_adjust");
    return { action: "adjust", confidence: "high", reasonCodes };
  }
  if (/\b(nen hoc|goi y|recommend|suggest|de xuat|tim|find|cho toi|cho minh|o dau tot|trung tam nao|nen.*lo trinh nao)\b/.test(value)) {
    reasonCodes.push("action_recommend");
    return { action: "recommend", confidence: "medium", reasonCodes };
  }
  if (/\b(the nao|ra sao|toi dau|den dau|hien tai|hoan thanh|tien do|dang o dau trong lo trinh|muc nao|trinh do nao)\b/.test(value)) {
    reasonCodes.push("action_ask_status");
    return { action: "ask_status", confidence: "high", reasonCodes };
  }

  reasonCodes.push("action_general_ask");
  return { action: "general_ask", confidence: value.split(" ").length <= 5 ? "medium" : "low", reasonCodes };
}

function inferIntentHint(signal: Omit<ExtractedIntentSignal, "intentHint">, value: string, routeContext?: ChatRouteContext): ChatIntent | undefined {
  if (signal.entity === "smalltalk") return "smalltalk.greeting_feedback";
  if (signal.entity === "user_profile") return "user_profile.identity";
  if (signal.entity === "roadmap") {
    if (["locate_ui", "open", "navigate"].includes(signal.action)) return "roadmap.guidance";
    if (signal.action === "next_step" || signal.action === "recommend") {
      if (/\b(o dau tot|trung tam nao|hoc o dau tot|hoc o dau hieu qua)\b/.test(value)) return "toeic_knowledge.general";
      if (/\b(theo lo trinh nao|lo trinh nao)\b/.test(value)) return "roadmap.summary";
      return "roadmap.next_step";
    }
    if (signal.action === "explain" || signal.action === "analyze") return "roadmap.explain_recommendation";
    if (signal.action === "adjust") return "roadmap.adjust";
    return "roadmap.summary";
  }
  if (signal.entity === "flashcard") {
    if (signal.action === "create") return "flashcard.create";
    return "flashcard.personal";
  }
  if (signal.entity === "progress") {
    if (/\b(nang luc|ban do nang luc|trinh do|muc nao|part nao|skill|ky nang|manh|yeu|level|listening|reading|uoc tinh diem)\b/.test(value)) {
      return "user_progress.ability_map";
    }
    return "user_progress.summary";
  }
  if (signal.entity === "lesson") return "lesson.recommendation";
  if (signal.entity === "attempt") return "test_attempt.analysis";
  if (signal.entity === "question") {
    if (signal.action === "create" && hasQuestionFlashcardCreateSignal(value)) return "flashcard.create";
    if (/\b(luyen cau tuong tu|bai luyen tuong tu|cau tuong tu|cung tag|dang cau nay|skill cua cau nay|bai tap lien quan|lam them dang|cau luyen|practice cung|noi dung luyen lai|na na|cung pattern|more drills|duong dan luyen|de xuat practice|cung dang|giong cau|similar|practice dang nay|luyen them|cho them.*cau)\b/.test(value)) {
      return "question.similar_practice";
    }
    if (signal.action === "translate") return "question.translate_context";
    if (hasVocabularyLookupSignal(value)) return "vocabulary.contextual";
    if (hasGrammarContextSignal(value)) return "grammar.contextual";
    return "question.explain_specific";
  }
  if (signal.entity === "toeic_knowledge") return "toeic_knowledge.general";
  if (signal.entity === "app") return "app.navigation_support";
  if (signal.entity === "out_of_project") return "out_of_project.general";
  if (signal.action === "translate") return "question.translate_context";
  if (signal.action === "next_step") return "roadmap.next_step";
  return undefined;
}

export function extractIntentSignal(userText: string, routeContext?: ChatRouteContext): ExtractedIntentSignal {
  const value = normalizeIntentSignalText(userText);
  const entity = inferEntity(value);
  const actionResult = inferAction(value);
  const baseSignal: Omit<ExtractedIntentSignal, "intentHint"> = {
    entity,
    action: actionResult.action,
    actionConfidence: entity ? actionResult.confidence : "low",
    reasonCodes: [
      ...(entity ? [`entity_${entity}`] : ["entity_unknown"]),
      ...actionResult.reasonCodes,
    ],
  };
  return {
    ...baseSignal,
    intentHint: inferIntentHint(baseSignal, value, routeContext),
  };
}
