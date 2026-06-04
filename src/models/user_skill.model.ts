import { Schema, model, Document, Types } from "mongoose";
import { UserSkillAbilityStatus, UserSkillAbsoluteAbilityLevel, UserSkillContextType, UserSkillGroup, UserSkillTrend } from "../types/user_skill.type";

export interface IUserSkillItem {
  skill_key: string;
  label_vi?: string;
  skill_group?: UserSkillGroup;
  ability: number;
  status: UserSkillAbilityStatus;
  absolute_level: UserSkillAbsoluteAbilityLevel;
  trend?: UserSkillTrend;
  trend_slope?: number;
  history_count?: number;
  last_evaluated_at?: Date;
  latest_history_id?: Types.ObjectId;
  latest_source_user_test_id?: Types.ObjectId;
}

export interface IUserSkillPart {
  part_type: number;
  ability: number;
  status: UserSkillAbilityStatus;
  absolute_level: UserSkillAbsoluteAbilityLevel;
  trend?: UserSkillTrend;
  trend_slope?: number;
  history_count?: number;
  skills: IUserSkillItem[];
  last_evaluated_at?: Date;
  latest_history_id?: Types.ObjectId;
  latest_source_user_test_id?: Types.ObjectId;
}

/**
 * UserSkill là snapshot năng lực mới nhất, không phải log.
 * Snapshot này được cập nhật sau từ history bằng EWMA và trend slope.
 */
export interface IUserSkill extends Document {
  user_id: Types.ObjectId;
  context_type: UserSkillContextType;
  learning_path_id?: Types.ObjectId | null;
  parts: IUserSkillPart[];
  latest_history_id?: Types.ObjectId;
  latest_source_user_test_id?: Types.ObjectId;
  last_evaluated_at?: Date;
  created_at: Date;
  updated_at: Date;
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
const trendValues: UserSkillTrend[] = ["improving", "stable", "declining"];

const UserSkillItemSchema = new Schema<IUserSkillItem>(
  {
    skill_key: { type: String, required: true },
    label_vi: { type: String },
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
    // Trend sẽ được tính sau từ history, không phải do Layer 2 ghi trực tiếp.
    trend: {
      type: String,
      enum: trendValues,
    },
    trend_slope: { type: Number },
    history_count: { type: Number, default: 0, min: 0 },
    last_evaluated_at: { type: Date },
    latest_history_id: {
      type: Schema.Types.ObjectId,
      ref: "UserSkillHistory",
    },
    latest_source_user_test_id: {
      type: Schema.Types.ObjectId,
      ref: "UserTest",
    },
  },
  { _id: false }
);

const UserSkillPartSchema = new Schema<IUserSkillPart>(
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
    trend: {
      type: String,
      enum: trendValues,
    },
    trend_slope: { type: Number },
    history_count: { type: Number, default: 0, min: 0 },
    skills: { type: [UserSkillItemSchema], default: [] },
    last_evaluated_at: { type: Date },
    latest_history_id: {
      type: Schema.Types.ObjectId,
      ref: "UserSkillHistory",
    },
    latest_source_user_test_id: {
      type: Schema.Types.ObjectId,
      ref: "UserTest",
    },
  },
  { _id: false }
);

const UserSkillSchema = new Schema<IUserSkill>(
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
    parts: { type: [UserSkillPartSchema], default: [] },
    latest_history_id: {
      type: Schema.Types.ObjectId,
      ref: "UserSkillHistory",
    },
    latest_source_user_test_id: {
      type: Schema.Types.ObjectId,
      ref: "UserTest",
    },
    last_evaluated_at: { type: Date },
  },
  {
    collection: "user_skills",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

// Mỗi user chỉ có một snapshot cho mỗi LearningPath.
// Chỉ áp dụng unique khi context là learning_path và có learning_path_id thật.
UserSkillSchema.index(
  { user_id: 1, context_type: 1, learning_path_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      context_type: "learning_path",
      learning_path_id: { $type: "objectId" },
    },
  }
);

// free_practice để dành cho sau, hiện chỉ tạo index thường để query nhanh.
UserSkillSchema.index({
  user_id: 1,
  context_type: 1,
});

UserSkillSchema.index({ user_id: 1, "parts.part_type": 1 });
UserSkillSchema.index({ user_id: 1, "parts.skills.skill_key": 1 });

export const UserSkill = model<IUserSkill>("UserSkill", UserSkillSchema);
