export type FlashcardFeedbackAction =
  | "remember"
  | "vague"
  | "unknown"
  | "forgot";

export type LegacyFlashcardEvalType =
  | "easy"
  | "medium"
  | "hard"
  | "skip";

export const FLASHCARD_FEEDBACK_ACTIONS = [
  "remember",
  "vague",
  "unknown",
  "forgot",
] as const;

export const LEGACY_FLASHCARD_EVAL_TYPES = [
  "easy",
  "medium",
  "hard",
  "skip",
] as const;

export type FlashcardSessionCardPhase =
  | "NEW_LEARNING"
  | "NEW_GRADUATED"
  | "REVIEW_PENDING"
  | "REVIEW_REINFORCEMENT"
  | "REVIEW_RESOLVED";

export interface FlashcardSessionCardState {
  phase: FlashcardSessionCardPhase;
  long_term_committed: boolean;
  repeat_count: number;
}

export const FLASHCARD_SESSION_CARD_PHASES = [
  "NEW_LEARNING",
  "NEW_GRADUATED",
  "REVIEW_PENDING",
  "REVIEW_REINFORCEMENT",
  "REVIEW_RESOLVED",
] as const;
