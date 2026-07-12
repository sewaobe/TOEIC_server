import {
  User,
  UserActivity,
  UserTest,
  GroupUser,
  LearningPath,
  LearningPathStrategyOption,
  UserProgress,
  UserSkill,
  UserSkillHistory,
} from "../models";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { TestType } from "../models/enums/TestType";
import { UserTestSubmitType } from "../models/enums/UserTestSubmitType";
import { getToeicSkillLabelVi } from "../utils/toeic_skill.util";
import { calculateProjectedToeicScore } from "./learning_path_v2/skill_roi_optimizer.service";
import {
  assertCollaboratorCanManageStudent,
  buildCareProfile,
} from "./student-care/student-care-conversation.service";

const AT_RISK_DAYS = 5;
const INACTIVE_DAYS = 21;
const LEARNING_PATH_DELETION_RISK_DAYS = 14;
const REMINDER_SCHEDULE_DAYS = [5, 9, 13] as const;

type StudentStatus =
  | "not_started"
  | "active"
  | "at_risk"
  | "inactive"
  | "paused"
  | "completed";

type LastActiveSnapshot = {
  date: Date | null;
  source: string | null;
};

type ScoreSnapshot = {
  score: number;
  source: string;
  estimatedScore?: number;
  estimatedListeningScore?: number;
  estimatedReadingScore?: number;
  scoreAbilityCoverage?: number;
  missingAbilityParts?: number[];
};

type ProgressSnapshot = {
  completedLessons: number;
  totalLessons: number;
  completionRate: number;
  progressUnit: "stage";
  progressScope: "program";
  currentCycleNo: number | null;
  totalCycles: number;
  completedCycles: number;
  currentCycleProgress: {
    completedStages: number;
    totalStages: number;
    completionRate: number;
  } | null;
};

type RecentActivitySource = "user_activity" | "user_test";

type RecentActivity = {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  metadata: Record<string, any>;
  source: RecentActivitySource;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDayUTC(value?: Date | string | null) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetweenDates(from?: Date | string | null, to?: Date | string | null) {
  const start = startOfDayUTC(from);
  const end = startOfDayUTC(to);
  if (!start || !end) return Infinity;
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function userIdQueryValues(userId: any) {
  const idString = userId?.toString?.() ?? String(userId);
  return [idString, userId];
}

async function getLatestLearningPath(userId: any) {
  const populateDays = {
    path: "week_study_ids",
    populate: {
      path: "days",
    },
  };

  const active = await LearningPath.findOne({
    user_id: userId,
    $or: [{ isActive: true }, { status: "active" }],
  })
    .sort({ isActive: -1, updated_at: -1, created_at: -1, _id: -1 })
    .populate(populateDays)
    .lean();

  if (active) return active;

  return LearningPath.findOne({ user_id: userId })
    .sort({ updated_at: -1, created_at: -1, _id: -1 })
    .populate(populateDays)
    .lean();
}

async function getLatestUserProgress(userId: any, learningPathId?: any) {
  if (learningPathId) {
    const scoped = await UserProgress.findOne({
      user_id: userId,
      learningPath_id: learningPathId,
    })
      .sort({ updated_at: -1, _id: -1 })
      .lean();

    if (scoped) return scoped;
  }

  return UserProgress.findOne({ user_id: userId })
    .sort({ updated_at: -1, _id: -1 })
    .lean();
}

async function getLatestStrategyOption(userId: any, learningPathId?: any) {
  if (!learningPathId) return null;

  const selected = await LearningPathStrategyOption.findOne({
    user_id: userId,
    learning_path_id: learningPathId,
    status: "selected",
  })
    .sort({ created_at: -1, _id: -1 })
    .lean();

  if (selected) return selected;

  return LearningPathStrategyOption.findOne({
    user_id: userId,
    learning_path_id: learningPathId,
  })
    .sort({ created_at: -1, _id: -1 })
    .lean();
}

function isStageCompleted(dayStudy: any) {
  if (dayStudy?.status === WeekStudyStatus.COMPLETED) return true;

  const requiredItems = (dayStudy?.sessions ?? []).flatMap((session: any) =>
    (session?.items ?? []).filter(
      (item: any) =>
        item?.status !== WeekStudyStatus.DELETED && item?.is_required !== false
    )
  );

  return (
    requiredItems.length > 0 &&
    requiredItems.every((item: any) => item?.status === WeekStudyStatus.COMPLETED)
  );
}

function getMaterializedCycles(learningPath: any) {
  return [...(learningPath?.week_study_ids ?? [])].sort(
    (a: any, b: any) => Number(a?.no ?? 0) - Number(b?.no ?? 0)
  );
}

function getCycleStages(cycle: any) {
  return Array.isArray(cycle?.days) ? cycle.days : [];
}

function countPlannedStagesFromStrategy(strategyOption: any) {
  const cycles = strategyOption?.roadmap_simulation?.cycles;
  if (!Array.isArray(cycles) || cycles.length === 0) return 0;

  return cycles.reduce((total: number, cycle: any) => {
    const unitCount = Array.isArray(cycle?.selected_units)
      ? cycle.selected_units.length
      : 0;
    return total + unitCount + 1; // assessment stage at the end of each cycle
  }, 0);
}

function getCompletionRate(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

function getNormalizedUserActivityType(activity: any) {
  switch (activity?.type) {
    case "LEARNING_ACTIVITY_COMPLETED":
      return "activity_completed";
    case "DAY_STUDY_COMPLETED":
      return "stage_completed";
    case "WEEK_STUDY_COMPLETED":
      return "cycle_completed";
    case "ADJUSTMENT_REQUEST_CREATED":
      return "adjustment_requested";
    case "ADJUSTMENT_REQUEST_APPROVED":
      return "adjustment_approved";
    case "ADJUSTMENT_REQUEST_REJECTED":
      return "adjustment_rejected";
    case "OTHER":
      return activity?.metadata?.type === "STREAK_MILESTONE"
        ? "streak_milestone"
        : null;
    default:
      return null;
  }
}

function normalizeUserActivity(activity: any): RecentActivity | null {
  const normalizedType = getNormalizedUserActivityType(activity);
  const timestamp = toDate(activity?.timestamp);
  if (!normalizedType || !timestamp) return null;

  return {
    id: String(activity._id),
    type: normalizedType,
    title: activity.title || "Hoáº¡t Ä‘á»™ng há»c táº­p",
    description: activity.description || "",
    timestamp: timestamp.toISOString(),
    metadata: activity.metadata || {},
    source: "user_activity",
  };
}

function normalizeUserTestActivity(test: any): RecentActivity | null {
  const timestamp = toDate(test?.submit_at);
  if (!timestamp) return null;

  return {
    id: String(test._id),
    type: "test_submit",
    title: `Ná»™p bÃ i kiá»ƒm tra: ${
      (test.test_id as any)?.title || "BÃ i thi khÃ´ng rÃµ tÃªn"
    }`,
    description: (test.test_id as any)?.topic
      ? `Chá»§ Ä‘á»: ${(test.test_id as any)?.topic}`
      : "",
    timestamp: timestamp.toISOString(),
    metadata: {
      score: test.score ?? 0,
      duration: test.duration ?? 0,
      totalQuestions: test.answers?.length ?? 0,
      testId: (test.test_id as any)?._id || null,
      testType: (test.test_id as any)?.type || "",
    },
    source: "user_test",
  };
}

async function buildProgressSnapshot(
  userId: any,
  learningPath: any
): Promise<ProgressSnapshot> {
  const cycles = getMaterializedCycles(learningPath);
  const strategyOption = await getLatestStrategyOption(userId, learningPath?._id);

  const allStages = cycles.flatMap(getCycleStages);
  const completedStages = allStages.filter(isStageCompleted).length;
  const materializedStageCount = allStages.length;
  const plannedStageCount = countPlannedStagesFromStrategy(strategyOption);
  const totalStages =
    plannedStageCount > 0
      ? Math.max(plannedStageCount, materializedStageCount)
      : materializedStageCount;

  const currentCycle =
    [...cycles].reverse().find((cycle: any) => cycle?.status === WeekStudyStatus.IN_PROGRESS) ??
    cycles[cycles.length - 1] ??
    null;
  const currentCycleStages = currentCycle ? getCycleStages(currentCycle) : [];
  const currentCycleCompletedStages = currentCycleStages.filter(isStageCompleted).length;
  const totalCycles =
    strategyOption?.roadmap_simulation?.cycle_count || cycles.length || 0;
  const completedCycles = cycles.filter(
    (cycle: any) => cycle?.status === WeekStudyStatus.COMPLETED
  ).length;

  return {
    completedLessons: completedStages,
    totalLessons: totalStages,
    completionRate: getCompletionRate(completedStages, totalStages),
    progressUnit: "stage",
    progressScope: "program",
    currentCycleNo: currentCycle ? Number(currentCycle.no ?? 0) || null : null,
    totalCycles,
    completedCycles,
    currentCycleProgress: currentCycle
      ? {
          completedStages: currentCycleCompletedStages,
          totalStages: currentCycleStages.length,
          completionRate: getCompletionRate(
            currentCycleCompletedStages,
            currentCycleStages.length
          ),
        }
      : null,
  };
}

async function getLatestSkillSnapshotForScore(userId: any, learningPath: any) {
  const learningPathId = learningPath?._id;
  const query = learningPathId
    ? { user_id: userId, context_type: "learning_path", learning_path_id: learningPathId }
    : { user_id: userId, context_type: "learning_path" };

  let skillSnapshot = await UserSkill.findOne(query)
    .sort({ updated_at: -1, _id: -1 })
    .lean();

  if (!skillSnapshot && learningPathId) {
    skillSnapshot = await UserSkill.findOne({
      user_id: userId,
      context_type: "learning_path",
    })
      .sort({ updated_at: -1, _id: -1 })
      .lean();
  }

  return skillSnapshot;
}

function getPartAbilityProjection(skillSnapshot: any) {
  const abilities: Record<number, number> = {};
  const missingAbilityParts: number[] = [];

  for (let partType = 1; partType <= 7; partType += 1) {
    const part = (skillSnapshot?.parts ?? []).find(
      (item: any) => Number(item?.part_type) === partType
    );
    const ability = Number(part?.ability);
    if (Number.isFinite(ability) && ability >= 0 && ability <= 1) {
      abilities[partType] = ability;
    } else {
      missingAbilityParts.push(partType);
    }
  }

  return {
    abilities,
    missingAbilityParts,
    scoreAbilityCoverage: 7 - missingAbilityParts.length,
  };
}

async function getScoreSnapshot(userId: any, learningPath?: any): Promise<ScoreSnapshot> {
  const skillSnapshot = await getLatestSkillSnapshotForScore(userId, learningPath);
  const projectionInput = getPartAbilityProjection(skillSnapshot);

  if (projectionInput.missingAbilityParts.length === 0) {
    const projectedScore = calculateProjectedToeicScore(projectionInput.abilities);
    return {
      score: projectedScore.projected_total_score,
      source: "projected_ability",
      estimatedScore: projectedScore.projected_total_score,
      estimatedListeningScore: projectedScore.projected_listening_score,
      estimatedReadingScore: projectedScore.projected_reading_score,
      scoreAbilityCoverage: projectionInput.scoreAbilityCoverage,
      missingAbilityParts: [],
    };
  }

  const tests = await UserTest.find({
    user_id: { $in: userIdQueryValues(userId) },
  })
    .populate("test_id", "type title topic")
    .sort({ submit_at: -1, _id: -1 })
    .limit(20)
    .lean();

  const hasScore = (test: any) => typeof test?.score === "number";
  const fullTest = tests.find(
    (test: any) =>
      hasScore(test) &&
      (test.submit_type === UserTestSubmitType.FULL_TEST ||
        test.test_id?.type === TestType.FULL_TEST)
  );
  if (fullTest) {
    return {
      score: Math.round(fullTest.score),
      source: "full_test",
      scoreAbilityCoverage: projectionInput.scoreAbilityCoverage,
      missingAbilityParts: projectionInput.missingAbilityParts,
    };
  }

  const assessment = tests.find(
    (test: any) =>
      hasScore(test) && test.submit_type === UserTestSubmitType.INITIAL_ASSESSMENT
  );
  if (assessment) {
    return {
      score: Math.round(assessment.score),
      source: "initial_assessment",
      scoreAbilityCoverage: projectionInput.scoreAbilityCoverage,
      missingAbilityParts: projectionInput.missingAbilityParts,
    };
  }

  const demoTest = tests.find(
    (test: any) => hasScore(test) && test.completedPart === "demo_test"
  );
  if (demoTest) {
    return {
      score: Math.round(demoTest.score),
      source: "demo_test",
      scoreAbilityCoverage: projectionInput.scoreAbilityCoverage,
      missingAbilityParts: projectionInput.missingAbilityParts,
    };
  }

  const latestScoredTest = tests.find(hasScore);
  if (latestScoredTest) {
    return {
      score: Math.round(latestScoredTest.score),
      source: "latest_test",
      scoreAbilityCoverage: projectionInput.scoreAbilityCoverage,
      missingAbilityParts: projectionInput.missingAbilityParts,
    };
  }

  return {
    score: 0,
    source: "none",
    scoreAbilityCoverage: projectionInput.scoreAbilityCoverage,
    missingAbilityParts: projectionInput.missingAbilityParts,
  };
}

async function getLastActiveSnapshot(
  _user: any,
  progress: any
): Promise<LastActiveSnapshot> {
  return {
    date: toDate(progress?.last_study_date),
    source: progress?.last_study_date ? "user_progress.last_study_date" : null,
  };
}

function deriveStudentStatus(input: {
  progress: ProgressSnapshot;
  lastActive: LastActiveSnapshot;
  persistedStatus?: string;
}): StudentStatus {
  if (input.progress.totalLessons > 0 && input.progress.completionRate >= 100) {
    return "completed";
  }

  if (input.persistedStatus === "paused") return "paused";
  if (input.persistedStatus === "inactive") return "inactive";
  if (input.persistedStatus === "completed") return "completed";

  if (!input.lastActive.date) return "not_started";

  const gapDays = daysBetweenDates(input.lastActive.date, new Date());
  if (gapDays >= INACTIVE_DAYS) return "inactive";
  if (gapDays >= AT_RISK_DAYS) return "at_risk";

  return "active";
}

function buildTags(completionRate: number) {
  if (completionRate >= 80) return ["xuáº¥t sáº¯c"];
  if (completionRate >= 50) return ["tiáº¿n bá»™ tá»‘t"];
  return ["cáº§n há»— trá»£"];
}

function abilityPercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(Math.max(0, Math.min(1, numeric)) * 100);
}

function getPartSection(partType: number) {
  return partType >= 1 && partType <= 4 ? "listening" : "reading";
}

function getPartLabel(partType: number) {
  return `Part ${partType}`;
}

function averageAbility(items: Array<{ abilityPercent: number }>) {
  if (!items.length) return 0;
  return Math.round(
    items.reduce((sum, item) => sum + item.abilityPercent, 0) / items.length
  );
}

function getOverallTrend(items: Array<{ trend?: string }>) {
  const declining = items.filter((item) => item.trend === "declining").length;
  const improving = items.filter((item) => item.trend === "improving").length;
  if (declining > improving) return "declining";
  if (improving > declining) return "improving";
  return "stable";
}

async function buildAbilityProfile(userId: any, learningPath: any) {
  const learningPathId = learningPath?._id;
  const skillQuery = learningPathId
    ? { user_id: userId, context_type: "learning_path", learning_path_id: learningPathId }
    : { user_id: userId, context_type: "learning_path" };

  let skillSnapshot: any = await UserSkill.findOne(skillQuery)
    .sort({ updated_at: -1, _id: -1 })
    .lean();

  if (!skillSnapshot && learningPathId) {
    skillSnapshot = await UserSkill.findOne({
      user_id: userId,
      context_type: "learning_path",
    })
      .sort({ updated_at: -1, _id: -1 })
      .lean();
  }

  const historyQuery = learningPathId
    ? { user_id: userId, context_type: "learning_path", learning_path_id: learningPathId }
    : { user_id: userId, context_type: "learning_path" };

  let histories: any[] = await UserSkillHistory.find(historyQuery)
    .sort({ created_at: -1, _id: -1 })
    .limit(12)
    .lean();

  if (histories.length === 0 && learningPathId) {
    histories = await UserSkillHistory.find({
      user_id: userId,
      context_type: "learning_path",
    })
      .sort({ created_at: -1, _id: -1 })
      .limit(12)
      .lean();
  }

  const parts = [...(skillSnapshot?.parts ?? [])]
    .sort((left: any, right: any) => Number(left.part_type) - Number(right.part_type))
    .map((part: any) => {
      const skills = part.skills ?? [];
      return {
        partType: Number(part.part_type),
        label: getPartLabel(Number(part.part_type)),
        section: getPartSection(Number(part.part_type)),
        abilityPercent: abilityPercent(part.ability),
        status: part.status || "medium",
        trend: part.trend || "stable",
        skillCount: skills.length,
        weakSkillCount: skills.filter((skill: any) => skill.status === "weak").length,
        lastEvaluatedAt: toDate(part.last_evaluated_at)?.toISOString() || null,
      };
    });

  const skills = [...(skillSnapshot?.parts ?? [])]
    .flatMap((part: any) =>
      (part.skills ?? []).map((skill: any) => ({
        skillKey: skill.skill_key,
        label: skill.label_vi || getToeicSkillLabelVi(skill.skill_key, skill.part_type),
        partType: Number(skill.part_type ?? part.part_type),
        section: getPartSection(Number(skill.part_type ?? part.part_type)),
        skillGroup: skill.skill_group || "",
        abilityPercent: abilityPercent(skill.ability),
        status: skill.status || "medium",
        absoluteLevel: skill.absolute_level || "",
        trend: skill.trend || "stable",
        trendSlope: typeof skill.trend_slope === "number" ? skill.trend_slope : null,
        historyCount: skill.history_count || 0,
        itemCount: skill.item_count || 0,
        correctCount: skill.correct_count || 0,
        lastEvaluatedAt: toDate(skill.last_evaluated_at)?.toISOString() || null,
      }))
    )
    .sort((left: any, right: any) => {
      const statusWeight: Record<string, number> = { weak: 0, medium: 1, strong: 2 };
      return (
        (statusWeight[left.status] ?? 1) - (statusWeight[right.status] ?? 1) ||
        left.abilityPercent - right.abilityPercent ||
        left.partType - right.partType
      );
    });

  const listeningParts = parts.filter((part) => part.section === "listening");
  const readingParts = parts.filter((part) => part.section === "reading");
  const weakestPart = [...parts].sort(
    (left, right) => left.abilityPercent - right.abilityPercent
  )[0] || null;
  const weakestSkill = [...skills].sort(
    (left, right) => left.abilityPercent - right.abilityPercent
  )[0] || null;

  const cycles = getMaterializedCycles(learningPath);
  const currentCycle =
    [...cycles].reverse().find((cycle: any) => cycle?.status === WeekStudyStatus.IN_PROGRESS) ??
    cycles[cycles.length - 1] ??
    null;

  return {
    hasData: Boolean(skillSnapshot),
    lastEvaluatedAt: toDate(skillSnapshot?.last_evaluated_at)?.toISOString() || null,
    summary: {
      listeningAbilityPercent: averageAbility(listeningParts),
      readingAbilityPercent: averageAbility(readingParts),
      weakestPart,
      weakestSkill,
      overallTrend: getOverallTrend(parts),
    },
    sections: [
      {
        key: "listening",
        label: "Listening",
        abilityPercent: averageAbility(listeningParts),
        partTypes: [1, 2, 3, 4],
        weakPartCount: listeningParts.filter((part) => part.status === "weak").length,
      },
      {
        key: "reading",
        label: "Reading",
        abilityPercent: averageAbility(readingParts),
        partTypes: [5, 6, 7],
        weakPartCount: readingParts.filter((part) => part.status === "weak").length,
      },
    ],
    parts,
    skills,
    history: [...histories].reverse().map((history: any) => ({
      id: String(history._id),
      date:
        toDate(history.submitted_at)?.toISOString() ||
        toDate(history.created_at)?.toISOString() ||
        "",
      triggerType: history.trigger_type,
      parts: (history.parts ?? []).map((part: any) => ({
        partType: Number(part.part_type),
        abilityPercent: abilityPercent(part.ability),
        status: part.status,
        itemCount: part.item_count || 0,
        correctCount: part.correct_count || 0,
      })),
      skills: (history.skills ?? []).slice(0, 12).map((skill: any) => ({
        skillKey: skill.skill_key,
        label: skill.label_vi || getToeicSkillLabelVi(skill.skill_key, skill.part_type),
        partType: Number(skill.part_type || 0),
        abilityPercent: abilityPercent(skill.ability),
        status: skill.status,
        itemCount: skill.item_count || 0,
        correctCount: skill.correct_count || 0,
      })),
    })),
    currentFocus: currentCycle
      ? {
          cycleNo: Number(currentCycle.no ?? 0) || null,
          partType: currentCycle.focus_part_type || null,
          primarySkillKey: currentCycle.primary_focus_skill_key || null,
          primarySkillLabel: currentCycle.primary_focus_skill_key
            ? getToeicSkillLabelVi(
                currentCycle.primary_focus_skill_key,
                currentCycle.focus_part_type
              )
            : "",
          coveredSkillKeys: currentCycle.covered_skill_keys ?? [],
          coveredSkillLabels: (currentCycle.covered_skill_keys ?? []).map((key: string) =>
            getToeicSkillLabelVi(key, currentCycle.focus_part_type)
          ),
          expectedSkillGain: currentCycle.expected_skill_gain ?? null,
          assessmentType: currentCycle.assessment_type || null,
        }
      : null,
  };
}

function getLatestTestDate(tests: any[]) {
  const latest = tests.find((test) => toDate(test?.submit_at));
  return latest ? toDate(latest.submit_at) : null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getRecommendedReminderStep(daysSinceLastActive: number | null): 1 | 2 | 3 | null {
  if (daysSinceLastActive === null || daysSinceLastActive < REMINDER_SCHEDULE_DAYS[0]) {
    return null;
  }
  if (daysSinceLastActive < REMINDER_SCHEDULE_DAYS[1]) return 1;
  if (daysSinceLastActive < REMINDER_SCHEDULE_DAYS[2]) return 2;
  return 3;
}

function getNextReminderEligibleAt(lastActiveDate: Date | null, step: 1 | 2 | 3 | null) {
  if (!lastActiveDate || step === null) return null;
  return addDays(lastActiveDate, REMINDER_SCHEDULE_DAYS[step - 1]).toISOString();
}

function buildInterventionProfile(input: {
  summary: any;
  abilityProfile: any;
  recentActivities: RecentActivity[];
  tests: any[];
  progressRecord: any;
}) {
  const { summary, abilityProfile, recentActivities, tests, progressRecord } = input;
  const now = new Date();
  const lastActiveDate = toDate(summary.lastActive);
  const daysSinceLastActive = lastActiveDate
    ? daysBetweenDates(lastActiveDate, now)
    : null;
  const daysUntilLearningPathDeletion =
    daysSinceLastActive === null
      ? null
      : Math.max(0, LEARNING_PATH_DELETION_RISK_DAYS - daysSinceLastActive);
  const recommendedReminderStep = getRecommendedReminderStep(daysSinceLastActive);
  const nextReminderEligibleAt = getNextReminderEligibleAt(
    lastActiveDate,
    recommendedReminderStep
  );
  const latestAssessmentDate = getLatestTestDate(tests);
  const daysSinceLastAssessment = latestAssessmentDate
    ? daysBetweenDates(latestAssessmentDate, now)
    : null;
  const recentLearningActivities = recentActivities.filter((activity) =>
    ["activity_completed", "stage_completed", "cycle_completed"].includes(activity.type)
  );
  const decliningSkills = (abilityProfile.skills ?? []).filter(
    (skill: any) => skill.trend === "declining"
  );
  const plateauSkills = (abilityProfile.skills ?? []).filter(
    (skill: any) => skill.status === "weak" && skill.trend === "stable"
  );
  const history = abilityProfile.history ?? [];
  const latestHistory = history[history.length - 1];
  const previousHistory = history[history.length - 2];
  const latestAvg = latestHistory ? averageAbility(latestHistory.parts ?? []) : 0;
  const previousAvg = previousHistory ? averageAbility(previousHistory.parts ?? []) : 0;

  const riskFlags = new Set<string>();
  if (summary.status === "inactive" || summary.status === "at_risk") {
    riskFlags.add("inactive");
  }
  if (daysSinceLastActive === null || daysSinceLastActive >= AT_RISK_DAYS) {
    riskFlags.add("low_engagement");
  }
  if (!latestAssessmentDate || (daysSinceLastAssessment ?? 0) >= 21) {
    riskFlags.add("no_recent_assessment");
  }
  if (
    recentLearningActivities.length >= 3 &&
    history.length >= 2 &&
    latestAvg <= previousAvg + 2
  ) {
    riskFlags.add("studying_without_score_gain");
  }
  if (plateauSkills.length > 0) riskFlags.add("skill_plateau");
  if (decliningSkills.length > 0) riskFlags.add("declining_skill");

  const recommendedActions: Array<{
    type: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
  }> = [];

  if (riskFlags.has("low_engagement")) {
    const inactiveDaysText =
      daysSinceLastActive === null ? "nhiá»u" : String(daysSinceLastActive);
    const deletionText =
      daysUntilLearningPathDeletion === null
        ? "chÆ°a xÃ¡c Ä‘á»‹nh"
        : `${daysUntilLearningPathDeletion} ngÃ y`;
    recommendedActions.push({
      type: "send_reminder",
      title: "Gá»­i nháº¯c há»c",
      description: `Há»c viÃªn Ä‘Ã£ ngÆ°ng há»c ${inactiveDaysText} ngÃ y, cÃ²n ${deletionText} trÆ°á»›c má»‘c xÃ³a lá»™ trÃ¬nh.`,
      priority: "high",
    });
  }
  if (riskFlags.has("no_recent_assessment")) {
    recommendedActions.push({
      type: "request_assessment",
      title: "YÃªu cáº§u lÃ m bÃ i Ä‘Ã¡nh giÃ¡",
      description: "Cáº§n Mini Test hoáº·c Full Test má»›i Ä‘á»ƒ IRT cáº­p nháº­t nÄƒng lá»±c vÃ  roadmap.",
      priority: "high",
    });
  }
  if (riskFlags.has("studying_without_score_gain")) {
    recommendedActions.push({
      type: "coach_review_method",
      title: "TÆ° váº¥n cÃ¡ch review lá»—i",
      description: "CÃ³ há»c nhÆ°ng checkpoint chÆ°a cáº£i thiá»‡n; nháº¯c há»c viÃªn review lá»—i vÃ  lÃ m láº¡i cÃ¢u sai.",
      priority: "medium",
    });
  }
  if (riskFlags.has("skill_plateau") || riskFlags.has("declining_skill")) {
    recommendedActions.push({
      type: "mark_needs_support",
      title: "ÄÃ¡nh dáº¥u cáº§n há»— trá»£",
      description: "Skill yáº¿u chÆ°a cáº£i thiá»‡n hoáº·c cÃ³ dáº¥u hiá»‡u giáº£m qua nhiá»u checkpoint; cÃ¢n nháº¯c há»— trá»£ 1-1.",
      priority: "medium",
    });
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push({
      type: "continue_monitoring",
      title: "Tiáº¿p tá»¥c theo dÃµi",
      description: "Há»c viÃªn chÆ°a cÃ³ tÃ­n hiá»‡u rá»§i ro rÃµ; theo dÃµi sau checkpoint tiáº¿p theo.",
      priority: "low",
    });
  }

  return {
    engagement: {
      lastActive: summary.lastActive,
      daysSinceLastActive,
      streakDays: summary.studyStreak || 0,
      completedStages: summary.completedLessons || 0,
      recentLearningActivityCount: recentLearningActivities.length,
      totalStudyTime: summary.totalStudyTime || 0,
      daysUntilLearningPathDeletion,
      learningPathDeletionRiskAtDays: LEARNING_PATH_DELETION_RISK_DAYS,
      nextReminderEligibleAt,
      recommendedReminderStep,
    },
    assessment: {
      latestAssessmentAt: latestAssessmentDate ? latestAssessmentDate.toISOString() : null,
      daysSinceLastAssessment,
      latestScore: tests[0]?.score ?? summary.currentScore ?? 0,
      scoreSource: summary.scoreSource || "",
      needsAssessment: riskFlags.has("no_recent_assessment"),
    },
    riskFlags: Array.from(riskFlags),
    recommendedActions,
    notes:
      progressRecord?.notes?.join(", ") ||
      "CTV nÃªn theo dÃµi má»©c Ä‘á»™ há»c, checkpoint IRT vÃ  skill yáº¿u trÆ°á»›c khi can thiá»‡p.",
  };
}

async function buildStudentSnapshot(user: any) {
  const learningPath = await getLatestLearningPath(user._id);
  const progressRecord = await getLatestUserProgress(user._id, learningPath?._id);
  const progress = await buildProgressSnapshot(user._id, learningPath);
  const score = await getScoreSnapshot(user._id, learningPath);
  const lastActive = await getLastActiveSnapshot(user, progressRecord);
  const status = deriveStudentStatus({
    progress,
    lastActive,
    persistedStatus: progressRecord?.status,
  });

  return {
    id: String(user._id),
    learningPathId: learningPath?._id ? String(learningPath._id) : null,
    name: user?.profile?.fullname || "ChÆ°a cÃ³ tÃªn",
    email: user?.email || "",
    phone: user?.profile?.phone || user?.phone || "",
    avatar: user?.profile?.avatar || "",
    status,
    enrollDate: toDate(user?.created_at)?.toISOString() || "",
    lastActive: lastActive.date ? lastActive.date.toISOString() : null,
    lastActiveSource: lastActive.source,
    currentLevel: learningPath?.level || "",
    targetScore: learningPath?.target_score || progressRecord?.target_score || 0,
    currentScore: score.score,
    scoreSource: score.source,
    estimatedScore: score.estimatedScore,
    estimatedListeningScore: score.estimatedListeningScore,
    estimatedReadingScore: score.estimatedReadingScore,
    scoreAbilityCoverage: score.scoreAbilityCoverage,
    missingAbilityParts: score.missingAbilityParts ?? [],
    learningPath: learningPath ? String(learningPath.level || "standard").toLowerCase() : "",
    completedLessons: progress.completedLessons,
    totalLessons: progress.totalLessons,
    completionRate: progress.completionRate,
    progressUnit: progress.progressUnit,
    progressScope: progress.progressScope,
    currentCycleNo: progress.currentCycleNo,
    totalCycles: progress.totalCycles,
    completedCycles: progress.completedCycles,
    currentCycleProgress: progress.currentCycleProgress,
    progressUpdatedAt: toDate(progressRecord?.updated_at)?.toISOString() || null,
    studyStreak: progressRecord?.streak_days || user?.streak_days || 0,
    totalStudyTime: progressRecord?.total_study_time || 0,
    assignedMentor: progressRecord?.mentor_id ? String(progressRecord.mentor_id) : "ChÆ°a phÃ¢n cÃ´ng",
    tags: [],
  };
}

export const getStudentsService = async (
  page: number,
  limit: number,
  search: string,
  status: string,
  targetScore: number,
  mentorId: string
) => {
  const groupDoc = await GroupUser.findOne({ mentor_id: mentorId }).lean();
  if (!groupDoc?.students?.length) {
    return {
      items: [],
      total: 0,
      pageCount: 0,
    };
  }

  const userMatch: any = { _id: { $in: groupDoc.students } };
  if (search) {
    userMatch.$or = [
      { "profile.fullname": { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(userMatch)
    .sort({ created_at: -1, _id: -1 })
    .lean();

  const snapshots = await Promise.all(users.map((user: any) => buildStudentSnapshot(user)));
  const filtered = snapshots.filter((student) => {
    if (status && status !== "all" && student.status !== status) return false;
    if (targetScore > 0 && student.targetScore < targetScore) return false;
    return true;
  });

  const safePage = Math.max(page || 1, 1);
  const safeLimit = Math.max(limit || 10, 1);
  const skip = (safePage - 1) * safeLimit;

  return {
    items: filtered.slice(skip, skip + safeLimit),
    total: filtered.length,
    pageCount: Math.ceil(filtered.length / safeLimit),
  };
};

export const getStudentDetailService = async (id: string, collaboratorId?: string) => {
  const user = await User.findById(id).lean();
  if (!user) return null;
  if (collaboratorId) {
    await assertCollaboratorCanManageStudent(collaboratorId, user._id);
  }

  const summary = await buildStudentSnapshot(user);
  const learningPath: any = await getLatestLearningPath(user._id);
  const progressRecord: any = await getLatestUserProgress(user._id, learningPath?._id);
  const userIdValues = userIdQueryValues(user._id);

  const focusTitle = `${learningPath?.title || learningPath?.level || ""}`.toLowerCase();
  const learningPathConfig = {
    lessonsPerWeek: learningPath?.days_per_week || 3,
    hoursPerDay: learningPath?.time_per_day || 1,
    focusAreas:
      focusTitle.includes("vocab") || focusTitle.includes("grammar")
        ? ["Vocabulary", "Grammar"]
        : ["Listening", "Reading"],
    startDate: toDate(user?.created_at)?.toISOString().split("T")[0] || "",
    targetDate:
      toDate(learningPath?.target_completion_date)?.toISOString().split("T")[0] || "",
  };

  const [progressDocs, activities, tests] = await Promise.all([
    UserProgress.find({ user_id: user._id })
      .sort({ updated_at: 1, _id: 1 })
      .lean(),
    UserActivity.find({
      user_id: user._id,
      $or: [
        {
          type: {
            $in: [
              "DAY_STUDY_COMPLETED",
              "WEEK_STUDY_COMPLETED",
              "LEARNING_ACTIVITY_COMPLETED",
              "ADJUSTMENT_REQUEST_CREATED",
              "ADJUSTMENT_REQUEST_APPROVED",
              "ADJUSTMENT_REQUEST_REJECTED",
            ],
          },
        },
        { type: "OTHER", "metadata.type": "STREAK_MILESTONE" },
      ],
    })
      .sort({ timestamp: -1, _id: -1 })
      .limit(10)
      .lean(),
    UserTest.find({ user_id: { $in: userIdValues } })
      .populate("test_id", "title type topic")
      .sort({ submit_at: -1, _id: -1 })
      .limit(5)
      .lean(),
  ]);

  const progressHistory = progressDocs.map((progress: any) => {
    const date = toDate(progress.updated_at);
    return {
      date: date ? date.toISOString().split("T")[0] : "",
      listening: progress.listening_score || 0,
      reading: progress.reading_score || 0,
      vocabulary: progress.vocabulary_score || 0,
      grammar: progress.grammar_score || 0,
    };
  });

  const recentActivities = [
    ...activities.map(normalizeUserActivity),
    ...tests.map(normalizeUserTestActivity),
  ]
    .filter((activity): activity is RecentActivity => Boolean(activity))
    .sort(
      (a, b) =>
        (toDate(b.timestamp)?.getTime() || 0) -
        (toDate(a.timestamp)?.getTime() || 0)
    )
    .slice(0, 8);
  const abilityProfile = await buildAbilityProfile(user._id, learningPath);
  const interventionProfile = buildInterventionProfile({
    summary,
    abilityProfile,
    recentActivities,
    tests,
    progressRecord,
  });
  const careProfile = await buildCareProfile({
    studentId: String(user._id),
    collaboratorId,
    learningPathId: learningPath?._id ? String(learningPath._id) : null,
    summary,
    abilityProfile,
    interventionProfile,
  });

  return {
    ...summary,
    learningPathConfig,
    progressHistory,
    recentActivities,
    abilityProfile,
    interventionProfile,
    careProfile,
    notes:
      progressRecord?.notes?.join(", ") ||
      "Há»c viÃªn Ä‘ang trong tiáº¿n trÃ¬nh há»c táº­p, cáº§n theo dÃµi thÃªm.",
  };
};

export const getGroupReportsService = async () => {
  const groups = await GroupUser.find().populate("mentor_id").lean();

  return groups.map((group: any) => {
    const mentor = group.mentor_id as any;
    const total = group.students?.length || 0;
    const active = group.active_students || 0;
    const completionRate = total ? Math.round((active / total) * 100) : 0;

    return {
      groupName: group.name || "NhÃ³m há»c viÃªn",
      mentorName: mentor?.profile?.fullname || "ChÆ°a phÃ¢n cÃ´ng",
      totalStudents: total,
      activeStudents: active,
      averageProgress: group.average_progress || 0,
      averageScore: group.average_score || 0,
      completionRate,
    };
  });
};

