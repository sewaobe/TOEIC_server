import { ChatIntent, ChatRouteContext } from "../types/chat.types";

export type IntentEntity =
  | "roadmap"
  | "flashcard"
  | "question"
  | "attempt"
  | "progress"
  | "toeic_knowledge"
  | "app"
  | "smalltalk";

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
  if (tokens.length > 4) return false;

  return (
    /^(hi|hello|hey|alo|xin chao|chao|chao ban|cam on|cam on ban|cam on nhe|cam on nhieu|cam on ban nhieu|thanks|thank you|ok|okay|oke|duoc roi|uh|um|roi)$/.test(value) ||
    /\b(chan|nan|met|stress|het dong luc|buon ngu)\b/.test(value)
  );
}

function hasQuestionContext(routeContext?: ChatRouteContext) {
  return Boolean(routeContext?.questionId && routeContext?.attemptId);
}

function inferEntity(value: string): IntentEntity | undefined {
  if (isSmalltalkText(value)) {
    return "smalltalk";
  }
  if (/\b(roadmap|lo trinh|ke hoach hoc)\b/.test(value)) return "roadmap";
  if (/\b(flashcard|flash card|on tu|bo tu|hoc tu)\b/.test(value)) return "flashcard";
  if (
    /\b(cau nay|cau do|cau\s*\d+|question\s*\d+|dap an nay|doan nay|tu nay|cum nay|passage nay|bai doc nay|trong bai doc)\b/.test(
      value
    )
  ) {
    return "question";
  }
  if (/\b(luyen cau tuong tu|bai luyen tuong tu|cau tuong tu|cung tag|dang cau nay|skill cua cau nay)\b/.test(value)) {
    return "question";
  }
  if (
    /\b(de gan nhat|de moi nhat|bai nay|bai gan nhat|bai vua lam|bai moi nhat|bai lam|test gan nhat|attempt|ket qua bai|vua nop|vua lam)\b/.test(
      value
    )
  ) {
    return "attempt";
  }
  if (/\b(tien do|nang luc|ban do nang luc|trinh do|streak|target|muc tieu|diem hien tai|diem gan nhat)\b/.test(value)) {
    return "progress";
  }
  if (/\b(toeic|part\s*[1-7]|reading|listening|grammar|ngu phap|vocabulary|tu vung|meo|chien luoc|collocation)\b/.test(value)) {
    return "toeic_knowledge";
  }
  if (/\b(app|web|trang|tab|muc|nut|man hinh)\b/.test(value)) return "app";
  return undefined;
}

function inferAction(value: string): { action: IntentAction; confidence: IntentActionConfidence; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const roadmapProgressWhere = /\b(dang o dau trong lo trinh|toi o dau trong lo trinh|minh o dau trong lo trinh)\b/.test(value);

  const uiLocate =
    /\b(trong app|tren web|tab nao|muc nao|trang nao|nut nao|bam o dau|click o dau|xem o dau|o dau|cho nao|nam o dau|o dau trong app|o dau tren web|xem.*cho nao)\b/.test(
      value
    );
  const nonUiWhere =
    /\b(o dau tot|o dau hieu qua|trung tam nao|nen hoc o dau tot|nen hoc o dau hieu qua)\b/.test(value);

  if (/\b(tao|tao nhanh|sinh|generate|lam cho toi|lap|build|create)\b/.test(value)) {
    reasonCodes.push("action_create");
    return { action: "create", confidence: "high", reasonCodes };
  }
  if (/\b(mo|open)\b/.test(value)) {
    reasonCodes.push("action_open");
    return { action: "open", confidence: "high", reasonCodes };
  }
  if (/\b(di den|chuyen toi|cho toi vao|vao phan|navigate)\b/.test(value)) {
    reasonCodes.push("action_navigate");
    return { action: "navigate", confidence: "high", reasonCodes };
  }
  if (roadmapProgressWhere) {
    reasonCodes.push("action_ask_status");
    return { action: "ask_status", confidence: "high", reasonCodes };
  }
  if (uiLocate && !nonUiWhere) {
    reasonCodes.push("action_locate_ui");
    return { action: "locate_ui", confidence: "high", reasonCodes };
  }
  if (/\b(buoc tiep theo|hoc gi tiep|tiep theo hoc gi|stage tiep theo|giai doan tiep theo|hom nay.*hoc gi|nen hoc gi tiep)\b/.test(value)) {
    reasonCodes.push("action_next_step");
    return { action: "next_step", confidence: "high", reasonCodes };
  }
  if (/\b(dich|translate|nghia tieng viet|chuyen.*sang tieng viet)\b/.test(value)) {
    reasonCodes.push("action_translate");
    return { action: "translate", confidence: "high", reasonCodes };
  }
  if (/\b(giai thich|vi sao|tai sao|nghia la gi|dap an.*sai|dap an.*dung)\b/.test(value)) {
    reasonCodes.push("action_explain");
    return { action: "explain", confidence: "high", reasonCodes };
  }
  if (/\b(phan tich|review|tong ket|sai phan nao|sai nhieu|yeu phan nao|mau loi)\b/.test(value)) {
    reasonCodes.push("action_analyze");
    return { action: "analyze", confidence: "high", reasonCodes };
  }
  if (/\b(doi|chinh|dieu chinh|cap nhat|giam|tang)\b/.test(value) && /\b(roadmap|lo trinh|ke hoach)\b/.test(value)) {
    reasonCodes.push("action_adjust");
    return { action: "adjust", confidence: "high", reasonCodes };
  }
  if (/\b(nen hoc|goi y|recommend|de xuat|o dau tot|trung tam nao|nen.*lo trinh nao)\b/.test(value)) {
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
    if (/\b(nang luc|ban do nang luc|trinh do|muc nao|part nao|skill|uoc tinh diem)\b/.test(value)) {
      return "user_progress.ability_map";
    }
    return "user_progress.summary";
  }
  if (signal.entity === "attempt") return "test_attempt.analysis";
  if (signal.entity === "question") {
    if (/\b(luyen cau tuong tu|bai luyen tuong tu|cau tuong tu|cung tag|dang cau nay|skill cua cau nay)\b/.test(value)) {
      return routeContext?.questionId ? "question.similar_practice" : undefined;
    }
    if (!hasQuestionContext(routeContext)) return undefined;
    if (signal.action === "translate") return "question.translate_context";
    if (/\b(tu nay|cum nay|tu vung|word|phrase|nghia)\b/.test(value)) return "vocabulary.contextual";
    if (/\b(ngu phap|grammar|cau truc|loai tu|thi)\b/.test(value)) return "grammar.contextual";
    return "question.explain_specific";
  }
  if (signal.entity === "toeic_knowledge") return "toeic_knowledge.general";
  if (signal.entity === "app") return "app.navigation_support";
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
