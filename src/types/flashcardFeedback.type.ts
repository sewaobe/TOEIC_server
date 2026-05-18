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
