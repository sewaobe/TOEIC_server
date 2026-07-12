import { Types } from "mongoose";
import {
  GroupUser,
  StudentCareConversation,
  OPEN_CARE_CONVERSATION_STATUSES,
  CareSignalType,
  CareConversationStatus,
} from "../../models";
import { createNotification } from "../notification.service";
import { socketService } from "../socket.service";
import { getTemplateForSignal } from "./student-care-template.catalog";
import { resolveSuggestedSolutions } from "./student-care-solution.catalog";
import {
  CareConversationSummaryDto,
  CareContextItem,
  CareSignal,
  CareQuestionOption,
} from "./student-care.types";

function toObjectId(id: string | Types.ObjectId) {
  return id instanceof Types.ObjectId ? id : new Types.ObjectId(id);
}

function dateToIso(value?: Date | string | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function assertCollaboratorCanManageStudent(
  collaboratorId: string | Types.ObjectId,
  studentId: string | Types.ObjectId
) {
  const group = await GroupUser.findOne({
    mentor_id: toObjectId(collaboratorId),
    students: toObjectId(studentId),
  })
    .select("_id")
    .lean();

  if (!group) {
    const error: any = new Error("CTV không có quyền quản lý học viên này.");
    error.status = 403;
    throw error;
  }
}

function getScopeForSkill(skill: any, fallback: string) {
  if (!skill) return fallback;
  return [
    `part:${skill.partType ?? "unknown"}`,
    `skill:${skill.skillKey || skill.label || "unknown"}`,
  ].join("|");
}

function buildTemplateQuestion(signal: CareSignal) {
  const template = getTemplateForSignal(signal.signalType);
  if (!template) return undefined;
  return {
    templateId: template.templateId,
    version: template.version,
    text: template.buildQuestion(signal),
  };
}

export function deriveCareSignals(input: {
  summary: any;
  abilityProfile: any;
  interventionProfile: any;
}): CareSignal[] {
  const { summary, abilityProfile, interventionProfile } = input;
  const signals: CareSignal[] = [];
  const riskFlags = new Set<string>(interventionProfile?.riskFlags ?? []);
  const weakestSkill = abilityProfile?.summary?.weakestSkill;
  const weakestPart = abilityProfile?.summary?.weakestPart;
  const decliningSkill = (abilityProfile?.skills ?? []).find((skill: any) => skill.trend === "declining");
  const plateauSkill =
    (abilityProfile?.skills ?? []).find(
      (skill: any) => skill.status === "weak" && skill.trend === "stable"
    ) || weakestSkill;

  if (riskFlags.has("low_engagement")) {
    const daysSinceLastActive = interventionProfile?.engagement?.daysSinceLastActive;
    const daysUntilDeletion = interventionProfile?.engagement?.daysUntilLearningPathDeletion;
    signals.push({
      signalType: "low_engagement",
      signalScopeKey: "engagement:last_study_date",
      title: "Học viên đang ngưng học",
      severity: typeof daysUntilDeletion === "number" && daysUntilDeletion <= 4 ? "high" : "warning",
      actionMode: "care_conversation",
      contextSummary: [
        { code: "days_since_last_active", label: "Số ngày chưa học", value: daysSinceLastActive ?? null },
        { code: "days_until_learning_path_deletion", label: "Còn lại trước mốc xóa lộ trình", value: daysUntilDeletion ?? null },
        { code: "last_active", label: "Ngày học cuối", value: summary.lastActive ?? null },
      ],
      internalHypotheses: [
        "Có thể học viên thiếu thời gian, mất động lực hoặc bị kẹt ở bài hiện tại.",
        "CTV nên hỏi lý do trước khi chỉ gửi nhắc học chung chung.",
      ],
      metrics: { daysSinceLastActive, daysUntilDeletion },
      hasOpenConversation: false,
    });
  }

  if (riskFlags.has("no_recent_assessment")) {
    signals.push({
      signalType: "no_recent_assessment",
      signalScopeKey: "assessment:latest_checkpoint",
      title: "Thiếu checkpoint đánh giá mới",
      severity: "warning",
      actionMode: "care_conversation",
      contextSummary: [
        {
          code: "days_since_last_assessment",
          label: "Số ngày từ lần đánh giá gần nhất",
          value: interventionProfile?.assessment?.daysSinceLastAssessment ?? null,
        },
        { code: "score_source", label: "Nguồn điểm hiện tại", value: summary.scoreSource || null },
      ],
      internalHypotheses: [
        "Nếu không có checkpoint mới, IRT khó biết học viên đã thật sự tiến bộ hay chưa.",
      ],
      metrics: {
        daysSinceLastAssessment: interventionProfile?.assessment?.daysSinceLastAssessment ?? null,
      },
      hasOpenConversation: false,
    });
  }

  if (riskFlags.has("studying_without_score_gain")) {
    signals.push({
      signalType: "studying_without_score_gain",
      signalScopeKey: "score:learning_without_gain",
      title: "Có học nhưng năng lực chưa tăng",
      severity: "warning",
      actionMode: "care_conversation",
      contextSummary: [
        {
          code: "recent_learning_activity_count",
          label: "Hoạt động học gần đây",
          value: interventionProfile?.engagement?.recentLearningActivityCount ?? 0,
        },
        {
          code: "latest_score",
          label: "Điểm checkpoint gần nhất",
          value: interventionProfile?.assessment?.latestScore ?? summary.currentScore ?? null,
        },
      ],
      internalHypotheses: [
        "Học viên có thể hoàn thành bài nhưng chưa review lỗi hoặc làm quiz chưa kỹ.",
      ],
      hasOpenConversation: false,
    });
  }

  if (riskFlags.has("skill_plateau") && plateauSkill) {
    signals.push({
      signalType: "skill_plateau",
      signalScopeKey: getScopeForSkill(plateauSkill, "skill:plateau"),
      title: "Skill yếu chưa cải thiện",
      severity: "warning",
      actionMode: "care_conversation",
      contextSummary: [
        { code: "skill", label: "Skill", value: plateauSkill.label || plateauSkill.skillKey },
        { code: "part", label: "Part", value: plateauSkill.partType ?? weakestPart?.partType ?? null },
        { code: "ability_percent", label: "Năng lực hiện tại", value: plateauSkill.abilityPercent ?? null },
      ],
      internalHypotheses: [
        "Có thể học viên chưa hiểu phương pháp làm dạng này hoặc thiếu nền từ vựng/ngữ pháp liên quan.",
      ],
      relatedSkill: plateauSkill.label || plateauSkill.skillKey,
      relatedPart: plateauSkill.partType,
      metrics: { abilityPercent: plateauSkill.abilityPercent ?? null },
      hasOpenConversation: false,
    });
  }

  if (riskFlags.has("declining_skill") && decliningSkill) {
    signals.push({
      signalType: "declining_skill",
      signalScopeKey: getScopeForSkill(decliningSkill, "skill:declining"),
      title: "Skill có dấu hiệu giảm",
      severity: "high",
      actionMode: "care_conversation",
      contextSummary: [
        { code: "skill", label: "Skill", value: decliningSkill.label || decliningSkill.skillKey },
        { code: "part", label: "Part", value: decliningSkill.partType ?? null },
        { code: "ability_percent", label: "Năng lực hiện tại", value: decliningSkill.abilityPercent ?? null },
      ],
      internalHypotheses: [
        "Có thể checkpoint gần đây khó hơn, học viên làm vội hoặc quên lại kiến thức cũ.",
      ],
      relatedSkill: decliningSkill.label || decliningSkill.skillKey,
      relatedPart: decliningSkill.partType,
      metrics: { abilityPercent: decliningSkill.abilityPercent ?? null },
      hasOpenConversation: false,
    });
  }

  if (signals.length === 0) {
    signals.push({
      signalType: "continue_monitoring",
      signalScopeKey: "monitoring:normal",
      title: "Chưa có dấu hiệu cần hỏi học viên",
      severity: "info",
      actionMode: "internal_only",
      contextSummary: [
        { code: "status", label: "Trạng thái", value: summary.status ?? null },
        { code: "last_active", label: "Ngày học cuối", value: summary.lastActive ?? null },
      ],
      internalHypotheses: ["Tiếp tục theo dõi sau checkpoint tiếp theo."],
      hasOpenConversation: false,
    });
  }

  return signals.map((signal) => ({
    ...signal,
    suggestedQuestion: buildTemplateQuestion(signal),
  }));
}

function toSummaryDto(conversation: any): CareConversationSummaryDto {
  return {
    id: String(conversation._id),
    signalType: conversation.signal_type,
    signalTitle: conversation.signal_snapshot?.title || conversation.signal_type,
    signalScopeKey: conversation.signal_scope_key,
    status: conversation.status,
    questionText: conversation.question_template?.sent_text || "",
    primaryAnswer: conversation.student_primary_answer,
    secondaryAnswer: conversation.student_secondary_answer,
    studentNote: conversation.student_note,
    respondedAt: dateToIso(conversation.responded_at),
    latestSolutionAt: dateToIso(conversation.latest_solution_at),
    followUpDueAt: dateToIso(conversation.follow_up?.due_at),
    createdAt: dateToIso(conversation.createdAt) || "",
  };
}

export async function buildCareProfile(input: {
  studentId: string;
  collaboratorId?: string;
  learningPathId?: string | null;
  summary: any;
  abilityProfile: any;
  interventionProfile: any;
}) {
  if (!input.collaboratorId) {
    return {
      signals: [],
      activeCareConversations: [],
      recentHistory: [],
      totalHistory: 0,
    };
  }

  const dynamicSignals = deriveCareSignals({
    summary: input.summary,
    abilityProfile: input.abilityProfile,
    interventionProfile: input.interventionProfile,
  });
  const learningPathId = input.learningPathId ? toObjectId(input.learningPathId) : null;

  const [openCareConversations, recentHistory, totalHistory] = await Promise.all([
    StudentCareConversation.find({
      student_id: toObjectId(input.studentId),
      collaborator_id: toObjectId(input.collaboratorId),
      learning_path_id: learningPathId,
      status: { $in: OPEN_CARE_CONVERSATION_STATUSES },
    })
      .sort({ updatedAt: -1 })
      .lean(),
    StudentCareConversation.find({
      student_id: toObjectId(input.studentId),
      collaborator_id: toObjectId(input.collaboratorId),
      status: "resolved",
    })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean(),
    StudentCareConversation.countDocuments({
      student_id: toObjectId(input.studentId),
      collaborator_id: toObjectId(input.collaboratorId),
    }),
  ]);

  const openBySignal = new Map<string, any>();
  openCareConversations.forEach((conversation: any) => {
    openBySignal.set(`${conversation.signal_type}:${conversation.signal_scope_key}`, conversation);
  });

  const signals = dynamicSignals.map((signal) => {
    const open = openBySignal.get(`${signal.signalType}:${signal.signalScopeKey}`);
    return {
      ...signal,
      hasOpenConversation: Boolean(open),
      openConversationId: open ? String(open._id) : undefined,
    };
  });

  return {
    signals,
    activeCareConversations: openCareConversations.map(toSummaryDto),
    recentHistory: recentHistory.map(toSummaryDto),
    totalHistory,
  };
}

export async function createCareConversation(input: {
  studentId: string;
  collaboratorId: string;
  learningPathId?: string | null;
  signal: CareSignal;
  sentText?: string;
}) {
  await assertCollaboratorCanManageStudent(input.collaboratorId, input.studentId);
  if (input.signal.actionMode !== "care_conversation") {
    const error: any = new Error("Dấu hiệu này chỉ dùng để theo dõi nội bộ, không tạo trao đổi học tập.");
    error.status = 400;
    throw error;
  }

  const template = getTemplateForSignal(input.signal.signalType);
  if (!template) {
    const error: any = new Error("Chưa có mẫu câu hỏi hỗ trợ cho dấu hiệu này.");
    error.status = 400;
    throw error;
  }

  const learningPathId = input.learningPathId ? toObjectId(input.learningPathId) : null;
  const existing = await StudentCareConversation.findOne({
    student_id: toObjectId(input.studentId),
    signal_type: input.signal.signalType,
    signal_scope_key: input.signal.signalScopeKey,
    learning_path_id: learningPathId,
    status: { $in: OPEN_CARE_CONVERSATION_STATUSES },
  }).lean();

  if (existing) return { conversation: toSummaryDto(existing), reused: true };

  const originalText = template.buildQuestion(input.signal);
  const trimmedSentText = typeof input.sentText === "string" ? input.sentText.trim() : "";
  const sentText = trimmedSentText || originalText;
  const conversation = await StudentCareConversation.create({
    student_id: toObjectId(input.studentId),
    collaborator_id: toObjectId(input.collaboratorId),
    learning_path_id: learningPathId,
    signal_type: input.signal.signalType,
    signal_scope_key: input.signal.signalScopeKey,
    signal_snapshot: {
      title: input.signal.title,
      observed_at: new Date(),
      context_summary: input.signal.contextSummary,
      internal_hypotheses: input.signal.internalHypotheses,
      action_mode: input.signal.actionMode,
      related_skill: input.signal.relatedSkill,
      related_part: input.signal.relatedPart,
      related_question_type: input.signal.relatedQuestionType,
      metrics: input.signal.metrics || {},
    },
    question_template: {
      template_id: template.templateId,
      version: template.version,
      original_text: originalText,
      sent_text: sentText,
      edited_by_collaborator: Boolean(trimmedSentText && trimmedSentText !== originalText),
    },
    primary_options: template.primaryOptions,
    secondary_options_by_primary: template.secondaryOptionsByPrimary,
    status: "waiting_for_response",
  });

  const notification = await createNotification({
    senderId: input.collaboratorId,
    recipientId: input.studentId,
    type: "system",
    message: "CTV muốn trao đổi nhanh về việc học của bạn",
    description: sentText,
    metadata: {
      entityType: "student_care_conversation",
      entityId: String(conversation._id),
      event: "care_conversation_created",
    },
  });

  socketService.notifyStudent(input.studentId, "receiveNotification", {
    id: String((notification as any)._id),
    ...notification.toObject?.(),
  });

  return { conversation: toSummaryDto(conversation), reused: false };
}

function findOption(options: CareQuestionOption[], code?: string) {
  if (!code) return undefined;
  return options.find((option) => option.code === code);
}

export async function respondToCareConversation(input: {
  conversationId: string;
  studentId: string;
  primaryAnswerCode: string;
  secondaryAnswerCode?: string;
  note?: string;
}) {
  const conversation = await StudentCareConversation.findOne({
    _id: input.conversationId,
    student_id: toObjectId(input.studentId),
    status: "waiting_for_response",
  });
  if (!conversation) {
    const error: any = new Error("Trao đổi học tập không tồn tại hoặc đã được phản hồi.");
    error.status = 409;
    throw error;
  }

  const primary = findOption(conversation.primary_options as CareQuestionOption[], input.primaryAnswerCode);
  if (!primary) {
    const error: any = new Error("Câu trả lời chính không hợp lệ.");
    error.status = 400;
    throw error;
  }

  const secondaryOptions =
    ((conversation.secondary_options_by_primary || {})[input.primaryAnswerCode] as CareQuestionOption[]) || [];
  const secondary = findOption(secondaryOptions, input.secondaryAnswerCode);
  if (primary.requires_secondary && !secondary) {
    const error: any = new Error("Vui lòng chọn câu trả lời bổ sung.");
    error.status = 400;
    throw error;
  }
  if (input.secondaryAnswerCode && !secondary) {
    const error: any = new Error("Câu trả lời bổ sung không hợp lệ.");
    error.status = 400;
    throw error;
  }

  const sanitizedNote =
    typeof input.note === "string" ? input.note.trim().slice(0, 1000) : undefined;
  const requiresSupport = Boolean(primary.requires_support || secondary?.requires_support);
  const suggestedSolutions = resolveSuggestedSolutions({
    signalType: conversation.signal_type,
    primaryAnswerCode: primary.code,
    secondaryAnswerCode: secondary?.code,
    signalSnapshot: conversation.signal_snapshot,
  });

  const updated = await StudentCareConversation.findOneAndUpdate(
    {
      _id: conversation._id,
      student_id: toObjectId(input.studentId),
      status: "waiting_for_response",
    },
    {
      $set: {
        student_primary_answer: { code: primary.code, label: primary.label },
        student_secondary_answer: secondary
          ? { code: secondary.code, label: secondary.label }
          : undefined,
        student_note: sanitizedNote,
        suggested_solutions: suggestedSolutions,
        status: requiresSupport ? "needs_support" : "responded",
        responded_at: new Date(),
      },
    },
    { new: true }
  );

  if (!updated) {
    const error: any = new Error("Trao đổi học tập đã được xử lý trước đó.");
    error.status = 409;
    throw error;
  }

  const notification = await createNotification({
    senderId: input.studentId,
    recipientId: String(updated.collaborator_id),
    type: "system",
    message: requiresSupport
      ? "Học viên đã phản hồi và cần được hỗ trợ"
      : "Học viên đã phản hồi trao đổi học tập",
    description: primary.label,
    metadata: {
      entityType: "student_care_conversation",
      entityId: String(updated._id),
      event: "student_responded",
      responseNeedsSupport: requiresSupport,
    },
  });

  socketService.notifyCollaborator(String(updated.collaborator_id), "receiveNotification", {
    id: String((notification as any)._id),
    ...notification.toObject?.(),
  });

  return updated;
}

export async function getCtvCareConversationDetail(conversationId: string, collaboratorId: string) {
  const conversation = await StudentCareConversation.findOne({
    _id: conversationId,
    collaborator_id: toObjectId(collaboratorId),
  }).lean();
  if (!conversation) {
    const error: any = new Error("Không tìm thấy trao đổi học tập.");
    error.status = 404;
    throw error;
  }
  return conversation;
}

export async function getStudentCareConversationDetail(conversationId: string, studentId: string) {
  const conversation = await StudentCareConversation.findOne({
    _id: conversationId,
    student_id: toObjectId(studentId),
  }).lean();
  if (!conversation) {
    const error: any = new Error("Không tìm thấy trao đổi học tập.");
    error.status = 404;
    throw error;
  }
  return conversation;
}

export async function listStudentPendingCareConversations(studentId: string) {
  return StudentCareConversation.find({
    student_id: toObjectId(studentId),
    status: "waiting_for_response",
  })
    .sort({ createdAt: -1 })
    .lean();
}

export async function listCtvStudentCareConversations(input: {
  studentId: string;
  collaboratorId: string;
  status?: CareConversationStatus;
  page?: number;
  limit?: number;
}) {
  await assertCollaboratorCanManageStudent(input.collaboratorId, input.studentId);
  const page = Math.max(Number(input.page || 1), 1);
  const limit = Math.min(Math.max(Number(input.limit || 10), 1), 50);
  const query: any = {
    student_id: toObjectId(input.studentId),
    collaborator_id: toObjectId(input.collaboratorId),
  };
  if (input.status) query.status = input.status;
  const [items, total] = await Promise.all([
    StudentCareConversation.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StudentCareConversation.countDocuments(query),
  ]);

  return {
    items: items.map(toSummaryDto),
    total,
    page,
    pageCount: Math.ceil(total / limit),
  };
}

export async function addCtvSolution(input: {
  conversationId: string;
  collaboratorId: string;
  solutionCodes: string[];
  note?: string;
  followUpDueAt?: string | null;
}) {
  const conversation = await StudentCareConversation.findOne({
    _id: input.conversationId,
    collaborator_id: toObjectId(input.collaboratorId),
    status: { $in: ["responded", "needs_support", "solution_provided", "follow_up_due"] },
  });
  if (!conversation) {
    const error: any = new Error("Trao đổi học tập không tồn tại hoặc chưa thể ghi nhận giải pháp.");
    error.status = 404;
    throw error;
  }

  const dueAt = input.followUpDueAt ? new Date(input.followUpDueAt) : null;
  const now = new Date();
  const solutionEntry = {
    collaborator_id: input.collaboratorId,
    solution_codes: input.solutionCodes || [],
    note: typeof input.note === "string" ? input.note.trim().slice(0, 1000) : "",
    created_at: now,
  };

  conversation.solution_history.push(solutionEntry);
  conversation.latest_solution_at = now;
  conversation.status = dueAt && !Number.isNaN(dueAt.getTime()) ? "follow_up_due" : "solution_provided";
  conversation.follow_up = dueAt
    ? { ...(conversation.follow_up || {}), mode: "time", due_at: dueAt }
    : conversation.follow_up;
  await conversation.save();
  return conversation;
}

export async function updateFollowUp(input: {
  conversationId: string;
  collaboratorId: string;
  dueAt?: string | null;
}) {
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const conversation = await StudentCareConversation.findOneAndUpdate(
    {
      _id: input.conversationId,
      collaborator_id: toObjectId(input.collaboratorId),
      status: { $in: ["solution_provided", "follow_up_due"] },
    },
    {
      $set: {
        status: dueAt && !Number.isNaN(dueAt.getTime()) ? "follow_up_due" : "solution_provided",
        follow_up: dueAt ? { mode: "time", due_at: dueAt } : undefined,
      },
    },
    { new: true }
  );
  if (!conversation) {
    const error: any = new Error("Không thể cập nhật lịch theo dõi.");
    error.status = 404;
    throw error;
  }
  return conversation;
}

export async function resolveCareConversation(input: { conversationId: string; collaboratorId: string }) {
  const conversation = await StudentCareConversation.findOneAndUpdate(
    {
      _id: input.conversationId,
      collaborator_id: toObjectId(input.collaboratorId),
      status: { $in: OPEN_CARE_CONVERSATION_STATUSES },
    },
    { $set: { status: "resolved", resolved_at: new Date() } },
    { new: true }
  );
  if (!conversation) {
    const error: any = new Error("Không thể đóng trao đổi học tập.");
    error.status = 404;
    throw error;
  }
  return conversation;
}


