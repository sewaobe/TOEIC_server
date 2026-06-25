import { Types } from "mongoose";
import { Group } from "../models/group.model";
import { Question } from "../models/question.model";
import { UserProgress } from "../models/user_progress.model";
import { UserSkill } from "../models/user_skill.model";
import { UserSkillHistory } from "../models/user_skill_history.model";
import { UserTest } from "../models/user_test.model";
import { LearningPath } from "../models/learning_path.model";
import {
  ChatIntent,
  ChatRouteContext,
  DbFirstContext,
} from "../types/chat.types";
import { resolveQuestionReferenceFromRouteContext } from "./chat_question_reference.service";

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

  if (!progress && !skill && !latestTest) {
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
            completedLessons: progress.completed_lessons,
            totalLessons: progress.total_lessons,
            completionRate: progress.completion_rate,
            totalStudyTime: progress.total_study_time,
            streakDays: progress.streak_days,
            longestStreak: progress.longest_streak,
            currentScore: progress.current_score,
            targetScore: progress.target_score,
            status: progress.status,
            lastStudyDate: progress.last_study_date,
          }
        : null,
      skillParts: skill?.parts ?? [],
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
  const days = weeks.flatMap((week) =>
    Array.isArray(week?.days) ? week.days : []
  );
  const sessions = days.flatMap((day) =>
    (Array.isArray(day?.sessions) ? day.sessions : []).map((session: any) => ({
      ...session,
      dayId: String(day?._id ?? ""),
      dayOfWeek: day?.dayOfWeek,
      dayStatus: day?.status,
    }))
  );
  const completedDays = days.filter(
    (day) => day?.status === "completed"
  ).length;
  const completedSessions = sessions.filter(
    (session) => session?.status === "completed"
  ).length;
  const nextSession =
    sessions.find((session) => session?.status === "in_progress") ??
    sessions.find((session) => session?.status !== "completed");
  const totalDays = days.length;
  const completionRate = totalDays
    ? Math.round((completedDays / totalDays) * 100)
    : 0;

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
        currentWeek: roadmap.current_week ?? 1,
        totalWeeks: weeks.length,
        completedWeeks: weeks.filter(
          (week) => week?.status === "completed"
        ).length,
        totalDays,
        completedDays,
        completionRate,
        totalSessions: sessions.length,
        completedSessions,
        isActive: roadmap.isActive,
      },
      nextStep: nextSession
        ? {
            dayId: nextSession.dayId,
            dayOfWeek: nextSession.dayOfWeek,
            sessionNo: nextSession.session_no,
            status: nextSession.status,
            part: nextSession.part_type,
            title: nextSession.lesson_manager_title,
            plannedMinutes: nextSession.planned_minutes,
            reason: nextSession.scheduler_reason,
          }
        : null,
    },
  };
}

export async function buildDbFirstContext(
  userId: string,
  intent: ChatIntent,
  routeContext?: ChatRouteContext,
  userText = ""
): Promise<DbFirstContext> {
  if (intent === "smalltalk" || intent === "smalltalk.greeting_feedback") {
    return {
      ok: true,
      contextType: "smalltalk",
      data: {},
    };
  }
  if (intent === "identify_question") return buildQuestionIdentificationContext(userId, userText, routeContext);
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
  if (intent === "check_progress" || intent === "user_progress.summary") return buildProgressContext(userId);
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
