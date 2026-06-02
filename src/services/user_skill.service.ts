import { Types } from "mongoose";
import {
  IUserSkill,
  IUserSkillItem,
  IUserSkillPart,
  UserSkill,
} from "../models/user_skill.model";
import {
  IUserSkillHistory,
  IUserSkillHistoryPart,
  IUserSkillHistorySkill,
} from "../models/user_skill_history.model";
import type {
  UserSkillAbsoluteAbilityLevel,
  UserSkillAbilityStatus,
  UserSkillHistoryTriggerType,
  UserSkillTrend,
} from "../types/user_skill.type";
import { getRecentUserSkillHistories } from "./user_skill_history.service";

export interface CalculateAbilityByEWMAInput {
  previousAbility?: number | null;
  signalAbility: number;
  alpha: number;
}

export interface TrendPoint {
  ability: number;
  submitted_at?: Date;
  created_at?: Date;
}

export interface TrendResult {
  trend: UserSkillTrend;
  trend_slope: number;
  history_count: number;
}

type UserSkillHistoryLike = Pick<
  IUserSkillHistory,
  | "_id"
  | "user_id"
  | "context_type"
  | "learning_path_id"
  | "source_user_test_id"
  | "trigger_type"
  | "parts"
  | "skills"
  | "submitted_at"
  | "created_at"
>;

const clampAbility = (value: number): number => Math.min(1, Math.max(0, value));

const getAlphaByTriggerType = (
  triggerType: UserSkillHistoryTriggerType
): number => {
  switch (triggerType) {
    case "initial_generation":
    case "full_test_review":
      return 0.4;
    case "mini_test_completion":
      return 0.25;
    case "free_practice":
      return 0.15;
    default:
      return 0.25;
  }
};

const getAbsoluteLevelFromAbility = (
  ability: number
): UserSkillAbsoluteAbilityLevel => {
  if (ability < 0.25) {
    return "very_low";
  }

  if (ability < 0.5) {
    return "low";
  }

  if (ability < 0.75) {
    return "medium";
  }

  return "high";
};

const getStatusFromAbsoluteLevel = (
  level: UserSkillAbsoluteAbilityLevel
): UserSkillAbilityStatus => {
  if (level === "high") {
    return "strong";
  }

  if (level === "medium") {
    return "medium";
  }

  return "weak";
};

const toDateValue = (point: TrendPoint): number => {
  return (point.submitted_at ?? point.created_at ?? new Date(0)).getTime();
};

const buildPartTrendPoints = (
  recentHistories: IUserSkillHistory[],
  partType: number
): TrendPoint[] => {
  return recentHistories.reduce<TrendPoint[]>((points, history) => {
    const part = history.parts.find((item) => item.part_type === partType);

    if (part) {
      points.push({
        ability: part.ability,
        submitted_at: history.submitted_at,
        created_at: history.created_at,
      });
    }

    return points;
  }, []);
};

const buildSkillTrendPoints = (
  recentHistories: IUserSkillHistory[],
  skillKey: string
): TrendPoint[] => {
  return recentHistories.reduce<TrendPoint[]>((points, history) => {
    const skill = history.skills.find((item) => item.skill_key === skillKey);

    if (skill) {
      points.push({
        ability: skill.ability,
        submitted_at: history.submitted_at,
        created_at: history.created_at,
      });
    }

    return points;
  }, []);
};

/**
 * EWMA = Exponentially Weighted Moving Average.
 *
 * Công thức:
 * nextAbility = alpha * signalAbility + (1 - alpha) * previousAbility
 *
 * Ý nghĩa:
 * - signalAbility là ability mới từ lần submit hiện tại.
 * - previousAbility là snapshot ability đang lưu trong UserSkill.
 * - alpha càng lớn thì càng tin kết quả test mới.
 *
 * Dùng EWMA để snapshot thay đổi mượt hơn, tránh việc một mini test ngắn
 * làm ability nhảy quá mạnh. Vì full/entry test có dữ liệu rộng hơn nên alpha cao hơn,
 * còn mini test hẹp hơn nên alpha thấp hơn.
 */
export const calculateAbilityByEWMA = (
  input: CalculateAbilityByEWMAInput
): number => {
  if (input.previousAbility === undefined || input.previousAbility === null) {
    return clampAbility(input.signalAbility);
  }

  return clampAbility(
    input.alpha * input.signalAbility + (1 - input.alpha) * input.previousAbility
  );
};

/**
 * Regression slope dùng để đo xu hướng ability qua vài lần submit gần nhất.
 *
 * Cách tính:
 * - Lấy tối đa 5 history gần nhất.
 * - Sắp xếp từ cũ đến mới.
 * - Dùng x = thứ tự lần submit: 0, 1, 2, ...
 * - Dùng y = ability tại lần submit đó.
 * - Fit đường thẳng y = a*x + b, trong đó a chính là trend_slope.
 *
 * Ý nghĩa:
 * - slope > 0.03  => ability đang cải thiện.
 * - slope < -0.03 => ability đang giảm.
 * - còn lại       => tương đối ổn định.
 *
 * Trend không thay thế ability và không dùng để merge snapshot.
 * Nó chỉ là tín hiệu phụ để orchestrator/scheduler biết user đang tiến bộ,
 * đứng yên hay giảm sút theo thời gian.
 */
export const calculateTrendByRegression = (
  points: TrendPoint[]
): TrendResult => {
  const recentPoints = [...points]
    .sort((a, b) => toDateValue(b) - toDateValue(a))
    .slice(0, 5)
    .sort((a, b) => toDateValue(a) - toDateValue(b));

  if (recentPoints.length < 2) {
    return {
      trend: "stable",
      trend_slope: 0,
      history_count: recentPoints.length,
    };
  }

  const n = recentPoints.length;
  const sumX = recentPoints.reduce((sum, _point, index) => sum + index, 0);
  const sumY = recentPoints.reduce((sum, point) => sum + point.ability, 0);
  const sumXY = recentPoints.reduce(
    (sum, point, index) => sum + index * point.ability,
    0
  );
  const sumXX = recentPoints.reduce(
    (sum, _point, index) => sum + index * index,
    0
  );
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;

  if (slope > 0.03) {
    return { trend: "improving", trend_slope: slope, history_count: n };
  }

  if (slope < -0.03) {
    return { trend: "declining", trend_slope: slope, history_count: n };
  }

  return { trend: "stable", trend_slope: slope, history_count: n };
};

const buildUpdatedPart = (
  partSignal: IUserSkillHistoryPart,
  previousPart: IUserSkillPart | undefined,
  history: UserSkillHistoryLike,
  recentHistories: IUserSkillHistory[],
  alpha: number
): IUserSkillPart => {
  const ability = calculateAbilityByEWMA({
    previousAbility: previousPart?.ability,
    signalAbility: partSignal.ability,
    alpha,
  });
  const absoluteLevel = getAbsoluteLevelFromAbility(ability);
  const trend = calculateTrendByRegression(
    buildPartTrendPoints(recentHistories, partSignal.part_type)
  );

  return {
    ...(previousPart ?? { skills: [] }),
    part_type: partSignal.part_type,
    ability,
    absolute_level: absoluteLevel,
    status: getStatusFromAbsoluteLevel(absoluteLevel),
    trend: trend.trend,
    trend_slope: trend.trend_slope,
    history_count: trend.history_count,
    skills: previousPart?.skills ?? [],
    last_evaluated_at: history.submitted_at ?? history.created_at,
    latest_history_id: history._id as Types.ObjectId,
    latest_source_user_test_id: history.source_user_test_id ?? undefined,
  };
};

const buildUpdatedSkill = (
  skillSignal: IUserSkillHistorySkill,
  previousSkill: IUserSkillItem | undefined,
  history: UserSkillHistoryLike,
  recentHistories: IUserSkillHistory[],
  alpha: number
): IUserSkillItem => {
  const ability = calculateAbilityByEWMA({
    previousAbility: previousSkill?.ability,
    signalAbility: skillSignal.ability,
    alpha,
  });
  const absoluteLevel = getAbsoluteLevelFromAbility(ability);
  const trend = calculateTrendByRegression(
    buildSkillTrendPoints(recentHistories, skillSignal.skill_key)
  );

  return {
    ...(previousSkill ?? {}),
    skill_key: skillSignal.skill_key,
    label_vi: skillSignal.label_vi ?? previousSkill?.label_vi,
    skill_group: skillSignal.skill_group ?? previousSkill?.skill_group,
    ability,
    absolute_level: absoluteLevel,
    status: getStatusFromAbsoluteLevel(absoluteLevel),
    trend: trend.trend,
    trend_slope: trend.trend_slope,
    history_count: trend.history_count,
    last_evaluated_at: history.submitted_at ?? history.created_at,
    latest_history_id: history._id as Types.ObjectId,
    latest_source_user_test_id: history.source_user_test_id ?? undefined,
  };
};

const sortSnapshotParts = (parts: IUserSkillPart[]): IUserSkillPart[] => {
  return [...parts]
    .map((part) => ({
      ...part,
      skills: [...(part.skills ?? [])].sort((a, b) =>
        a.skill_key.localeCompare(b.skill_key)
      ),
    }))
    .sort((a, b) => a.part_type - b.part_type);
};

/**
 * UserSkill là snapshot đã tổng hợp, không phải log.
 * Service này nhận một history đã tạo sẵn, gộp ability bằng EWMA và chỉ lưu trend để scheduler đọc sau.
 */
export const updateUserSkillFromHistory = async (
  history: UserSkillHistoryLike
): Promise<IUserSkill> => {
  const learningPathId = history.learning_path_id ?? null;
  const query = {
    user_id: history.user_id,
    context_type: history.context_type,
    learning_path_id: learningPathId,
  };
  const [existingSnapshot, recentHistories] = await Promise.all([
    UserSkill.findOne(query).lean<IUserSkill | null>(),
    getRecentUserSkillHistories({
      user_id: String(history.user_id),
      context_type: history.context_type,
      learning_path_id: learningPathId ? String(learningPathId) : null,
      limit: 5,
    }),
  ]);
  const alpha = getAlphaByTriggerType(history.trigger_type);
  const partsByType = new Map<number, IUserSkillPart>();

  for (const existingPart of existingSnapshot?.parts ?? []) {
    partsByType.set(existingPart.part_type, {
      ...existingPart,
      skills: [...(existingPart.skills ?? [])],
    });
  }

  for (const partSignal of history.parts) {
    partsByType.set(
      partSignal.part_type,
      buildUpdatedPart(
        partSignal,
        partsByType.get(partSignal.part_type),
        history,
        recentHistories,
        alpha
      )
    );
  }

  for (const skillSignal of history.skills) {
    if (!skillSignal.part_type) {
      continue;
    }

    const part =
      partsByType.get(skillSignal.part_type) ??
      buildUpdatedPart(
        {
          part_type: skillSignal.part_type,
          ability: skillSignal.ability,
          status: skillSignal.status,
          absolute_level: skillSignal.absolute_level,
          item_count: skillSignal.item_count,
          correct_count: skillSignal.correct_count,
        },
        undefined,
        history,
        recentHistories,
        alpha
      );
    const skillsByKey = new Map<string, IUserSkillItem>();

    for (const existingSkill of part.skills ?? []) {
      skillsByKey.set(existingSkill.skill_key, existingSkill);
    }

    skillsByKey.set(
      skillSignal.skill_key,
      buildUpdatedSkill(
        skillSignal,
        skillsByKey.get(skillSignal.skill_key),
        history,
        recentHistories,
        alpha
      )
    );

    partsByType.set(skillSignal.part_type, {
      ...part,
      skills: Array.from(skillsByKey.values()),
    });
  }

  const lastEvaluatedAt = history.submitted_at ?? history.created_at;

  const updatedSnapshot = await UserSkill.findOneAndUpdate(
    query,
    {
      $set: {
        user_id: history.user_id,
        context_type: history.context_type,
        learning_path_id: learningPathId,
        parts: sortSnapshotParts(Array.from(partsByType.values())),
        latest_history_id: history._id,
        latest_source_user_test_id: history.source_user_test_id,
        last_evaluated_at: lastEvaluatedAt,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  if (!updatedSnapshot) {
    throw new Error("Không thể cập nhật snapshot UserSkill.");
  }

  return updatedSnapshot;
};
