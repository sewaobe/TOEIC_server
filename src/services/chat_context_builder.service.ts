import { Types } from "mongoose";
import { Group } from "../models/group.model";
import { Question } from "../models/question.model";
import { UserProgress } from "../models/user_progress.model";
import { UserSkill } from "../models/user_skill.model";
import { UserSkillHistory } from "../models/user_skill_history.model";
import { UserTest } from "../models/user_test.model";
import { LearningPath } from "../models/learning_path.model";
import { LessonManager } from "../models/lesson_manager.model";
import {
  ChatClientContext,
  ChatIntent,
  ChatRouteContext,
  DbFirstContext,
} from "../types/chat.types";
import { resolveQuestionReferenceFromRouteContext } from "./chat_question_reference.service";
import { normalizeToeicSkillTags } from "../utils/toeic_skill.util";
import {
  createFlashcardSupplyDeck,
  FlashcardSupplyRequest,
} from "./flashcard_supply.service";

export function ensureObjectId(id?: string) {
  if (!id || !Types.ObjectId.isValid(id)) return null;
  return new Types.ObjectId(id);
}

export function serializeChoices(choices: any) {
  if (!choices) return {};
  if (choices instanceof Map) return Object.fromEntries(choices.entries());
  if (typeof choices.toObject === "function") return choices.toObject();
  return choices;
}

export function partFromQuestion(question: any) {
  const tags = Array.isArray(question?.tags) ? question.tags : [];
  const tagPart = tags.find((tag: string) => /part\s*[1-7]/i.test(tag));
  const namePart = `${question?.name ?? ""} ${question?.textQuestion ?? ""}`.match(/part\s*([1-7])/i);
  if (tagPart) return tagPart;
  if (namePart) return `Part ${namePart[1]}`;
  return "unknown";
}

function mediaUrl(media: any) {
  if (!media) return null;
  if (typeof media === "string") return media;
  return media.url ? String(media.url) : null;
}

function mediaUrls(mediaItems: any) {
  if (!Array.isArray(mediaItems)) return [];
  return mediaItems.map(mediaUrl).filter(Boolean);
}

function findAttemptAnswer(attempt: any, questionObjectId: Types.ObjectId) {
  return attempt.answers?.find((item: any) => {
    const answerQuestionId = item.question_id?._id ?? item.question_id;
    return String(answerQuestionId) === String(questionObjectId);
  });
}

function shouldIncludeTranslation(userText = "") {
  return /(?:dich|dịch|translate|nghia tieng viet|nghĩa tiếng việt|tieng viet|tiếng việt|ban dich|bản dịch)/i.test(
    userText
  );
}

export async function loadCurrentAttemptContext(
  userId: string,
  attemptObjectId: Types.ObjectId,
  questionObjectId: Types.ObjectId
) {
  const attempt = await UserTest.findOne({
    _id: attemptObjectId,
    user_id: userId,
  }).lean();

  if (!attempt) return null;
  const answer = findAttemptAnswer(attempt, questionObjectId);
  if (!answer) return { attempt, answer: null };

  return {
    attempt,
    answer,
    normalized: {
      id: String(attempt._id),
      testId: String(attempt.test_id),
      score: attempt.score,
      parts: attempt.parts ?? [],
      completedPart: attempt.completedPart,
      duration: attempt.duration,
      submittedAt: attempt.submit_at,
      userAnswer: answer.selectedOption,
      isCorrect: answer.isCorrect,
    },
  };
}

export async function loadQuestionCoreContext(questionObjectId: Types.ObjectId) {
  const question = await Question.findById(questionObjectId).lean();
  if (!question) return null;

  return {
    raw: question,
    normalized: {
      id: String(question._id),
      name: question.name,
      part: partFromQuestion(question),
      textQuestion: question.textQuestion,
      choices: serializeChoices(question.choices),
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      tags: question.tags ?? [],
      plannedTime: question.planned_time,
    },
  };
}

export async function loadQuestionGroupContext(
  testObjectId: Types.ObjectId,
  questionObjectId: Types.ObjectId,
  options: { includeTranslation?: boolean } = {}
) {
  const group = await Group.findOne({
    test_id: testObjectId,
    questions: questionObjectId,
  })
    .populate([
      { path: "audioUrl", model: "Media", select: "url type duration transcript" },
      { path: "imagesUrl", model: "Media", select: "url type" },
      {
        path: "questions",
        model: "Question",
        select: "name textQuestion choices correctAnswer explanation tags",
      },
    ])
    .lean();

  if (!group) return null;

  const audioUrl = mediaUrl(group.audioUrl);
  const imageUrls = mediaUrls(group.imagesUrl);
  const transcriptEnglish = group.transcriptEnglish ?? "";
  const transcriptTranslation = options.includeTranslation ? group.transcriptTranslation ?? "" : "";

  return {
    id: String(group._id),
    part: group.part ?? null,
    transcriptEnglish,
    ...(transcriptTranslation ? { transcriptTranslation } : {}),
    audioUrl,
    imageUrls,
    media: {
      hasAudio: !!audioUrl,
      audioUrl,
      imageUrls,
      hasImages: imageUrls.length > 0,
      hasTranscript: !!transcriptEnglish,
    },
    siblingQuestions: (group.questions ?? []).map((question: any) => ({
      id: String(question._id),
      name: question.name,
      textPreview: question.textQuestion?.replace(/\s+/g, " ").trim().slice(0, 160),
    })),
  };
}

export async function loadAttemptHistorySummary(
  userId: string,
  testObjectId: Types.ObjectId,
  questionObjectId: Types.ObjectId,
  currentAttemptObjectId: Types.ObjectId
) {
  const previousAttempts = await UserTest.find({
    user_id: userId,
    test_id: testObjectId,
    _id: { $ne: currentAttemptObjectId },
    answers: {
      $elemMatch: {
        question_id: questionObjectId,
      },
    },
  })
    .sort({ submit_at: -1 })
    .limit(3)
    .lean();

  return previousAttempts.map((attempt: any) => {
    const answer = findAttemptAnswer(attempt, questionObjectId);
    return {
      attemptId: String(attempt._id),
      submittedAt: attempt.submit_at,
      score: attempt.score,
      selectedOptionForThisQuestion: answer?.selectedOption ?? "",
      wasCorrectForThisQuestion: answer?.isCorrect ?? null,
      partAccuracy: attempt.parts ?? [],
    };
  });
}

export async function buildExplainQuestionContext(params: {
  userId: string;
  attemptObjectId: Types.ObjectId;
  questionObjectId: Types.ObjectId;
  userText?: string;
}): Promise<DbFirstContext> {
  const currentAttempt = await loadCurrentAttemptContext(
    params.userId,
    params.attemptObjectId,
    params.questionObjectId
  );

  if (!currentAttempt) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "forbidden",
      fallback:
        "Mình không tìm thấy bài làm này trong tài khoản của bạn, nên không thể giải thích câu hỏi một cách an toàn.",
    };
  }

  if (!currentAttempt.answer) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "forbidden",
      fallback:
        "Câu hỏi này không nằm trong bài làm hiện tại của bạn. Hãy mở đúng câu hỏi trong phần review để mình giải thích chính xác.",
    };
  }
  const normalizedAttempt = currentAttempt.normalized;
  if (!normalizedAttempt) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "no_data",
      fallback:
        "Mình chưa lấy được dữ liệu bài làm hiện tại để giải thích câu hỏi này.",
    };
  }

  const question = await loadQuestionCoreContext(params.questionObjectId);
  if (!question) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "no_data",
      fallback: "Mình không tìm thấy dữ liệu câu hỏi này trong hệ thống.",
    };
  }

  const testObjectId = ensureObjectId(String(currentAttempt.attempt.test_id));
  const [group, historySummary] = testObjectId
    ? await Promise.all([
        loadQuestionGroupContext(testObjectId, params.questionObjectId, {
          includeTranslation: shouldIncludeTranslation(params.userText),
        }),
        loadAttemptHistorySummary(
          params.userId,
          testObjectId,
          params.questionObjectId,
          params.attemptObjectId
        ),
      ])
    : [null, []];

  const questionData = question.normalized;
  const attemptData = normalizedAttempt;
  const groupData = group;
  const hasTranscript = !!groupData?.transcriptEnglish;
  const hasExplanation = !!questionData.explanation;
  const hasQuestionText = !!questionData.textQuestion;
  const hasMediaOnly = !!(
    (groupData?.media?.hasAudio || groupData?.media?.hasImages) &&
    !hasTranscript &&
    !hasExplanation &&
    !hasQuestionText
  );
  const groupPart = groupData?.part ? `Part ${groupData.part}` : undefined;

  const data = {
    question: {
      ...questionData,
      part: groupPart ?? questionData.part,
    },
    currentAttempt: attemptData,
    group: groupData,
    historySummary,
    contextQuality: {
      hasTranscript,
      hasPassage: hasTranscript,
      hasExplanation,
      hasQuestionText,
      hasMediaOnly,
    },
    // Backward-compatible aliases used by current prompt/actions/tests.
    attempt: attemptData,
    userAnswer: attemptData.userAnswer,
    isCorrect: attemptData.isCorrect,
  };

  return {
    ok: true,
    contextType: "question_review",
    data,
  };
}

export async function buildQuestionContext(
  userId: string,
  routeContext?: ChatRouteContext,
  userText = ""
): Promise<DbFirstContext> {
  const attemptObjectId = ensureObjectId(routeContext?.attemptId);
  const questionObjectId = ensureObjectId(routeContext?.questionId);

  if (!attemptObjectId || !questionObjectId) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "clarify",
      fallback:
        "Mình chưa thấy câu hỏi cụ thể trong ngữ cảnh hiện tại. Hãy mở câu cần giải thích hoặc chọn một câu sai trong phần review.",
    };
  }

  return buildExplainQuestionContext({
    userId,
    attemptObjectId,
    questionObjectId,
    userText,
  });
}

export async function buildQuestionIdentificationContext(
  userId: string,
  userText: string,
  routeContext?: ChatRouteContext
): Promise<DbFirstContext> {
  const resolved = resolveQuestionReferenceFromRouteContext(userText, routeContext);

  if (!resolved.matched || !resolved.questionId) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "clarify",
      fallback:
        "Mình chưa xác định được bạn đang hỏi câu nào. Hãy nói rõ 'câu 1', 'câu 2' hoặc mở đúng câu hỏi cần hỏi.",
    };
  }

  const questionObjectId = ensureObjectId(resolved.questionId);
  if (!questionObjectId) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "clarify",
      fallback:
        "Mình đã nhận diện được câu bạn hỏi, nhưng questionId không hợp lệ nên chưa thể lấy nội dung câu hỏi.",
    };
  }

  const question = await Question.findById(questionObjectId).lean();
  if (!question && !resolved.textPreview) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "no_data",
      fallback: "Mình không tìm thấy dữ liệu câu hỏi này trong hệ thống.",
    };
  }

  const textQuestion = question?.textQuestion ?? resolved.textPreview ?? "";

  return {
    ok: true,
    contextType: "question_identification",
    data: {
      question: {
        id: String(question?._id ?? resolved.questionId),
        name: question?.name,
        part: question ? partFromQuestion(question) : "unknown",
        questionNumber: resolved.questionNumber,
        textQuestion,
        choices: question ? serializeChoices(question.choices) : {},
      },
      resolution: {
        reason: resolved.reason,
        questionNumber: resolved.questionNumber,
      },
    },
  };
}

function asksForLatestAttempt(userText = "") {
  const normalized = userText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d");
  return /\b(gan nhat|moi nhat|vua lam|vua nop)\b/.test(normalized);
}

function requestedPartNumbers(userText = "") {
  const normalized = userText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d");
  const parts = new Set<number>();
  for (const match of normalized.matchAll(/\b(?:part|phan)\s*([1-7])\b/g)) {
    parts.add(Number(match[1]));
  }
  return Array.from(parts).sort();
}

function questionPartNumber(question: any) {
  const match = partFromQuestion(question).match(/part\s*([1-7])/i);
  return match ? Number(match[1]) : undefined;
}

function countTags(
  answers: Array<{ tags: string[] }>,
  options: { excludePartTags?: boolean } = {}
) {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    for (const rawTag of answer.tags) {
      const tag = String(rawTag).trim();
      if (!tag) continue;
      if (options.excludePartTags && /^part\s*[1-7]$/i.test(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));
}

async function loadTestResultAttempt(userId: string, attemptObjectId: Types.ObjectId | null) {
  const attemptQuery = attemptObjectId
    ? { _id: attemptObjectId, user_id: userId }
    : { user_id: userId };

  return UserTest.findOne(attemptQuery)
    .sort(attemptObjectId ? {} : { submit_at: -1 })
    .populate("answers.question_id")
    .lean();
}

export async function buildTestResultContext(
  userId: string,
  routeContext?: ChatRouteContext,
  userText = ""
): Promise<DbFirstContext> {
  const attemptObjectId = asksForLatestAttempt(userText)
    ? null
    : ensureObjectId(routeContext?.attemptId);
  if (!attemptObjectId && routeContext?.page === "test_result" && !userText.trim()) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "clarify",
      fallback:
        "Mình chưa thấy bài làm cụ thể. Hãy mở trang kết quả bài test để mình phân tích chính xác hơn.",
    };
  }

  const attempt = await loadTestResultAttempt(userId, attemptObjectId);

  if (!attempt && !attemptObjectId) {
    return {
      ok: false,
      errorType: "NO_DATA",
      outcome: "no_data",
      fallback: "Mình chưa tìm thấy bài test gần nhất nào trong tài khoản của bạn. Bạn hãy làm một bài test trước để mình có dữ liệu phân tích.",
    };
  }

  if (!attempt) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "forbidden",
      fallback:
        "Mình không tìm thấy kết quả bài làm này trong tài khoản của bạn.",
    };
  }

  const requestedParts = requestedPartNumbers(userText);
  const analyzedAnswers = (attempt.answers ?? [])
    .map((answer: any) => {
      const question = answer.question_id;
      return {
        questionId: String(question?._id ?? answer.question_id),
        name: question?.name,
        part: question ? partFromQuestion(question) : "unknown",
        partNumber: question ? questionPartNumber(question) : undefined,
        selectedOption: answer.selectedOption,
        correctAnswer: question?.correctAnswer,
        tags: question?.tags ?? [],
        isCorrect: !!answer.isCorrect,
      };
    })
    .filter(
      (answer: any) =>
        !requestedParts.length || requestedParts.includes(answer.partNumber)
    );
  const correctAnswers = analyzedAnswers.filter(
    (answer: any) => answer.isCorrect
  );
  const wrongAnswers = analyzedAnswers.filter(
    (answer: any) => !answer.isCorrect
  );
  const byPart = Array.from(
    analyzedAnswers.reduce((groups: Map<number, any[]>, answer: any) => {
      if (!answer.partNumber) return groups;
      const entries = groups.get(answer.partNumber) ?? [];
      entries.push(answer);
      groups.set(answer.partNumber, entries);
      return groups;
    }, new Map<number, any[]>())
  ).map(([part, answers]) => {
    const correct = answers.filter((answer: any) => answer.isCorrect);
    const wrong = answers.filter((answer: any) => !answer.isCorrect);
    return {
      part,
      totalQuestions: answers.length,
      correctCount: correct.length,
      wrongCount: wrong.length,
      accuracy:
        answers.length > 0
          ? Math.round((correct.length / answers.length) * 100)
          : 0,
      topStrongQuestionTypes: countTags(correct, {
        excludePartTags: true,
      }).slice(0, 5),
      topWeakQuestionTypes: countTags(wrong, {
        excludePartTags: true,
      }).slice(0, 5),
    };
  });

  return {
    ok: true,
    contextType: "test_result",
    data: {
      attempt: {
        id: String(attempt._id),
        testId: String(attempt.test_id),
        score: attempt.score,
        parts: attempt.parts ?? [],
        completedPart: attempt.completedPart,
        duration: attempt.duration,
        submittedAt: attempt.submit_at,
        requestedParts,
        totalQuestions: analyzedAnswers.length,
        correctCount: correctAnswers.length,
        wrongCount: wrongAnswers.length,
        overallTotalQuestions: attempt.answers?.length ?? 0,
      },
      wrongAnswers: wrongAnswers.slice(0, 20),
      topStrongTags: countTags(correctAnswers),
      topWeakTags: countTags(wrongAnswers),
      topStrongQuestionTypes: countTags(correctAnswers, {
        excludePartTags: true,
      }),
      topWeakQuestionTypes: countTags(wrongAnswers, {
        excludePartTags: true,
      }),
      byPart,
    },
  };
}

function summarizeLearningPathStages(roadmap: any) {
  if (!roadmap) return null;
  const cycles = Array.isArray(roadmap.week_study_ids)
    ? roadmap.week_study_ids
    : [];
  const stages = cycles.flatMap((cycle: any) =>
    Array.isArray(cycle?.days) ? cycle.days : []
  );
  const completedStages = stages.filter(
    (stage: any) => stage?.status === "completed"
  ).length;
  const totalStages = stages.length;
  return {
    learningPathId: String(roadmap._id),
    currentCycleNo: Number(roadmap.current_week ?? 1) || 1,
    totalCycles: cycles.length,
    completedCycles: cycles.filter(
      (cycle: any) => cycle?.status === "completed"
    ).length,
    completedStages,
    totalStages,
    completionRate: totalStages
      ? Math.round((completedStages / totalStages) * 100)
      : 0,
    targetScore: roadmap.target_score,
    status: roadmap.status,
  };
}

const CHAT_TOEIC_PART_SCORE_WEIGHT: Record<number, number> = {
  1: 0.06,
  2: 0.25,
  3: 0.39,
  4: 0.3,
  5: 0.3,
  6: 0.16,
  7: 0.54,
};

const CHAT_TOEIC_SECTION_SCORE_RANGE = 490;

function estimateCurrentScoreFromPartAbilities(skillParts: any[] = []) {
  if (!Array.isArray(skillParts) || skillParts.length === 0) return null;
  const total = skillParts.reduce((sum, part) => {
    const partType = Number(part?.part_type);
    const ability = Number(part?.ability);
    const weight = CHAT_TOEIC_PART_SCORE_WEIGHT[partType];
    if (!Number.isFinite(ability) || typeof weight !== "number") return sum;
    return sum + Math.max(0, Math.min(1, ability)) * weight * CHAT_TOEIC_SECTION_SCORE_RANGE;
  }, 0);
  return Number.isFinite(total) ? Math.round(total / 5) * 5 : null;
}

function summarizeAbilityMap(skill: any, latestTest: any) {
  const parts = Array.isArray(skill?.parts)
    ? [...skill.parts]
        .map((part: any) => ({
          partType: Number(part?.part_type),
          abilityPercent: Math.round(Math.max(0, Math.min(1, Number(part?.ability) || 0)) * 100),
          status: String(part?.status ?? "medium"),
          trend: part?.trend ? String(part.trend) : undefined,
          historyCount: Number(part?.history_count ?? 0),
          domain: Number(part?.part_type) <= 4 ? "Listening" : "Reading",
          isFocusPart: false,
        }))
        .filter((part: any) => Number.isFinite(part.partType))
        .sort((left: any, right: any) => left.partType - right.partType)
    : [];
  const weakestPart = [...parts].sort((left: any, right: any) => left.abilityPercent - right.abilityPercent)[0];
  const strongestPart = [...parts].sort((left: any, right: any) => right.abilityPercent - left.abilityPercent)[0];
  return {
    latestTestScore: typeof latestTest?.score === "number" ? latestTest.score : null,
    estimatedScore: estimateCurrentScoreFromPartAbilities(skill?.parts ?? []),
    parts,
    weakestPartType: weakestPart?.partType,
    strongestPartType: strongestPart?.partType,
  };
}

export async function buildProgressContext(userId: string): Promise<DbFirstContext> {
  const userObjectId = ensureObjectId(userId);
  const [progress, skill, latestSkillHistory, latestTest] = await Promise.all([
    userObjectId
      ? UserProgress.findOne({ user_id: userObjectId }).sort({ updated_at: -1 }).lean()
      : null,
    userObjectId
      ? UserSkill.findOne({ user_id: userObjectId }).sort({ updated_at: -1 }).lean()
      : null,
    userObjectId
      ? UserSkillHistory.findOne({ user_id: userObjectId }).sort({ created_at: -1 }).lean()
      : null,
    UserTest.findOne({ user_id: userId }).sort({ submit_at: -1 }).lean(),
  ]);
  let activeRoadmap = userObjectId
    ? await LearningPath.findOne({ user_id: userObjectId, isActive: true })
        .sort({ updated_at: -1 })
        .populate({
          path: "week_study_ids",
          populate: { path: "days", model: "DayStudy" },
        })
        .lean()
    : null;

  if (!activeRoadmap && userObjectId) {
    activeRoadmap = await LearningPath.findOne({ user_id: userObjectId })
      .sort({ updated_at: -1 })
      .populate({
        path: "week_study_ids",
        populate: { path: "days", model: "DayStudy" },
      })
      .lean();
  }

  const roadmapProgress = summarizeLearningPathStages(activeRoadmap);
  const shouldUseRoadmapProgress =
    roadmapProgress && (!progress || Number(progress.total_lessons ?? 0) <= 0);

  if (!progress && !skill && !latestTest && !roadmapProgress) {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "no_data",
      fallback:
        "Mình chưa có đủ dữ liệu học tập để tổng hợp tiến độ. Bạn hãy làm một bài test hoặc hoàn thành một hoạt động học trước nhé.",
    };
  }

  return {
    ok: true,
    contextType: "progress_summary",
    data: {
      progress: progress
        ? {
            completedLessons: shouldUseRoadmapProgress
              ? roadmapProgress.completedStages
              : progress.completed_lessons,
            totalLessons: shouldUseRoadmapProgress
              ? roadmapProgress.totalStages
              : progress.total_lessons,
            completionRate: shouldUseRoadmapProgress
              ? roadmapProgress.completionRate
              : progress.completion_rate,
            totalStudyTime: progress.total_study_time,
            streakDays: progress.streak_days,
            longestStreak: progress.longest_streak,
            currentScore: progress.current_score,
            targetScore: progress.target_score || roadmapProgress?.targetScore,
            status: progress.status || roadmapProgress?.status,
            lastStudyDate: progress.last_study_date,
            progressUnit: shouldUseRoadmapProgress ? "stage" : "lesson",
          }
        : roadmapProgress
          ? {
              completedLessons: roadmapProgress.completedStages,
              totalLessons: roadmapProgress.totalStages,
              completionRate: roadmapProgress.completionRate,
              totalStudyTime: 0,
              streakDays: 0,
              longestStreak: 0,
              currentScore: latestTest?.score ?? 0,
              targetScore: roadmapProgress.targetScore,
              status: roadmapProgress.status,
              lastStudyDate: null,
              progressUnit: "stage",
            }
          : null,
      roadmapProgress,
      skillParts: skill?.parts ?? [],
      abilityMap: summarizeAbilityMap(skill, latestTest),
      latestSkillHistory: latestSkillHistory
        ? {
            sourceUserTestId: latestSkillHistory.source_user_test_id,
            parts: latestSkillHistory.parts,
            skills: latestSkillHistory.skills?.slice(0, 12),
            submittedAt: latestSkillHistory.submitted_at,
          }
        : null,
      latestTest: latestTest
        ? {
            id: String(latestTest._id),
            score: latestTest.score,
            parts: latestTest.parts,
            submittedAt: latestTest.submit_at,
          }
        : null,
    },
  };
}

export async function buildRoadmapContext(
  userId: string,
  routeContext?: ChatRouteContext
): Promise<DbFirstContext> {
  const userObjectId = ensureObjectId(userId);
  if (!userObjectId) {
    return {
      ok: false,
      errorType: "NO_DATA",
      outcome: "no_data",
      fallback: "Mình chưa tìm thấy lộ trình học của bạn.",
    };
  }

  const roadmapObjectId = ensureObjectId(routeContext?.roadmapId);
  const query = roadmapObjectId
    ? { _id: roadmapObjectId, user_id: userObjectId }
    : { user_id: userObjectId, isActive: true };

  let roadmap = await LearningPath.findOne(query)
    .populate({
      path: "week_study_ids",
      populate: { path: "days", model: "DayStudy" },
    })
    .lean();

  if (!roadmap && !roadmapObjectId) {
    roadmap = await LearningPath.findOne({ user_id: userObjectId })
      .sort({ updated_at: -1 })
      .populate({
        path: "week_study_ids",
        populate: { path: "days", model: "DayStudy" },
      })
      .lean();
  }

  if (!roadmap) {
    return {
      ok: false,
      errorType: "NO_DATA",
      outcome: "no_data",
      fallback:
        "Mình chưa tìm thấy lộ trình học để phân tích. Bạn cần tạo lộ trình trước.",
    };
  }

  const weeks = (Array.isArray(roadmap.week_study_ids)
    ? roadmap.week_study_ids
    : []) as any[];
  const cycles = [...weeks].sort(
    (a, b) => Number(a?.no ?? 0) - Number(b?.no ?? 0)
  );
  const currentCycle =
    [...cycles].reverse().find((cycle) => cycle?.status === "in_progress") ??
    cycles[cycles.length - 1] ??
    null;
  const stages = cycles.flatMap((cycle) =>
    (Array.isArray(cycle?.days) ? cycle.days : []).map((stage: any) => ({
      ...stage,
      cycleId: String(cycle?._id ?? ""),
      cycleNo: Number(cycle?.no ?? 0) || undefined,
      cycleStatus: cycle?.status,
    }))
  );
  const sessions = stages.flatMap((stage) =>
    (Array.isArray(stage?.sessions) ? stage.sessions : []).map((session: any) => ({
      ...session,
      stageId: String(stage?._id ?? ""),
      stageNo: stage?.dayOfWeek,
      stageStatus: stage?.status,
      cycleId: stage?.cycleId,
      cycleNo: stage?.cycleNo,
      cycleStatus: stage?.cycleStatus,
    }))
  );
  const completedStages = stages.filter(
    (stage) => stage?.status === "completed"
  ).length;
  const completedSessions = sessions.filter(
    (session) => session?.status === "completed"
  ).length;
  const nextSession =
    sessions.find((session) => session?.status === "in_progress") ??
    sessions.find((session) => session?.status !== "completed");
  const totalStages = stages.length;
  const completedCycles = cycles.filter(
    (cycle) => cycle?.status === "completed"
  ).length;
  const completionRate = totalStages
    ? Math.round((completedStages / totalStages) * 100)
    : 0;
  const currentCycleNo =
    Number(currentCycle?.no ?? roadmap.current_week ?? 1) || 1;
  const totalCycles = cycles.length;

  return {
    ok: true,
    contextType: "roadmap",
    data: {
      roadmap: {
        id: String(roadmap._id),
        title: roadmap.title,
        description: roadmap.description,
        level: roadmap.level,
        targetScore: roadmap.target_score,
        timePerDay: roadmap.time_per_day,
        daysPerWeek: roadmap.days_per_week,
        targetCompletionDate: roadmap.target_completion_date,
        currentCycleNo,
        totalCycles,
        completedCycles,
        totalStages,
        completedStages,
        completionRate,
        totalSessions: sessions.length,
        completedSessions,
        isActive: roadmap.isActive,
        // Backward-compatible aliases for old metadata consumers only.
        currentWeek: currentCycleNo,
        totalWeeks: totalCycles,
        completedWeeks: completedCycles,
        totalDays: totalStages,
        completedDays: completedStages,
      },
      currentCycle: currentCycle
        ? {
            id: String(currentCycle._id),
            cycleNo: Number(currentCycle.no ?? currentCycleNo),
            status: currentCycle.status,
            cycleMode: currentCycle.cycle_mode,
            focusPartType: currentCycle.focus_part_type,
            primaryFocusSkillKey: currentCycle.primary_focus_skill_key,
            coveredSkillKeys: currentCycle.covered_skill_keys ?? [],
            assessmentType: currentCycle.assessment_type ?? null,
            expectedSkillGain: currentCycle.expected_skill_gain,
            expectedRoiPerHour: currentCycle.expected_roi_per_hour,
          }
        : null,
      nextStep: nextSession
        ? {
            cycleNo: nextSession.cycleNo,
            stageId: nextSession.stageId,
            stageNo: nextSession.stageNo,
            sessionNo: nextSession.session_no,
            status: nextSession.status,
            part: nextSession.part_type,
            title: nextSession.lesson_manager_title,
            plannedMinutes: nextSession.planned_minutes,
            reason: nextSession.scheduler_reason,
            // Backward-compatible aliases for old metadata consumers only.
            dayId: nextSession.stageId,
            dayOfWeek: nextSession.stageNo,
          }
        : null,
    },
  };
}

function parsePartType(value: unknown) {
  if (typeof value === "number" && value >= 1 && value <= 7) return value;
  const match = String(value ?? "").match(/part\s*([1-7])|^([1-7])$/i);
  const part = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(part) && part >= 1 && part <= 7 ? part : undefined;
}

function normalizeActionTags(tags: unknown, partType?: number) {
  const rawTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
  const normalized = normalizeToeicSkillTags(rawTags, partType);
  return {
    rawTags,
    skills: normalized,
    keys: normalized.map((skill) => skill.key),
    labels: normalized.map((skill) => skill.label_vi),
  };
}

function getAbilityForSimilarPractice(userSkill: any, skillKeys: string[], partType?: number) {
  const parts = Array.isArray(userSkill?.parts) ? userSkill.parts : [];
  for (const part of parts) {
    const matchedSkill = (part.skills ?? []).find((skill: any) =>
      skillKeys.includes(String(skill.skill_key))
    );
    if (typeof matchedSkill?.ability === "number") return matchedSkill.ability;
  }
  const matchedPart = parts.find((part: any) => Number(part.part_type) === partType);
  if (typeof matchedPart?.ability === "number") return matchedPart.ability;
  return null;
}

function activityTitle(activityType: string) {
  if (activityType === "vocabulary") return "Ôn flashcard";
  if (activityType === "dictation") return "Luyện nghe chép chính tả";
  if (activityType === "shadowing") return "Luyện shadowing";
  if (activityType === "quiz") return "Làm quiz";
  return "Luyện tập";
}

function normalizePlainText(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFlashcardCount(userText = "", payload: any = {}) {
  const explicit = Number(payload.count);
  if (Number.isFinite(explicit)) return explicit;
  const match = normalizePlainText(userText).match(/\b(\d{1,2})\s*(?:tu|flashcard|cards?)\b/);
  return match ? Number(match[1]) : undefined;
}

function parseFlashcardTopic(userText = "", payload: any = {}) {
  if (payload.topic) return String(payload.topic).trim();
  const value = normalizePlainText(userText);
  const match =
    value.match(/\bchu de\s+(.+)$/) ??
    value.match(/\bve\s+(.+)$/) ??
    value.match(/\btopic\s+(.+)$/);
  if (!match?.[1]) return "";
  return match[1]
    .replace(/\b(de hoc|cho toi|nhe|di|flashcard|tu vung|tu)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFlashcardSupplyRequest(
  userText: string,
  routeContext?: ChatRouteContext,
  clientContext?: ChatClientContext
): FlashcardSupplyRequest {
  const payload = clientContext?.actionPayload ?? {};
  const normalized = normalizePlainText(userText);
  const strict =
    payload.expansion === "strict" ||
    /\b(chi lay|chi tao|trong cau nay|co trong cau nay|strict)\b/.test(normalized);
  const questionId = String(payload.questionId ?? routeContext?.questionId ?? "").trim();
  const wantsQuestion =
    payload.source?.kind === "question_error" ||
    payload.kind === "question_error" ||
    /\b(cau nay|cau sai nay|tu cau nay|trong cau nay)\b/.test(normalized);
  const topic = parseFlashcardTopic(userText, payload);
  const clientRequestId =
    String(payload.clientRequestId ?? clientContext?.clientRequestId ?? "").trim() ||
    `flashcard-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    clientRequestId,
    count: parseFlashcardCount(userText, payload),
    source: wantsQuestion
      ? {
          kind: "question_error",
          questionId,
        }
      : {
          kind: "topic",
          topic,
        },
    expansion: strict ? "strict" : "related",
  };
}

export async function buildFlashcardSupplyContext(
  userId: string,
  routeContext: ChatRouteContext | undefined,
  userText: string,
  clientContext?: ChatClientContext
): Promise<DbFirstContext> {
  const result = await createFlashcardSupplyDeck({
    userId,
    routeContext,
    request: buildFlashcardSupplyRequest(userText, routeContext, clientContext),
  });

  if (!result.ok) return result;

  return {
    ok: true,
    contextType: "flashcard_supply",
    data: result.data,
  };
}

export async function buildSimilarPracticeContext(
  userId: string,
  routeContext?: ChatRouteContext,
  clientContext?: any
): Promise<DbFirstContext> {
  const payload = clientContext?.actionPayload ?? {};
  const questionId = ensureObjectId(payload.questionId ?? payload.sourceQuestionId ?? routeContext?.questionId);
  const partType = parsePartType(payload.part);
  const question = questionId ? await Question.findById(questionId).lean() : null;
  const sourceTags = normalizeActionTags(
    payload.tags ?? question?.tags ?? [],
    partType ?? parsePartType(partFromQuestion(question))
  );
  const effectivePartType = partType ?? sourceTags.skills[0]?.part_type ?? parsePartType(partFromQuestion(question));

  if (!sourceTags.rawTags.length && !sourceTags.keys.length) {
    return {
      ok: false,
      errorType: "NO_DATA",
      outcome: "no_data",
      fallback: "Mình chưa thấy tag kỹ năng của câu này nên chưa thể gợi ý bài luyện tương tự.",
    };
  }

  const userObjectId = ensureObjectId(userId);
  const userSkill = userObjectId
    ? await UserSkill.findOne({ user_id: userObjectId }).sort({ updated_at: -1 }).lean()
    : null;
  const currentAbility = getAbilityForSimilarPractice(userSkill, sourceTags.keys, effectivePartType);
  const tagQuery = Array.from(new Set([...sourceTags.rawTags, ...sourceTags.keys, ...sourceTags.labels]));
  let lessonManagers = await LessonManager.find({
    status: "approved",
    ...(effectivePartType ? { part_type: effectivePartType } : {}),
    target_tags: { $in: tagQuery },
  })
    .select("title part_type target_tags weight planned_completion_time recommended_activity_order")
    .lean();
  if (!lessonManagers.length && effectivePartType) {
    lessonManagers = await LessonManager.find({
      status: "approved",
      part_type: effectivePartType,
      target_tags: { $exists: true, $ne: [] },
    })
      .select("title part_type target_tags weight planned_completion_time recommended_activity_order")
      .lean();
  }

  const items = lessonManagers
    .map((lesson: any) => {
      const target = normalizeActionTags(lesson.target_tags ?? [], lesson.part_type);
      const targetKeys = new Set([
        ...target.keys,
        ...target.labels,
        ...(lesson.target_tags ?? []).map((tag: string) => String(tag)),
      ]);
      const matchCount = tagQuery.filter((tag) => targetKeys.has(tag)).length;
      const activities = [...(lesson.recommended_activity_order ?? [])]
        .filter((activity: any) => activity.activity_type !== "lesson")
        .sort((a: any, b: any) => Number(a.order ?? 0) - Number(b.order ?? 0))
        .slice(0, 3)
        .map((activity: any) => ({
          id: String(activity.activity_id),
          type: String(activity.activity_type),
          title: activityTitle(String(activity.activity_type)),
          estimatedMinutes: activity.estimated_minutes,
          action: {
            id: `practice-${activity.activity_type}-${activity.activity_id}`,
            label: "Luyện ngay",
            type: "start_practice",
            payload: {
              activityType: activity.activity_type,
              activityId: String(activity.activity_id),
              lessonManagerId: String(lesson._id),
              tags: sourceTags.rawTags,
            },
          },
        }));
      const fitDistance =
        typeof currentAbility === "number" && typeof lesson.weight === "number"
          ? Math.abs(lesson.weight - currentAbility)
          : 0.5;
      return {
        lessonManagerId: String(lesson._id),
        title: lesson.title,
        part: lesson.part_type,
        targetTags: lesson.target_tags ?? [],
        weight: lesson.weight,
        fitScore: Number((1 - Math.min(1, fitDistance)).toFixed(3)),
        matchCount,
        activities,
      };
    })
    .filter((item: any) => item.matchCount > 0 && item.activities.length > 0)
    .sort((a: any, b: any) =>
      b.matchCount - a.matchCount ||
      b.fitScore - a.fitScore ||
      (a.weight ?? 1) - (b.weight ?? 1)
    )
    .slice(0, 5);

  if (!items.length) {
    return {
      ok: false,
      errorType: "NO_DATA",
      outcome: "no_data",
      fallback: "Mình chưa tìm thấy bài luyện phù hợp với tag của câu này.",
    };
  }

  return {
    ok: true,
    contextType: "similar_practice",
    data: {
      sourceTags: sourceTags.rawTags,
      normalizedSkillKeys: sourceTags.keys,
      currentAbility,
      recommendations: items,
    },
  };
}

export async function buildDbFirstContext(
  userId: string,
  intent: ChatIntent,
  routeContext?: ChatRouteContext,
  userText = "",
  clientContext?: ChatClientContext
): Promise<DbFirstContext> {
  if (intent === "smalltalk" || intent === "smalltalk.greeting_feedback") {
    return {
      ok: true,
      contextType: "smalltalk",
      data: {},
    };
  }
  if (intent === "identify_question") return buildQuestionIdentificationContext(userId, userText, routeContext);
  if (intent === "question.similar_practice") {
    return buildSimilarPracticeContext(userId, routeContext, clientContext);
  }
  if (intent === "flashcard.create") {
    return buildFlashcardSupplyContext(userId, routeContext, userText, clientContext);
  }
  if (
    intent === "explain_question" ||
    intent === "question.explain_specific" ||
    intent === "question.translate_context" ||
    intent === "vocabulary.contextual" ||
    intent === "grammar.contextual"
  ) {
    return buildQuestionContext(userId, routeContext, userText);
  }
  if (intent === "analyze_test_result" || intent === "test_attempt.analysis") {
    return buildTestResultContext(userId, routeContext, userText);
  }
  if (
    intent === "check_progress" ||
    intent === "user_progress.summary" ||
    intent === "user_progress.ability_map"
  ) {
    return buildProgressContext(userId);
  }
  if (
    intent === "roadmap.summary" ||
    intent === "roadmap.next_step" ||
    intent === "roadmap.explain_recommendation" ||
    intent === "roadmap.adjust"
  ) {
    return buildRoadmapContext(userId, routeContext);
  }
  if (intent === "roadmap.guidance") {
    return {
      ok: true,
      contextType: "roadmap",
      data: {
        routeContext,
      },
    };
  }
  if (intent === "toeic_knowledge.general" || intent === "general_toeic_question") {
    return {
      ok: true,
      contextType: "general_toeic_knowledge",
      data: {
        allowedScope:
          "TOEIC exam knowledge, English for TOEIC, TOEIC study strategy, and guidance for this learning app.",
        refusal:
          "Mình chỉ hỗ trợ các câu hỏi liên quan TOEIC, tiếng Anh học TOEIC và việc học trong hệ thống này.",
        routeContext,
      },
    };
  }
  if (intent === "flashcard.personal") {
    return {
      ok: true,
      contextType: "flashcard",
      data: {
        routeContext,
      },
    };
  }
  if (intent === "app.navigation_support") {
    return {
      ok: true,
      contextType: "app_navigation",
      data: {
        routeContext,
      },
    };
  }
  if (intent === "listening_practice.analysis") {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "clarify",
      fallback:
        "Mình cần bạn mở đúng bài dictation hoặc shadowing có dữ liệu attempt để phân tích chính xác.",
    };
  }
  if (intent === "safe_fallback") {
    return {
      ok: false,
      errorType: "MISSING_CONTEXT",
      outcome: "safe_fallback",
      fallback:
        "Mình chưa xác định được bạn muốn hỏi phần nào. Bạn có thể hỏi về câu sai, tiến độ, bài test, flashcard hoặc kiến thức TOEIC cụ thể hơn.",
    };
  }
  return {
    ok: false,
    errorType: "VALIDATION_ERROR",
    fallback: "Câu hỏi này mình sẽ xử lý bằng luồng chat hiện tại.",
  };
}
