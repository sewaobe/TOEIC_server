import {
  submitReviewSession,
  ReviewSessionItem,
  updateProgressWithDeltas,
} from "./hlr.service";

const HLR_UPDATE_MAX_ATTEMPTS = 2;

/**
 * HLR Integration Service
 *
 * Helper service để tích hợp HLR vào các luồng học từ vựng hiện có.
 * KHÔNG thay đổi logic cũ, chỉ gọi HLR sau khi submit xong.
 *
 * Mapping eval_type → is_correct:
 * - skip   → true  (User tự tin đã thuộc)
 * - easy   → true  (Nhớ rất tốt)
 * - medium → false (Còn chưa chắc → cần ôn)
 * - hard   → false (Không nhớ → ôn sớm)
 */

// ============================================
// TYPES
// ============================================

export type EvalType = "skip" | "easy" | "medium" | "hard";

export interface FlashcardLog {
  vocab_id: string;
  vocab_word?: string;
  eval_type: EvalType;
  response_time?: number;
  attempted_at?: string;
}

export interface MatchingGameResult {
  vocabularyIds: string[]; // Tất cả vocabulary IDs trong game
  correctPairIds: string[]; // IDs của các từ ghép đúng
  wrongAttemptCounts?: Record<string, number>; // Map vocab_id -> số lần click sai
}

export interface WordRecallResult {
  correctWordIds: string[]; // IDs từ gõ đúng
  wrongWordIds: string[]; // IDs từ gõ sai hoặc hết giờ
}

async function updateProgressWithRetry(
  userId: string,
  vocabularyId: string,
  rightDelta: number,
  wrongDelta: number,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= HLR_UPDATE_MAX_ATTEMPTS; attempt++) {
    try {
      await updateProgressWithDeltas(
        userId,
        vocabularyId,
        rightDelta,
        wrongDelta,
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map eval_type → is_correct
 * - skip, easy → true (user nhớ)
 * - medium, hard → false (user cần ôn thêm)
 */
function mapEvalToCorrect(evalType: EvalType): boolean {
  return evalType === "skip" || evalType === "easy";
}

/**
 * Aggregate logs - Tổng hợp số lần đúng/sai cho mỗi từ trong session
 *
 * Thay vì chỉ lấy kết quả cuối cùng, HLR cần đếm TẤT CẢ các lần gặp từ:
 * - Mỗi lần skip/easy → +1 right
 * - Mỗi lần medium/hard → +1 wrong
 *
 * Ví dụ: từ "apple" được đánh giá: hard → hard → medium → skip
 * → right_delta = 1, wrong_delta = 3
 */
interface AggregatedResult {
  vocabulary_id: string;
  right_delta: number;
  wrong_delta: number;
}

function aggregateLogs(logs: FlashcardLog[]): AggregatedResult[] {
  const aggregateMap = new Map<string, { right: number; wrong: number }>();

  for (const log of logs) {
    const current = aggregateMap.get(log.vocab_id) || { right: 0, wrong: 0 };

    if (mapEvalToCorrect(log.eval_type)) {
      current.right += 1;
    } else {
      current.wrong += 1;
    }

    aggregateMap.set(log.vocab_id, current);
  }

  return Array.from(aggregateMap.entries()).map(([vocab_id, counts]) => ({
    vocabulary_id: vocab_id,
    right_delta: counts.right,
    wrong_delta: counts.wrong,
  }));
}

// ============================================
// MAIN INTEGRATION FUNCTIONS
// ============================================

/**
 * Cập nhật HLR từ flashcard logs (Classic mode)
 * Gọi sau khi submitFlashCard hoặc finalize thành công
 *
 * Logic mới: Đếm TẤT CẢ các lần đúng/sai cho mỗi từ trong session
 * - Mỗi lần skip/easy → +1 right
 * - Mỗi lần medium/hard → +1 wrong
 *
 * @param userId - User ID
 * @param logs - Mảng logs từ flashcard session
 */
export async function updateHLRFromFlashcardLogs(
  userId: string,
  logs: FlashcardLog[],
): Promise<{ processed: number; success: boolean }> {
  if (!logs || logs.length === 0) {
    return { processed: 0, success: true };
  }

  try {
    // Aggregate - tổng hợp số lần đúng/sai cho mỗi từ
    const aggregatedResults = aggregateLogs(logs);

    let processed = 0;

    // Cập nhật từng từ với deltas
    for (const item of aggregatedResults) {
      try {
        await updateProgressWithRetry(
          userId,
          item.vocabulary_id,
          item.right_delta,
          item.wrong_delta,
        );
        processed++;
      } catch (error) {
        console.error(
          `[HLR] Error updating vocab ${item.vocabulary_id}:`,
          error,
        );
      }
    }

    console.log(
      `[HLR Integration] Updated ${processed} words for user ${userId}`,
    );

    return { processed, success: true };
  } catch (error: any) {
    console.error(
      "[HLR Integration] Error updating from flashcard logs:",
      error.message,
    );
    return { processed: 0, success: false };
  }
}

/**
 * Cập nhật HLR từ Matching Game
 *
 * Logic mới:
 * - Tất cả từ hoàn thành → right_delta = 1 (vì cuối cùng đều ghép đúng)
 * - Nếu có wrongAttemptCounts → wrong_delta = số lần click sai
 *
 * @param userId - User ID
 * @param result - Kết quả matching game
 */
export async function updateHLRFromMatchingGame(
  userId: string,
  result: MatchingGameResult,
): Promise<{ processed: number; success: boolean }> {
  if (!result.vocabularyIds || result.vocabularyIds.length === 0) {
    return { processed: 0, success: true };
  }

  try {
    const wrongCounts = result.wrongAttemptCounts || {};
    let processed = 0;

    console.log(
      `[HLR Integration] Matching game wrongAttemptCounts:`,
      wrongCounts,
    );

    // Xử lý từng từ với right=1 và wrong=số lần click sai
    for (const vocabId of result.vocabularyIds) {
      try {
        const rightDelta = 1; // Cuối cùng đều ghép đúng
        const wrongDelta = wrongCounts[vocabId] || 0; // Số lần click sai

        await updateProgressWithRetry(userId, vocabId, rightDelta, wrongDelta);
        processed++;
      } catch (error) {
        console.error(`[HLR] Error updating vocab ${vocabId}:`, error);
      }
    }

    console.log(
      `[HLR Integration] Matching game: Updated ${processed} words for user ${userId}`,
    );

    return { processed, success: true };
  } catch (error: any) {
    console.error(
      "[HLR Integration] Error updating from matching game:",
      error.message,
    );
    return { processed: 0, success: false };
  }
}

/**
 * Cập nhật HLR từ Word Recall Game
 *
 * Logic:
 * - Từ trong correctWordIds → right_delta = 1, wrong_delta = 0
 * - Từ trong wrongWordIds → right_delta = 0, wrong_delta = 1
 *
 * @param userId - User ID
 * @param result - Kết quả word recall game
 */
export async function updateHLRFromWordRecall(
  userId: string,
  result: WordRecallResult,
): Promise<{ processed: number; success: boolean }> {
  const correctIds = result.correctWordIds || [];
  const wrongIds = result.wrongWordIds || [];

  if (correctIds.length === 0 && wrongIds.length === 0) {
    return { processed: 0, success: true };
  }

  try {
    let processed = 0;

    // Xử lý từ đúng
    for (const vocabId of correctIds) {
      try {
        await updateProgressWithRetry(userId, vocabId, 1, 0); // right=1, wrong=0
        processed++;
      } catch (error) {
        console.error(`[HLR] Error updating correct vocab ${vocabId}:`, error);
      }
    }

    // Xử lý từ sai
    for (const vocabId of wrongIds) {
      try {
        await updateProgressWithRetry(userId, vocabId, 0, 1); // right=0, wrong=1
        processed++;
      } catch (error) {
        console.error(`[HLR] Error updating wrong vocab ${vocabId}:`, error);
      }
    }

    console.log(
      `[HLR Integration] Word recall: Updated ${processed} words for user ${userId} (correct: ${correctIds.length}, wrong: ${wrongIds.length})`,
    );

    return { processed, success: true };
  } catch (error: any) {
    console.error(
      "[HLR Integration] Error updating from word recall:",
      error.message,
    );
    return { processed: 0, success: false };
  }
}
