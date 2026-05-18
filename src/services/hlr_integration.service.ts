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
 */

// ============================================
// TYPES
// ============================================

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
// MAIN INTEGRATION FUNCTIONS
// ============================================

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
