import type { AbilityProfileV2 } from "../types/learning_path_v2/layer2_ability_profile.types";
import type {
  UserSkillContextType,
  UserSkillHistoryTriggerType,
} from "../types/user_skill.type";
import {
  IUserSkillHistory,
  UserSkillHistory,
} from "../models/user_skill_history.model";

export interface CreateUserSkillHistoryInput {
  user_id: string;
  context_type: UserSkillContextType;
  learning_path_id?: string | null;
  source_user_test_id?: string | null;
  source_test_id?: string | null;
  trigger_type: UserSkillHistoryTriggerType;
  ability_profile: AbilityProfileV2;
  submitted_at?: Date;
}

export interface GetRecentUserSkillHistoriesInput {
  user_id: string;
  context_type: UserSkillContextType;
  learning_path_id?: string | null;
  limit?: number;
}

/**
 * UserSkillHistory là log tín hiệu ability từng lần submit.
 * Hàm này chỉ chuyển output Layer 2 sang document history, không gộp EWMA và không cập nhật snapshot.
 */
export const createUserSkillHistory = async (
  input: CreateUserSkillHistoryInput
): Promise<IUserSkillHistory> => {
  return UserSkillHistory.create({
    user_id: input.user_id,
    context_type: input.context_type,
    learning_path_id: input.learning_path_id ?? null,
    source_user_test_id: input.source_user_test_id ?? null,
    source_test_id: input.source_test_id ?? null,
    trigger_type: input.trigger_type,
    parts: input.ability_profile.part_abilities.map((part) => ({
      part_type: part.part_type,
      ability: part.ability,
      status: part.status,
      absolute_level: part.absolute_level,
      item_count: part.item_count,
      correct_count: part.correct_count,
    })),
    skills: input.ability_profile.skill_abilities.map((skill) => ({
      skill_key: skill.skill_key,
      label_vi: (skill as { label_vi?: string }).label_vi,
      part_type: skill.part_type,
      skill_group: skill.skill_group,
      ability: skill.ability,
      status: skill.status,
      absolute_level: skill.absolute_level,
      item_count: skill.item_count,
      correct_count: skill.correct_count,
    })),
    submitted_at: input.submitted_at,
  });
};

/**
 * Lấy vài history gần nhất cho cùng user/context/path để service snapshot tính xu hướng.
 * free_practice có field sẵn nhưng logic hiện tại vẫn tập trung learning_path.
 */
export const getRecentUserSkillHistories = async (
  input: GetRecentUserSkillHistoriesInput
): Promise<IUserSkillHistory[]> => {
  const limit = input.limit ?? 5;

  return UserSkillHistory.find({
    user_id: input.user_id,
    context_type: input.context_type,
    learning_path_id: input.learning_path_id ?? null,
  })
    .sort({ submitted_at: -1, created_at: -1 })
    .limit(limit)
    .lean<IUserSkillHistory[]>();
};
