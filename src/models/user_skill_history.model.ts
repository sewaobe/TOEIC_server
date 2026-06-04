import { Schema, model, Document, Types } from "mongoose";
import { UserSkillAbilityStatus, UserSkillAbsoluteAbilityLevel, UserSkillContextType, UserSkillGroup, UserSkillHistoryTriggerType } from "../types/user_skill.type";

export interface IUserSkillHistoryPart {
  part_type: number;
  ability: number;
  status: UserSkillAbilityStatus;
  absolute_level: UserSkillAbsoluteAbilityLevel;
  item_count: number;
  correct_count: number;
}

export interface IUserSkillHistorySkill {
  skill_key: string;
  label_vi?: string;
  part_type?: number;
  skill_group?: UserSkillGroup;
  ability: number;
  status: UserSkillAbilityStatus;
  absolute_level: UserSkillAbsoluteAbilityLevel;
  item_count: number;
  correct_count: number;
}

/**
 * UserSkillHistory là log năng lực theo từng lần submit test.
 * Lưu tín hiệu ability 0..1 do Layer 2 tạo tại thời điểm đó, chưa phải snapshot đã gộp.
 */
export interface IUserSkillHistory extends Document {
  user_id: Types.ObjectId;
  context_type: UserSkillContextType;
  learning_path_id?: Types.ObjectId | null;
  source_user_test_id?: Types.ObjectId | null;
  source_test_id?: Types.ObjectId | null;
  trigger_type: UserSkillHistoryTriggerType;
  parts: IUserSkillHistoryPart[];
  skills: IUserSkillHistorySkill[];
  submitted_at?: Date;
  created_at: Date;
}

const abilityStatusValues: UserSkillAbilityStatus[] = [
  "weak",
  "medium",
  "strong",
];

const absoluteAbilityLevelValues: UserSkillAbsoluteAbilityLevel[] = [
  "very_low",
  "low",
  "medium",
  "high",
];

const skillGroupValues: UserSkillGroup[] = ["basic", "core", "advanced"];

const UserSkillHistoryPartSchema = new Schema<IUserSkillHistoryPart>(
  {
    part_type: { type: Number, required: true, min: 1, max: 7 },
    ability: { type: Number, required: true, min: 0, max: 1 },
    status: {
      type: String,
      enum: abilityStatusValues,
      required: true,
    },
    absolute_level: {
      type: String,
      enum: absoluteAbilityLevelValues,
      required: true,
    },
    item_count: { type: Number, default: 0, min: 0 },
    correct_count: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const UserSkillHistorySkillSchema = new Schema<IUserSkillHistorySkill>(
  {
    skill_key: { type: String, required: true },
    label_vi: { type: String },
    part_type: { type: Number, min: 1, max: 7 },
    skill_group: {
      type: String,
      enum: skillGroupValues,
    },
    ability: { type: Number, required: true, min: 0, max: 1 },
    status: {
      type: String,
      enum: abilityStatusValues,
      required: true,
    },
    absolute_level: {
      type: String,
      enum: absoluteAbilityLevelValues,
      required: true,
    },
    item_count: { type: Number, default: 0, min: 0 },
    correct_count: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const UserSkillHistorySchema = new Schema<IUserSkillHistory>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    context_type: {
      type: String,
      enum: ["learning_path", "free_practice"],
      required: true,
    },
    // Optional vì ability có thể đến từ learning path hoặc free practice.
    learning_path_id: {
      type: Schema.Types.ObjectId,
      ref: "LearningPath",
      default: null,
    },
    source_user_test_id: {
      type: Schema.Types.ObjectId,
      ref: "UserTest",
      default: null,
    },
    source_test_id: {
      type: Schema.Types.ObjectId,
      ref: "Test",
      default: null,
    },
    trigger_type: {
      type: String,
      enum: [
        "initial_generation",
        "full_test_review",
        "mini_test_completion",
        "free_practice",
      ],
      required: true,
    },
    parts: { type: [UserSkillHistoryPartSchema], default: [] },
    skills: { type: [UserSkillHistorySkillSchema], default: [] },
    submitted_at: { type: Date },
    created_at: { type: Date, default: Date.now },
  },
  {
    collection: "user_skill_histories",
  }
);

// free_practice để dành cho sau; logic v2 hiện tại tập trung learning_path.
UserSkillHistorySchema.index({
  user_id: 1,
  context_type: 1,
  learning_path_id: 1,
  created_at: -1,
});

UserSkillHistorySchema.index({ user_id: 1, source_user_test_id: 1 });
UserSkillHistorySchema.index({
  user_id: 1,
  "parts.part_type": 1,
  created_at: -1,
});
UserSkillHistorySchema.index({
  user_id: 1,
  "skills.skill_key": 1,
  created_at: -1,
});

export const UserSkillHistory = model<IUserSkillHistory>(
  "UserSkillHistory",
  UserSkillHistorySchema
);
