import type {
  AbilityStatus,
  AbsoluteAbilityLevel,
} from "../../models";
import { calculateThetaRaschV2 } from "../irt.service";
import type {
  AbilityProfileV2,
  BuildAbilityProfileInput,
  PartAbilityV2,
  SkillAbilityV2,
} from "../../types/learning_path_v2";
import type {
  NormalizedTestAnswerV2,
  ToeicSkillGroupV2,
} from "../../types/learning_path_v2";
import { logLearningPathV2DebugSafe } from "./learning_path_v2_debug_logger";

type RaschItemWithMetadata = {
  question_id: string;
  is_correct: boolean;
  irt_difficulty: number;
  answer: NormalizedTestAnswerV2;
};

type SkillMetadata = {
  part_type?: number;
  skill_group?: ToeicSkillGroupV2;
};

// Quy đổi điểm ability 0..1 sang mức dễ hiểu để Layer 3/4 đọc tiếp.
const getAbsoluteLevel = (ability: number): AbsoluteAbilityLevel => {
  if (ability < 0.25) return "very_low";
  if (ability < 0.5) return "low";
  if (ability < 0.75) return "medium";
  return "high";
};

// Khi không đủ dữ liệu để so sánh tương đối, dùng mức tuyệt đối làm fallback.
const getStatusFromAbsoluteLevel = (
  absoluteLevel: AbsoluteAbilityLevel
): AbilityStatus => {
  if (absoluteLevel === "very_low" || absoluteLevel === "low") return "weak";
  if (absoluteLevel === "medium") return "medium";
  return "strong";
};

const groupByPartType = (
  items: RaschItemWithMetadata[]
): Map<number, RaschItemWithMetadata[]> => {
  // Part ability chỉ tính cho câu đã biết part_type từ Layer 1.
  const groups = new Map<number, RaschItemWithMetadata[]>();
  for (const item of items) {
    const partType = item.answer.part_type;
    if (partType === undefined) continue;
    groups.set(partType, [...(groups.get(partType) ?? []), item]);
  }
  return groups;
};

const getSkillMetadata = (
  answer: NormalizedTestAnswerV2,
  skillKey: string
): SkillMetadata => {
  // Ưu tiên metadata skill đã normalize; nếu thiếu thì fallback part_type của answer.
  const skill = answer.skills?.find((item) => item.key === skillKey);
  return {
    part_type: skill?.part_type ?? answer.part_type,
    skill_group: skill?.skill_group,
  };
};

const groupBySkillKey = (
  items: RaschItemWithMetadata[]
): Map<string, { items: RaschItemWithMetadata[]; metadata: SkillMetadata }> => {
  // Một câu có thể thuộc nhiều skill, nên cùng một response được tính vào nhiều nhóm skill.
  const groups = new Map<
    string,
    { items: RaschItemWithMetadata[]; metadata: SkillMetadata }
  >();

  for (const item of items) {
    const skillKeys = item.answer.skill_keys ?? [];
    for (const skillKey of skillKeys) {
      const existing = groups.get(skillKey);
      if (existing) {
        existing.items.push(item);
        continue;
      }

      groups.set(skillKey, {
        items: [item],
        metadata: getSkillMetadata(item.answer, skillKey),
      });
    }
  }

  return groups;
};

const assignRelativePartStatus = (partAbilities: PartAbilityV2[]): void => {
  // Status part có 2 kiểu: đủ 7 part thì relative 3/2/2, thiếu part thì theo absolute_level.
  if (partAbilities.length !== 7) {
    for (const partAbility of partAbilities) {
      partAbility.status = getStatusFromAbsoluteLevel(partAbility.absolute_level);
    }
    return;
  }

  const sorted = [...partAbilities].sort((a, b) => a.ability - b.ability);
  sorted.forEach((partAbility, index) => {
    if (index < 3) partAbility.status = "weak";
    else if (index < 5) partAbility.status = "medium";
    else partAbility.status = "strong";
  });
};

const assignRelativeSkillStatus = (skillAbilities: SkillAbilityV2[]): void => {
  // Ít skill thì so với thang tuyệt đối; nhiều skill thì chia nhóm yếu/vừa/mạnh tương đối.
  if (skillAbilities.length < 3) {
    for (const skillAbility of skillAbilities) {
      skillAbility.status = getStatusFromAbsoluteLevel(skillAbility.absolute_level);
    }
    return;
  }

  const sorted = [...skillAbilities].sort((a, b) => a.ability - b.ability);
  const weakCount = Math.max(1, Math.floor(sorted.length * 0.4));
  const mediumCount = Math.max(1, Math.floor(sorted.length * 0.3));

  sorted.forEach((skillAbility, index) => {
    if (index < weakCount) skillAbility.status = "weak";
    else if (index < weakCount + mediumCount) skillAbility.status = "medium";
    else skillAbility.status = "strong";
  });
};

const buildRaschItems = (
  answers: NormalizedTestAnswerV2[]
): {
  items: RaschItemWithMetadata[];
  missingIrtDifficultyCount: number;
} => {
  // Layer 2 chỉ lấy các item đủ dữ liệu Rasch: đúng/sai và độ khó câu hỏi.
  const items: RaschItemWithMetadata[] = [];
  let missingIrtDifficultyCount = 0;

  for (const answer of answers) {
    if (answer.irt_difficulty === undefined) {
      missingIrtDifficultyCount += 1;
      continue;
    }
    if (typeof answer.is_correct !== "boolean") continue;

    items.push({
      question_id: answer.question_id,
      is_correct: answer.is_correct,
      irt_difficulty: answer.irt_difficulty,
      answer,
    });
  }

  return { items, missingIrtDifficultyCount };
};

const buildPartAbilities = (
  items: RaschItemWithMetadata[]
): {
  partAbilities: PartAbilityV2[];
  missingPartTypeCount: number;
} => {
  // Không dùng part_results ở đây; part_results chỉ là summary accuracy từ bài test.
  const missingPartTypeCount = items.filter(
    (item) => item.answer.part_type === undefined
  ).length;
  const partAbilities = [...groupByPartType(items).entries()]
    .map(([partType, partItems]) => {
      // Ability public dùng scale 0..1 để khớp các layer phía sau.
      const result = calculateThetaRaschV2(partItems);
      const absoluteLevel = getAbsoluteLevel(result.ability);

      return {
        part_type: partType,
        ability: result.ability,
        status: getStatusFromAbsoluteLevel(absoluteLevel),
        absolute_level: absoluteLevel,
        item_count: result.item_count,
        correct_count: result.correct_count,
      };
    })
    .sort((a, b) => a.part_type - b.part_type);

  assignRelativePartStatus(partAbilities);
  return { partAbilities, missingPartTypeCount };
};

const buildSkillAbilities = (
  items: RaschItemWithMetadata[]
): {
  skillAbilities: SkillAbilityV2[];
  missingSkillKeysCount: number;
} => {
  // Skill chưa map được ở Layer 1 sẽ không có skill_keys, nên bỏ qua ở Layer 2.
  const missingSkillKeysCount = items.filter(
    (item) => !item.answer.skill_keys || item.answer.skill_keys.length === 0
  ).length;
  const skillAbilities = [...groupBySkillKey(items).entries()]
    .map(([skillKey, group]) => {
      // Rasch 1PL dùng irt_difficulty, không dùng discrimination hay 2PL ở checkpoint này.
      const result = calculateThetaRaschV2(group.items);
      const absoluteLevel = getAbsoluteLevel(result.ability);

      return {
        skill_key: skillKey,
        part_type: group.metadata.part_type,
        skill_group: group.metadata.skill_group,
        ability: result.ability,
        status: getStatusFromAbsoluteLevel(absoluteLevel),
        absolute_level: absoluteLevel,
        item_count: result.item_count,
        correct_count: result.correct_count,
      };
    })
    .sort((a, b) => a.skill_key.localeCompare(b.skill_key));

  assignRelativeSkillStatus(skillAbilities);
  return { skillAbilities, missingSkillKeysCount };
};

export const buildAbilityProfile = async (
  input: BuildAbilityProfileInput
): Promise<AbilityProfileV2> => {
  // Layer 2 tính ability profile, không chọn strategy và không tạo plan.
  // part_results chỉ là summary, không dùng làm ability.
  const { normalized_result: normalizedResult } = input;
  const warnings: string[] = [];
  const { items, missingIrtDifficultyCount } = buildRaschItems(
    normalizedResult.answers
  );

  logLearningPathV2DebugSafe("layer2.rasch_items", {
    stage: "layer2",
    user_id: normalizedResult.user_id,
    trigger_type: normalizedResult.trigger_type,
    test_id: normalizedResult.test_id,
    source_test_result_id: normalizedResult.test_result_id,
    normalized_answers_count: normalizedResult.answers.length,
    valid_rasch_items_count: items.length,
    missing_irt_difficulty_count: missingIrtDifficultyCount,
    sample_items: items.slice(0, 3).map((item) => ({
      question_id: item.question_id,
      is_correct: item.is_correct,
      irt_difficulty: item.irt_difficulty,
      part_type: item.answer.part_type,
      skill_keys: item.answer.skill_keys?.slice(0, 5) ?? [],
    })),
  });

  if (missingIrtDifficultyCount > 0) {
    warnings.push(
      `Skipped ${missingIrtDifficultyCount} items missing irt_difficulty.`
    );
  }
  if (items.length === 0) {
    // Không có item Rasch hợp lệ thì Layer 3/4 không nên chạy tiếp với dữ liệu rỗng.
    throw new Error("No valid Rasch item responses for ability calculation");
  }

  // Tách kết quả theo hai góc nhìn: TOEIC Part và kỹ năng nhỏ trong từng câu.
  const { partAbilities, missingPartTypeCount } = buildPartAbilities(items);
  const { skillAbilities, missingSkillKeysCount } = buildSkillAbilities(items);
  if (missingPartTypeCount > 0) {
    warnings.push(`Skipped ${missingPartTypeCount} items missing part_type.`);
  }
  if (missingSkillKeysCount > 0) {
    warnings.push(`Skipped ${missingSkillKeysCount} items missing skill_keys.`);
  }

  logLearningPathV2DebugSafe("layer2.ability_profile", {
    stage: "layer2",
    user_id: normalizedResult.user_id,
    trigger_type: normalizedResult.trigger_type,
    test_id: normalizedResult.test_id,
    source_test_result_id: normalizedResult.test_result_id,
    part_abilities_count: partAbilities.length,
    skill_abilities_count: skillAbilities.length,
    missing_part_type_count: missingPartTypeCount,
    missing_skill_keys_count: missingSkillKeysCount,
    part_abilities: partAbilities.map((part) => ({
      part_type: part.part_type,
      ability: part.ability,
      status: part.status,
      item_count: part.item_count,
      correct_count: part.correct_count,
    })),
    weak_skill_keys_sample: skillAbilities
      .filter((skill) => skill.status === "weak")
      .slice(0, 10)
      .map((skill) => skill.skill_key),
    warnings,
  });

  return {
    trigger_type: normalizedResult.trigger_type,
    source_test_result_id: normalizedResult.test_result_id,
    part_abilities: partAbilities,
    skill_abilities: skillAbilities,
    notes: [
      "Ability values use public 0..1 scale for LessonManager compatibility.",
    ],
    warnings,
  };
};
