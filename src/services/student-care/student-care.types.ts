import { CareSignalType, CareConversationStatus } from "../../models/student_care_conversation.model";

export type CareActionMode = "internal_only" | "care_conversation" | "direct_request";
export type CareSeverity = "info" | "warning" | "high";

export interface CareContextItem {
  code: string;
  label: string;
  value?: string | number | null;
}

export interface CareQuestionOption {
  code: string;
  label: string;
  requires_support?: boolean;
  allow_note?: boolean;
  requires_secondary?: boolean;
}

export interface CareSignal {
  signalType: CareSignalType;
  signalScopeKey: string;
  title: string;
  severity: CareSeverity;
  actionMode: CareActionMode;
  contextSummary: CareContextItem[];
  internalHypotheses: string[];
  relatedSkill?: string;
  relatedPart?: number;
  relatedQuestionType?: string;
  metrics?: Record<string, unknown>;
  suggestedQuestion?: {
    templateId: string;
    version: number;
    text: string;
  };
  hasOpenConversation: boolean;
  openConversationId?: string;
}

export interface CareConversationSummaryDto {
  id: string;
  signalType: CareSignalType;
  signalTitle: string;
  signalScopeKey: string;
  status: CareConversationStatus;
  questionText: string;
  primaryAnswer?: { code: string; label: string };
  secondaryAnswer?: { code: string; label: string };
  studentNote?: string;
  respondedAt?: string;
  latestSolutionAt?: string;
  followUpDueAt?: string;
  createdAt: string;
}

export interface SuggestedSolution {
  code: string;
  title: string;
  description: string;
  action_type:
    | "send_advice"
    | "review_wrong_answers"
    | "recommend_easier_practice"
    | "recommend_short_session"
    | "request_assessment"
    | "manual_support";
  action_payload?: Record<string, unknown>;
}


