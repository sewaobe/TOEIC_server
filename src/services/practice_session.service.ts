import {
  IPracticeSession,
  PracticeSession,
  PracticeType,
  SessionStatus,
} from "../models/practice_session.model";
import { VocabularyDefinitionAttempt } from "../models/vocabulary_definition_attempt.model";
import { Types } from "mongoose";
import { TopicVocabulary } from "../models";
import { generateBulkDefinitions } from "./gemini.service";
import { Vocabulary } from "../models/vocabulary";

/**
 * Tạo hoặc resume session
 * - Nếu có session in_progress cho topic này → return session đó
 * - Nếu không → tạo mới (KHÔNG cancel session khác)
 * - Với definition_based practice: tự động fetch definition_en cho tất cả vocabularies trong topic
 */
export const startOrResumeSessionService = async (
  userId: string,
  practiceType: PracticeType,
  topicId: string,
  totalItems: number
) => {
  const userObjectId = new Types.ObjectId(userId);
  const topicObjectId = new Types.ObjectId(topicId);

  // 1. Check session in_progress cho topic này
  const existingSession = await PracticeSession.findOne({
    user_id: userObjectId,
    practice_type: practiceType,
    topic_id: topicObjectId,
    status: "in_progress",
  });

  if (existingSession) {
    // Resume session cũ - vẫn fetch definition_en nếu là definition_based
    if (practiceType === "definition_based") {
      console.log(
        `🔄 [Session] Resuming definition_based session, checking definitions...`
      );
      const topic = await TopicVocabulary.findById(topicObjectId);
      if (topic && topic.vocabularies_id && topic.vocabularies_id.length > 0) {
        // Use bulk Gemini: first chunk sync, remaining chunks async
        const vocabs = await Vocabulary.find({
          _id: { $in: topic.vocabularies_id },
        });
        const idToVocab = new Map(
          vocabs.map((v: any) => [v._id.toString(), v])
        );
        const orderedVocabs = topic.vocabularies_id
          .map((id: any) => idToVocab.get(id.toString()))
          .filter(Boolean);
        // Only include words that do NOT have definition_en yet
        const missingVocabs = orderedVocabs.filter(
          (v: any) => !v.definition_en
        );
        const words = missingVocabs.map((v: any) => v.word);
        const wordToId = new Map(
          missingVocabs.map((v: any) => [v.word, v._id])
        );
        console.log(
          `🔎 [Session] ${missingVocabs.length}/${
            orderedVocabs.length
          } words missing definitions. Will request: ${words.join(", ")}`
        );
        if (words.length === 0) {
          console.log(
            `✅ [Session] All vocabularies already have definitions, skipping Gemini calls.`
          );
        }

        const CHUNK_SIZE = 20; // send 10-20 words per request
        const CONCURRENCY = 1; // async concurrency for remaining
        const chunks: string[][] = [];
        for (let i = 0; i < words.length; i += CHUNK_SIZE) {
          chunks.push(words.slice(i, i + CHUNK_SIZE));
        }

        // First chunk: synchronous to ensure initial words have definitions
        const first = chunks.shift();
        if (first && first.length > 0) {
          try {
            console.log(
              `📦 [Session] Processing first chunk (${first.length} words)`
            );
            const results = await generateBulkDefinitions(first);
            console.log(
              `📥 [Session] Received ${results.length} definition(s)`
            );

            for (const r of results) {
              if (!r?.definition_en) {
                console.warn(
                  `⚠️ [Session] Empty definition for "${r.word}", skipping`
                );
                continue;
              }

              const vid = wordToId.get(r.word);
              try {
                if (vid) {
                  const updateResult = await Vocabulary.updateOne(
                    { _id: vid },
                    {
                      $set: {
                        definition_en: r.definition_en,
                        definition_vi: r.definition_vi,
                        updated_at: new Date(),
                      },
                    }
                  );
                  if (updateResult.matchedCount > 0) {
                    console.log(`💾 [Session] Updated "${r.word}"`);
                  } else {
                    console.warn(
                      `⚠️ [Session] No document matched for ID ${vid} (word: "${r.word}"), trying fallback`
                    );
                    const fb = await Vocabulary.updateOne(
                      { word: r.word },
                      {
                        $set: {
                          definition_en: r.definition_en,
                          definition_vi: r.definition_vi,
                          updated_at: new Date(),
                        },
                      }
                    );
                    if (fb.matchedCount > 0)
                      console.log(`💾 [Session] Fallback updated "${r.word}"`);
                  }
                } else {
                  const fb = await Vocabulary.updateOne(
                    { word: r.word },
                    {
                      $set: {
                        definition_en: r.definition_en,
                        definition_vi: r.definition_vi,
                        updated_at: new Date(),
                      },
                    }
                  );
                  if (fb.matchedCount > 0)
                    console.log(`💾 [Session] Updated by word "${r.word}"`);
                  else
                    console.warn(`⚠️ [Session] No vocab found for "${r.word}"`);
                }
              } catch (updateError: any) {
                console.error(
                  `❌ [Session] Update error for "${r.word}":`,
                  updateError.message || updateError
                );
              }
            }
          } catch (e: any) {
            console.error(
              "❌ [Session] Error generating first chunk definitions:",
              e.message || e
            );
          }
        }

        // Remaining chunks: process async with controlled concurrency
        if (chunks.length > 0) {
          (async () => {
            for (let i = 0; i < chunks.length; i += CONCURRENCY) {
              const batch = chunks.slice(i, i + CONCURRENCY);
              await Promise.allSettled(
                batch.map(async (chunkWords) => {
                  try {
                    const res = await generateBulkDefinitions(chunkWords);
                    for (const r of res) {
                      if (!r?.definition_en) continue;
                      const vid = wordToId.get(r.word);
                      try {
                        if (vid) {
                          const updateResult = await Vocabulary.updateOne(
                            { _id: vid },
                            {
                              $set: {
                                definition_en: r.definition_en,
                                definition_vi: r.definition_vi,
                                updated_at: new Date(),
                              },
                            }
                          );
                          if (updateResult.matchedCount > 0)
                            console.log(
                              `💾 [Session] Async updated "${r.word}"`
                            );
                        } else {
                          const fb = await Vocabulary.updateOne(
                            { word: r.word },
                            {
                              $set: {
                                definition_en: r.definition_en,
                                definition_vi: r.definition_vi,
                                updated_at: new Date(),
                              },
                            }
                          );
                          if (fb.matchedCount > 0)
                            console.log(
                              `💾 [Session] Async updated by word "${r.word}"`
                            );
                        }
                      } catch (updateError: any) {
                        console.error(
                          `❌ [Session] Async update error for "${r.word}":`,
                          updateError.message || updateError
                        );
                      }
                    }
                  } catch (e: any) {
                    console.error(
                      "❌ [Session] Error in async bulk generation:",
                      e.message || e
                    );
                  }
                })
              );
            }
          })();
        }
      }
    }

    return {
      session: existingSession,
      isResume: true,
    };
  }

  // 2. Tạo session mới (KHÔNG cancel các session khác - cho phép multiple in_progress)
  const newSession = await PracticeSession.create({
    user_id: userObjectId,
    practice_type: practiceType,
    topic_id: topicObjectId,
    total_items: totalItems,
    status: "in_progress",
  });

  // 3. Nếu là definition_based → batch fetch definition_en cho tất cả vocabularies trong topic
  if (practiceType === "definition_based") {
    console.log(
      `🚀 [Session] Starting definition_based session, fetching definitions...`
    );
    try {
      const topic = await TopicVocabulary.findById(topicObjectId);
      if (topic && topic.vocabularies_id && topic.vocabularies_id.length > 0) {
        // Batch fetch: send first chunk synchronously, remaining chunks async
        const vocabs = await Vocabulary.find({
          _id: { $in: topic.vocabularies_id },
        });
        const idToVocab = new Map(
          vocabs.map((v: any) => [v._id.toString(), v])
        );
        const orderedVocabs = topic.vocabularies_id
          .map((id: any) => idToVocab.get(id.toString()))
          .filter(Boolean);
        // Only include words that do NOT have definition_en yet
        const missingVocabs = orderedVocabs.filter(
          (v: any) => !v.definition_en
        );
        const words = missingVocabs.map((v: any) => v.word);
        const wordToId = new Map(
          missingVocabs.map((v: any) => [v.word, v._id])
        );
        console.log(
          `🔎 [Session] ${missingVocabs.length}/${
            orderedVocabs.length
          } words missing definitions. Will request: ${words.join(", ")}`
        );
        if (words.length === 0) {
          console.log(
            `✅ [Session] All vocabularies already have definitions, skipping Gemini calls.`
          );
        }

        const CHUNK_SIZE = 12;
        const CONCURRENCY = 2;
        const chunks: string[][] = [];
        for (let i = 0; i < words.length; i += CHUNK_SIZE) {
          chunks.push(words.slice(i, i + CHUNK_SIZE));
        }

        const first = chunks.shift();
        if (first && first.length > 0) {
          try {
            console.log(
              `📦 [Session] Processing first chunk (${
                first.length
              } words): ${first.join(", ")}`
            );
            const results = await generateBulkDefinitions(first);
            console.log(
              `📥 [Session] Bulk generation returned ${results.length} items`
            );

            // Debug: log các kết quả từ Gemini
            for (const r of results) {
              console.log(
                `🔍 [Session] Gemini result: "${
                  r.word
                }" → EN: "${r.definition_en?.substring(
                  0,
                  50
                )}..." / VI: "${r.definition_vi?.substring(0, 50)}..."`
              );
            }

            // Update từng từ vào DB
            for (const r of results) {
              const vid = wordToId.get(r.word);
              console.log(
                `🔎 [Session] Looking up word "${r.word}" → ID: ${
                  vid || "NOT_FOUND"
                }`
              );

              if (!r.definition_en || !r.definition_vi) {
                console.error(
                  `❌ [Session] Empty definition for "${r.word}", skipping update`
                );
                continue;
              }

              if (vid) {
                try {
                  // Verify document tồn tại trước
                  const existingVocab = await Vocabulary.findById(vid);
                  if (!existingVocab) {
                    console.error(
                      `❌ [Session] Vocabulary document with ID ${vid} NOT FOUND in DB!`
                    );
                    continue;
                  }

                  console.log(
                    `✅ [Session] Found document for "${
                      r.word
                    }", current definition_en: ${
                      existingVocab.definition_en || "NULL"
                    }`
                  );

                  // Thực hiện update
                  const updateResult = await Vocabulary.updateOne(
                    { _id: vid },
                    {
                      $set: {
                        definition_en: r.definition_en,
                        definition_vi: r.definition_vi,
                        updated_at: new Date(),
                      },
                    }
                  );

                  console.log(
                    `💾 [Session] Update result for "${r.word}" (ID: ${vid}):`
                  );
                  console.log(
                    `   - acknowledged: ${updateResult.acknowledged}`
                  );
                  console.log(
                    `   - matchedCount: ${updateResult.matchedCount}`
                  );
                  console.log(
                    `   - modifiedCount: ${updateResult.modifiedCount}`
                  );

                  // Verify update thành công
                  if (updateResult.modifiedCount === 1) {
                    const verifyDoc = await Vocabulary.findById(vid);
                    console.log(
                      `✅ [Session] Verify update success: "${
                        r.word
                      }" now has definition_en: ${verifyDoc?.definition_en?.substring(
                        0,
                        30
                      )}...`
                    );
                  } else if (updateResult.matchedCount === 0) {
                    console.error(
                      `❌ [Session] No document matched ID ${vid} for word "${r.word}"!`
                    );
                  } else if (updateResult.modifiedCount === 0) {
                    console.warn(
                      `⚠️ [Session] Document matched but not modified (maybe same value?) for "${r.word}"`
                    );
                  }
                } catch (updateError: any) {
                  console.error(
                    `❌ [Session] Update error for "${r.word}":`,
                    updateError.message || updateError
                  );
                }
              } else {
                console.warn(
                  `⚠️ [Session] Word "${r.word}" not found in wordToId map, trying fallback by word`
                );
                const updateResult = await Vocabulary.updateOne(
                  { word: r.word },
                  {
                    $set: {
                      definition_en: r.definition_en,
                      definition_vi: r.definition_vi,
                      updated_at: new Date(),
                    },
                  }
                );
                console.log(
                  `💾 [Session] Fallback update for "${r.word}": matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`
                );
              }
            }
          } catch (e: any) {
            console.error(
              "❌ [Session] Error generating first chunk definitions:",
              e.message || e
            );
            console.error(e.stack);
          }
        }

        if (chunks.length > 0) {
          (async () => {
            for (let i = 0; i < chunks.length; i += CONCURRENCY) {
              const batch = chunks.slice(i, i + CONCURRENCY);
              await Promise.allSettled(
                batch.map(async (chunkWords) => {
                  try {
                    const res = await generateBulkDefinitions(chunkWords);
                    for (const r of res) {
                      await Vocabulary.updateOne(
                        { word: r.word },
                        {
                          $set: {
                            definition_en: r.definition_en,
                            definition_vi: r.definition_vi,
                          },
                        }
                      );
                    }
                  } catch (e: any) {
                    console.error(
                      "❌ [Session] Error in async bulk generation:",
                      e.message || e
                    );
                  }
                })
              );
            }
          })();
        }
      }
    } catch (error: any) {
      // Không block session nếu fetch lỗi
      console.error(
        `⚠️ [Session] Error fetching definitions, continuing anyway:`,
        error.message
      );
    }
  }

  return {
    session: newSession,
    isResume: false,
  };
};

/**
 * Update progress của session
 */
export const updateSessionProgressService = async (
  sessionId: string,
  data: {
    current_index?: number;
    completed_items?: number;
    correct_count?: number;
    total_accuracy?: number;
  }
) => {
  const session = await PracticeSession.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        ...data,
        last_activity_at: new Date(),
      },
    },
    { new: true }
  );

  if (!session) {
    throw new Error("Session not found");
  }

  return session;
};

/**
 * Complete session và submit attempts
 */
export const completeSessionService = async (
  sessionId: string,
  attempts: any[]
) => {
  const session = await PracticeSession.findById(sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  // Tính toán kết quả cuối cùng
  const correctCount = attempts.filter((a) => a.is_correct).length;
  const totalAccuracy =
    attempts.length > 0
      ? attempts.reduce((sum, a) => sum + a.accuracy_score, 0) / attempts.length
      : 0;

  // Update session
  session.status = "completed";
  session.completed_items = attempts.length;
  session.correct_count = correctCount;
  session.total_accuracy = totalAccuracy;
  session.completed_at = new Date();
  session.last_activity_at = new Date();

  await session.save();

  // Lưu attempts với session_id
  const attemptsWithSession = attempts.map((a) => ({
    ...a,
    session_id: sessionId,
    user_id: session.user_id,
  }));

  const savedAttempts = await VocabularyDefinitionAttempt.insertMany(
    attemptsWithSession
  );

  return {
    session,
    attempts: savedAttempts,
  };
};

/**
 * Get session by topic
 */
export const getSessionByTopicService = async (
  userId: string,
  practiceType: PracticeType,
  topicId: string
) => {
  const session = await PracticeSession.findOne({
    user_id: new Types.ObjectId(userId),
    practice_type: practiceType,
    topic_id: new Types.ObjectId(topicId),
    status: "in_progress",
  });

  return session;
};

/**
 * Get all sessions của user (để hiển thị progress trên cards)
 * Trả về MỘT session mới nhất cho mỗi topic, ưu tiên: in_progress > completed > cancelled
 */
export const getUserSessionsService = async (
  userId: string,
  practiceType?: PracticeType,
  status?: SessionStatus,
  page = 1,
  limit = 100
) => {
  const matchQuery: any = { user_id: new Types.ObjectId(userId) }; // Convert to ObjectId

  if (practiceType) {
    matchQuery.practice_type = practiceType;
  }

  if (status) {
    matchQuery.status = status;
  }

  // Aggregation để lấy session mới nhất cho mỗi topic
  const sessions = await PracticeSession.aggregate([
    { $match: matchQuery },
    // Sort để ưu tiên in_progress, sau đó completed, cuối cùng là cancelled
    {
      $addFields: {
        statusPriority: {
          $switch: {
            branches: [
              { case: { $eq: ["$status", "in_progress"] }, then: 1 },
              { case: { $eq: ["$status", "completed"] }, then: 2 },
              { case: { $eq: ["$status", "cancelled"] }, then: 3 },
            ],
            default: 4,
          },
        },
      },
    },
    { $sort: { statusPriority: 1, last_activity_at: -1 } },
    // Group theo topic_id, lấy session đầu tiên (mới nhất với priority cao nhất)
    {
      $group: {
        _id: "$topic_id",
        session: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$session" } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ]);

  const totalAgg = await PracticeSession.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$topic_id",
      },
    },
    { $count: "total" },
  ]);

  const total = totalAgg.length > 0 ? totalAgg[0].total : 0;
  const pageCount = Math.ceil(total / limit);

  return {
    items: sessions,
    total,
    page,
    pageCount,
  };
};

/**
 * Get attempts của 1 session
 */
export const getSessionAttemptsService = async (
  sessionId: string,
  userId: string
) => {
  const attempts = await VocabularyDefinitionAttempt.find({
    session_id: new Types.ObjectId(sessionId),
    user_id: new Types.ObjectId(userId),
  }).sort({ attempt_at: 1 });

  return attempts;
};

/**
 * Save attempt ngay khi submit (không đợi complete)
 */
export const saveAttemptService = async (
  sessionId: string,
  userId: string,
  attempt: any
) => {
  const attemptWithIds = {
    ...attempt,
    session_id: new Types.ObjectId(sessionId),
    user_id: new Types.ObjectId(userId),
  };

  const savedAttempt = await VocabularyDefinitionAttempt.create(attemptWithIds);
  return savedAttempt;
};

/**
 * Cancel session và xóa hết attempts của session đó
 */
export const cancelSessionService = async (sessionId: string) => {
  // 1. Xóa tất cả attempts của session này
  await VocabularyDefinitionAttempt.deleteMany({
    session_id: new Types.ObjectId(sessionId),
  });

  // 2. Update session status
  const session = await PracticeSession.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        status: "cancelled",
        completed_at: new Date(),
      },
    },
    { new: true }
  );

  if (!session) {
    throw new Error("Session not found");
  }

  return session;
};
