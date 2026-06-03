import { Types } from "mongoose";
import {
  DictationProgress,
  DictationProgressDifficulty,
  IDictationProgress,
} from "../models/dictation_progress.model";
import { createDictationAttempt } from "./dictation_attempt.service";

export interface DictationProgressPatch {
  difficulty?: DictationProgressDifficulty;
  current_index?: number;
  completed_indices?: number[];
  sentence_records?: Record<string, unknown>;
  attempt_logs?: unknown[];
  summary?: Record<string, unknown>;
}

const toObjectId = (value: string, label: string) => {
  if (!Types.ObjectId.isValid(value)) {
    const error = new Error(`${label} không hợp lệ`) as Error & { status?: number };
    error.status = 400;
    throw error;
  }

  return new Types.ObjectId(value);
};

const ensureOwnedProgress = async (progressId: string, userId: string) => {
  const progress = await DictationProgress.findOne({
    _id: toObjectId(progressId, "progressId"),
    user_id: toObjectId(userId, "userId"),
  });

  if (!progress) {
    const error = new Error("Không tìm thấy tiến trình dictation") as Error & {
      status?: number;
    };
    error.status = 404;
    throw error;
  }

  return progress;
};

export const getActiveDictationProgressService = async (
  userId: string,
  dictationId: string,
) => {
  return DictationProgress.findOne({
    user_id: toObjectId(userId, "userId"),
    dictation_id: toObjectId(dictationId, "dictationId"),
    status: "in_progress",
  }).sort({ last_activity_at: -1 });
};

export const startDictationProgressService = async (
  userId: string,
  dictationId: string,
  difficulty: DictationProgressDifficulty = "hard",
) => {
  const active = await getActiveDictationProgressService(userId, dictationId);

  if (active) {
    return active;
  }

  return DictationProgress.create({
    user_id: toObjectId(userId, "userId"),
    dictation_id: toObjectId(dictationId, "dictationId"),
    difficulty,
    status: "in_progress",
    current_index: 0,
    completed_indices: [],
    sentence_records: {},
    attempt_logs: [],
    summary: {},
    started_at: new Date(),
    last_activity_at: new Date(),
  });
};

export const updateDictationProgressService = async (
  progressId: string,
  userId: string,
  patch: DictationProgressPatch,
) => {
  const progress = await ensureOwnedProgress(progressId, userId);

  if (progress.status !== "in_progress") {
    const error = new Error("Chỉ có thể cập nhật tiến trình đang học") as Error & {
      status?: number;
    };
    error.status = 400;
    throw error;
  }

  if (patch.difficulty) progress.difficulty = patch.difficulty;
  if (typeof patch.current_index === "number") {
    progress.current_index = Math.max(0, patch.current_index);
  }
  if (Array.isArray(patch.completed_indices)) {
    progress.completed_indices = Array.from(new Set(patch.completed_indices));
  }
  if (patch.sentence_records) progress.sentence_records = patch.sentence_records;
  if (Array.isArray(patch.attempt_logs)) progress.attempt_logs = patch.attempt_logs;
  if (patch.summary) progress.summary = patch.summary;

  progress.last_activity_at = new Date();
  await progress.save();
  return progress;
};

export const completeDictationProgressService = async (
  progressId: string,
  userId: string,
  patch: DictationProgressPatch & { attempts: Partial<any>[] },
) => {
  if (!Array.isArray(patch.attempts) || patch.attempts.length === 0) {
    const error = new Error("attempts phải có ít nhất một phần tử khi hoàn thành dictation") as Error & {
      status?: number;
    };
    error.status = 400;
    throw error;
  }

  const progress = await updateDictationProgressService(progressId, userId, patch);
  const attempts = await createDictationAttempt(
    patch.attempts,
    userId,
    progress.dictation_id.toString(),
  );

  let completion_warning: string | null = null;
  try {
    progress.status = "completed";
    progress.completed_at = new Date();
    progress.last_activity_at = new Date();
    await progress.save();
  } catch (err) {
    completion_warning = "Dictation attempts were saved, but progress could not be marked completed.";
    console.error(completion_warning, err);
  }

  return { progress, attempts, completion_warning };
};

export const cancelDictationProgressService = async (
  progressId: string,
  userId: string,
): Promise<IDictationProgress> => {
  const progress = await ensureOwnedProgress(progressId, userId);
  progress.status = "cancelled";
  progress.last_activity_at = new Date();
  await progress.save();
  return progress;
};
