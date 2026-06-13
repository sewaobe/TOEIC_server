import { Types } from "mongoose";
import { Question } from "../models/question.model";
import { Group } from "../models/group.model";
import { Test } from "../models/test.model";
import { UserSkill } from "../models/user_skill.model";
import type { IUserSkillPart } from "../models/user_skill.model";
import { TestType } from "../models/enums/TestType";
import { TestStatus } from "../models/enums/TestStatus";
import { normalizeToeicSkillTags } from "./toeic_skill.util";

type MiniTestSkillBucket = "focus" | "weak_non_focus" | "strong_retention";

type GenerateLearningPathMiniTestInput = {
  user_id: string;
  learning_path_id: string;
  cycle_no: number;
  focus_part_types: number[];
  focus_skill_keys: string[];
};

type MiniTestQuestionMeta = {
  _id: Types.ObjectId;
  irt_difficulty?: number;
  tags?: string[];
};

type MiniTestGroupCandidate = {
  group: any;
  groupId: Types.ObjectId;
  part: number;
  questionCount: number;
  avgDifficulty: number;
  skillKeys: string[];
  bucketCounts: Record<MiniTestSkillBucket, number>;
};

const PART_QUOTAS_BY_ABILITY_ASC = [40, 35, 25];
const BUCKET_RATIOS: Record<MiniTestSkillBucket, number> = {
  focus: 0.7,
  weak_non_focus: 0.2,
  strong_retention: 0.1,
};

/**
 * Phân bố SỐ CÂU THEO PART (tổng = 100)
 * Tất cả đều là "questions", không phải group.
 * Mình chọn phân bố sao cho Part 3,4 là bội số 3 (3 câu/đoạn).
 */
const BASE_QUESTION_DISTRIBUTION: Record<number, number> = {
  1: 6, // 6 câu (6 ảnh)
  2: 20, // 20 câu hỏi-đáp
  3: 15, // 15 câu = 5 group * 3
  4: 15, // 15 câu = 5 group * 3
  5: 20, // 20 câu
  6: 8, // 8 câu ~ 2 group * 4 (tùy data)
  7: 16, // 16 câu (tuỳ cấu trúc group Part 7 trong DB)
}; // 6+20+15+15+20+9+15 = 100

const buildPartQuestionQuotas = (focusPartCount: number): number[] =>
  PART_QUOTAS_BY_ABILITY_ASC.slice(0, focusPartCount).map(() => 20);

/************************************************************
 * Helper: tính trung bình difficulty & số câu của 1 group
 ************************************************************/
async function computeGroupStats(group: any): Promise<{
  avgDifficulty: number;
  questionCount: number;
}> {
  const questionIds = group.questions as Types.ObjectId[];

  if (!questionIds || questionIds.length === 0) {
    return { avgDifficulty: 0, questionCount: 0 };
  }

  const qs = await Question.find({
    _id: { $in: questionIds },
  })
    .select("_id irt_difficulty")
    .lean();

  if (!qs.length) {
    return { avgDifficulty: 0, questionCount: 0 };
  }

  const sumB = qs.reduce((sum, q: any) => sum + (q.irt_difficulty ?? 0), 0);
  const avgB = sumB / qs.length;

  return {
    avgDifficulty: avgB,
    questionCount: qs.length,
  };
}

/************************************************************
 * Hàm chọn group cho 1 Part theo:
 *  - targetQuestions (số câu)
 *  - thetaPart (độ khó mong muốn)
 *  - Luôn lấy nguyên group (không tách câu)
 *
 * Giải thuật:
 *  1. Lấy tất cả group của Part
 *  2. Tính questionCount + avgDifficulty cho từng group
 *  3. Sort theo |avgDifficulty - thetaPart|
 *  4. Dùng DP subset-sum theo questionCount để tìm tổ hợp
 *     có tổng câu = targetQuestions (ưu tiên group gần θ)
 ************************************************************/
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const abilityToTargetDifficulty = (ability?: number): number => {
  if (typeof ability !== "number" || !Number.isFinite(ability)) {
    return 0;
  }

  return clamp01(ability) * 6 - 3;
};

const toObjectId = (id: string | Types.ObjectId): Types.ObjectId =>
  id instanceof Types.ObjectId ? id : new Types.ObjectId(id);

const uniqueNumbers = (values: number[]): number[] =>
  values.filter(
    (value, index, list) =>
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 7 &&
      list.indexOf(value) === index
  );

const uniqueStrings = (values: string[]): string[] =>
  values.filter(
    (value, index, list) => value.length > 0 && list.indexOf(value) === index
  );

const getPartSkillSets = (
  part: IUserSkillPart,
  focusSkillKeys: Set<string>
): Record<MiniTestSkillBucket, Set<string>> => {
  const weakNonFocus = new Set<string>();
  const strongRetention = new Set<string>();

  for (const skill of part.skills ?? []) {
    if (!skill.skill_key || focusSkillKeys.has(skill.skill_key)) continue;
    if (skill.status === "weak") weakNonFocus.add(skill.skill_key);
    if (skill.status === "strong") strongRetention.add(skill.skill_key);
  }

  return {
    focus: new Set(
      (part.skills ?? [])
        .map((skill) => skill.skill_key)
        .filter((skillKey) => focusSkillKeys.has(skillKey))
    ),
    weak_non_focus: weakNonFocus,
    strong_retention: strongRetention,
  };
};

const calculateBucketTargets = (
  partQuestionTarget: number
): Record<MiniTestSkillBucket, number> => {
  const focus = Math.round(partQuestionTarget * BUCKET_RATIOS.focus);
  const weakNonFocus = Math.round(
    partQuestionTarget * BUCKET_RATIOS.weak_non_focus
  );

  return {
    focus,
    weak_non_focus: weakNonFocus,
    strong_retention: Math.max(0, partQuestionTarget - focus - weakNonFocus),
  };
};

const scoreCandidateForBucket = (
  candidate: MiniTestGroupCandidate,
  bucket: MiniTestSkillBucket,
  targetDifficulty: number
): number => {
  const bucketRatio =
    candidate.questionCount > 0
      ? candidate.bucketCounts[bucket] / candidate.questionCount
      : 0;
  const difficultyPenalty = Math.abs(candidate.avgDifficulty - targetDifficulty);
  const tagCoverageBonus = candidate.skillKeys.length > 0 ? 0.1 : 0;

  return bucketRatio * 100 + tagCoverageBonus - difficultyPenalty * 8;
};

const scoreCandidateForFallback = (
  candidate: MiniTestGroupCandidate,
  targetDifficulty: number
): number => {
  const totalBucketMatches =
    candidate.bucketCounts.focus +
    candidate.bucketCounts.weak_non_focus +
    candidate.bucketCounts.strong_retention;
  const matchRatio =
    candidate.questionCount > 0 ? totalBucketMatches / candidate.questionCount : 0;
  const difficultyPenalty = Math.abs(candidate.avgDifficulty - targetDifficulty);

  return matchRatio * 50 - difficultyPenalty * 8;
};

const chooseCandidate = (input: {
  candidates: MiniTestGroupCandidate[];
  selectedIds: Set<string>;
  currentTotal: number;
  targetTotal: number;
  bucket?: MiniTestSkillBucket;
  targetDifficulty: number;
}): MiniTestGroupCandidate | null => {
  const available = input.candidates.filter(
    (candidate) => !input.selectedIds.has(String(candidate.groupId))
  );

  if (available.length === 0) return null;

  const remaining = Math.max(0, input.targetTotal - input.currentTotal);
  const fitting = available.filter(
    (candidate) => candidate.questionCount <= remaining
  );
  const pool = fitting.length > 0 ? fitting : available;

  return [...pool].sort((left, right) => {
    const leftScore = input.bucket
      ? scoreCandidateForBucket(left, input.bucket, input.targetDifficulty)
      : scoreCandidateForFallback(left, input.targetDifficulty);
    const rightScore = input.bucket
      ? scoreCandidateForBucket(right, input.bucket, input.targetDifficulty)
      : scoreCandidateForFallback(right, input.targetDifficulty);

    if (leftScore !== rightScore) return rightScore - leftScore;

    const leftDistance = Math.abs(left.questionCount - remaining);
    const rightDistance = Math.abs(right.questionCount - remaining);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    return String(left.groupId).localeCompare(String(right.groupId));
  })[0];
};

async function selectGroupsForPartExactQuestions(
  part: number,
  thetaPart: number,
  targetQuestions: number
): Promise<{
  groupIds: Types.ObjectId[];
  totalQuestions: number;
}> {
  // 1) Lấy toàn bộ group thuộc Part này
  const rawGroups = await Group.find({ part })
    .select(
      "_id part questions audioUrl imagesUrl transcriptEnglish transcriptTranslation"
    )
    .lean();

  if (!rawGroups.length || targetQuestions <= 0) {
    return { groupIds: [], totalQuestions: 0 };
  }

  // 2) Tính stats cho từng group
  type GroupInfo = {
    groupId: Types.ObjectId;
    avgDifficulty: number;
    questionCount: number;
    closeness: number;
  };

  const groupInfos: GroupInfo[] = [];

  for (const g of rawGroups) {
    const { avgDifficulty, questionCount } = await computeGroupStats(g);

    // Bỏ giới hạn questionCount > targetQuestions để có nhiều option hơn
    if (questionCount === 0) continue;

    const closeness = Math.abs(avgDifficulty - thetaPart);

    groupInfos.push({
      groupId: g._id as Types.ObjectId,
      avgDifficulty,
      questionCount,
      closeness,
    });
  }

  if (!groupInfos.length) {
    return { groupIds: [], totalQuestions: 0 };
  }

  // 3) Sort theo độ gần theta (closeness ↑)
  groupInfos.sort((a, b) => a.closeness - b.closeness);

  // 4) DP subset-sum theo tổng số câu
  // dp[q] = index group được chọn cuối cùng để đạt tổng q, hoặc -1 nếu unreachable
  const maxQ = Math.min(targetQuestions * 2, 200); // Tăng range để có nhiều option hơn
  const dp = new Array<number>(maxQ + 1).fill(-1);
  dp[0] = -2; // 0 câu đạt được mà không dùng group nào

  for (let i = 0; i < groupInfos.length; i++) {
    const c = groupInfos[i].questionCount;

    // Duyệt ngược để không reuse cùng group nhiều lần
    for (let q = maxQ; q >= c; q--) {
      if (dp[q] === -1 && dp[q - c] !== -1) {
        dp[q] = i; // lưu lại index groupInfos[i]
      }
    }
  }

  // 5) Tìm tổng q tốt nhất:
  //    - Ưu tiên q = targetQuestions
  //    - Nếu không có exact, lấy q gần nhất >= target (hoặc < nếu không có)
  let bestQ = -1;
  if (dp[targetQuestions] !== -1) {
    bestQ = targetQuestions;
  } else {
    // Ưu tiên lấy >= target trước
    for (let q = targetQuestions + 1; q <= maxQ; q++) {
      if (dp[q] !== -1) {
        bestQ = q;
        break;
      }
    }
    // Nếu không có, lấy lớn nhất < target
    if (bestQ === -1) {
      for (let q = targetQuestions - 1; q >= 1; q--) {
        if (dp[q] !== -1) {
          bestQ = q;
          break;
        }
      }
    }
  }

  if (bestQ === -1) {
    // Không tìm được tổ hợp nào
    return { groupIds: [], totalQuestions: 0 };
  }

  // 6) Truy vết ngược để lấy danh sách groupIds
  const chosenIndices: number[] = [];
  let curQ = bestQ;

  while (curQ > 0) {
    const idx = dp[curQ];
    if (idx === -1 || idx === -2) break;

    chosenIndices.push(idx);
    curQ -= groupInfos[idx].questionCount;
  }

  const chosenGroupIds = chosenIndices.map((i) => groupInfos[i].groupId);

  return {
    groupIds: chosenGroupIds,
    totalQuestions: bestQ,
  };
}

/************************************************************
 * SERVICE CHÍNH:
 *  - Nhận thetaByPart (1..7)
 *  - Chọn group theo từng Part sao cho tổng số câu ≈ BASE_QUESTION_DISTRIBUTION
 *  - Clone group mới cho mini test
 *  - Tạo Test type MINI_TEST
 ************************************************************/
const buildMiniTestGroupCandidates = async (input: {
  part: number;
  skillSets: Record<MiniTestSkillBucket, Set<string>>;
}): Promise<MiniTestGroupCandidate[]> => {
  const rawGroups = await Group.find({ part: input.part })
    .select(
      "_id part questions audioUrl imagesUrl transcriptEnglish transcriptTranslation"
    )
    .populate({
      path: "questions",
      select: "_id tags irt_difficulty",
    })
    .lean();

  return rawGroups.reduce<MiniTestGroupCandidate[]>((candidates, group: any) => {
    const questions = (group.questions ?? []) as MiniTestQuestionMeta[];
    if (!questions.length) return candidates;

    let difficultySum = 0;
    const skillKeys: string[] = [];
    const bucketCounts: Record<MiniTestSkillBucket, number> = {
      focus: 0,
      weak_non_focus: 0,
      strong_retention: 0,
    };

    for (const question of questions) {
      difficultySum += question.irt_difficulty ?? 0;
      const normalizedSkills = normalizeToeicSkillTags(
        Array.isArray(question.tags) ? question.tags : [],
        input.part
      );
      const questionSkillKeys = uniqueStrings(
        normalizedSkills.map((skill) => skill.key)
      );
      skillKeys.push(...questionSkillKeys);

      for (const bucket of Object.keys(bucketCounts) as MiniTestSkillBucket[]) {
        if (
          questionSkillKeys.some((skillKey) =>
            input.skillSets[bucket].has(skillKey)
          )
        ) {
          bucketCounts[bucket] += 1;
        }
      }
    }

    candidates.push({
      group,
      groupId: group._id as Types.ObjectId,
      part: input.part,
      questionCount: questions.length,
      avgDifficulty: difficultySum / questions.length,
      skillKeys: uniqueStrings(skillKeys),
      bucketCounts,
    });

    return candidates;
  }, []);
};

const selectMiniTestGroupsForPart = (input: {
  candidates: MiniTestGroupCandidate[];
  partQuestionTarget: number;
  targetDifficulty: number;
}): MiniTestGroupCandidate[] => {
  const bucketTargets = calculateBucketTargets(input.partQuestionTarget);
  const selected: MiniTestGroupCandidate[] = [];
  const selectedIds = new Set<string>();
  const bucketActuals: Record<MiniTestSkillBucket, number> = {
    focus: 0,
    weak_non_focus: 0,
    strong_retention: 0,
  };

  const selectedQuestionTotal = () =>
    selected.reduce((sum, candidate) => sum + candidate.questionCount, 0);

  for (const bucket of [
    "focus",
    "weak_non_focus",
    "strong_retention",
  ] as MiniTestSkillBucket[]) {
    while (
      bucketActuals[bucket] < bucketTargets[bucket] &&
      selectedQuestionTotal() < input.partQuestionTarget
    ) {
      const candidate = chooseCandidate({
        candidates: input.candidates.filter(
          (item) => item.bucketCounts[bucket] > 0
        ),
        selectedIds,
        currentTotal: selectedQuestionTotal(),
        targetTotal: input.partQuestionTarget,
        bucket,
        targetDifficulty: input.targetDifficulty,
      });

      if (!candidate) break;

      selected.push(candidate);
      selectedIds.add(String(candidate.groupId));
      for (const currentBucket of Object.keys(
        bucketActuals
      ) as MiniTestSkillBucket[]) {
        bucketActuals[currentBucket] += candidate.bucketCounts[currentBucket];
      }
    }
  }

  while (selectedQuestionTotal() < input.partQuestionTarget) {
    const candidate = chooseCandidate({
      candidates: input.candidates,
      selectedIds,
      currentTotal: selectedQuestionTotal(),
      targetTotal: input.partQuestionTarget,
      targetDifficulty: input.targetDifficulty,
    });

    if (!candidate) break;

    selected.push(candidate);
    selectedIds.add(String(candidate.groupId));
  }

  return selected;
};

const cloneGroupsForGeneratedTest = async (
  sourceGroups: any[],
  now: Date
): Promise<Types.ObjectId[]> => {
  const clonedGroupDocs = sourceGroups.map((g: any) => ({
    test_id: null,
    quiz_id: null,
    minitest_id: null,
    practice_id: null,
    part: g.part,
    audioUrl: g.audioUrl,
    imagesUrl: g.imagesUrl,
    transcriptEnglish: g.transcriptEnglish,
    transcriptTranslation: g.transcriptTranslation,
    questions: (g.questions ?? []).map((question: any) => question._id ?? question),
    created_at: now,
    updated_at: now,
  }));

  const clonedGroups = await Group.insertMany(clonedGroupDocs);
  return clonedGroups.map((group) => group._id as Types.ObjectId);
};

const createGeneratedMiniTest = async (input: {
  user_id: string;
  cloned_group_ids: Types.ObjectId[];
  title: string;
  topic: string;
  now: Date;
}) => {
  const miniTest = await Test.create({
    title: input.title,
    audioListen: [],
    groups: input.cloned_group_ids,
    type: TestType.MINI_TEST,
    status: TestStatus.APPROVED,
    topic: input.topic,
    countComment: 0,
    countSubmit: 0,
    created_at: input.now,
    created_by: new Types.ObjectId(input.user_id),
    updated_at: input.now,
  });

  await Group.updateMany(
    { _id: { $in: input.cloned_group_ids } },
    {
      $set: {
        test_id: miniTest._id,
      },
    }
  );

  return miniTest;
};

export async function generateLearningPathMiniTest(
  input: GenerateLearningPathMiniTestInput
) {
  const focusPartTypes = uniqueNumbers(input.focus_part_types).slice(0, 3);
  const focusSkillKeys = new Set(uniqueStrings(input.focus_skill_keys));

  if (focusPartTypes.length === 0) {
    throw new Error("Mini test cần ít nhất 1 focus_part_types.");
  }

  const userSkill = await UserSkill.findOne({
    user_id: toObjectId(input.user_id),
    context_type: "learning_path",
    learning_path_id: toObjectId(input.learning_path_id),
  }).lean();

  if (!userSkill) {
    throw new Error("Không tìm thấy UserSkill để generate mini test.");
  }

  const partByType = new Map<number, IUserSkillPart>(
    (userSkill.parts ?? []).map((part) => [part.part_type, part])
  );
  const sortedFocusParts = [...focusPartTypes].sort((left, right) => {
    const leftAbility = partByType.get(left)?.ability ?? 1;
    const rightAbility = partByType.get(right)?.ability ?? 1;
    return leftAbility - rightAbility;
  });
  const partQuestionQuotas = buildPartQuestionQuotas(sortedFocusParts.length);

  const selectedCandidates: MiniTestGroupCandidate[] = [];

  for (const [index, partType] of sortedFocusParts.entries()) {
    const userSkillPart = partByType.get(partType);
    if (!userSkillPart) {
      throw new Error(`Không tìm thấy UserSkill Part ${partType}.`);
    }

    const candidates = await buildMiniTestGroupCandidates({
      part: partType,
      skillSets: getPartSkillSets(userSkillPart, focusSkillKeys),
    });
    const partSelectedCandidates = selectMiniTestGroupsForPart({
      candidates,
      partQuestionTarget: partQuestionQuotas[index] ?? 0,
      targetDifficulty: abilityToTargetDifficulty(userSkillPart.ability),
    });

    selectedCandidates.push(...partSelectedCandidates);
  }

  const selectedSourceGroupsById = new Map<string, any>();
  for (const candidate of selectedCandidates) {
    selectedSourceGroupsById.set(String(candidate.groupId), candidate.group);
  }

  if (selectedSourceGroupsById.size === 0) {
    throw new Error("Không tìm thấy group phù hợp để generate mini test.");
  }

  const now = new Date();
  const clonedGroupIds = await cloneGroupsForGeneratedTest(
    [...selectedSourceGroupsById.values()],
    now
  );

  return createGeneratedMiniTest({
    user_id: input.user_id,
    cloned_group_ids: clonedGroupIds,
    title: `Learning Path Mini Test - Cycle ${input.cycle_no}`,
    topic: "LearningPath v2 mini test 70/20/10",
    now,
  });
}

export async function generateNextWeekMiniTest(
  userId: string,
  thetaByPart: Record<number, number>
) {
  // 1. Chuẩn hóa theta (nếu thiếu → 0)
  const cleanTheta: Record<number, number> = {};
  for (let part = 1; part <= 7; part++) {
    const theta = thetaByPart[part];
    cleanTheta[part] = typeof theta === "number" && !isNaN(theta) ? theta : 0;
  }

  // 2. Target số câu cho từng Part (tất cả là "question")
  const questionTargets: Record<number, number> = {
    ...BASE_QUESTION_DISTRIBUTION,
  };

  // 3. Chọn group GỐC cho từng Part
  const selectedSourceGroupIds: Types.ObjectId[] = [];
  let globalQuestionCount = 0;

  for (let part = 1; part <= 7; part++) {
    const targetQ = questionTargets[part] ?? 0;
    if (targetQ <= 0) continue;

    const thetaPart = cleanTheta[part];

    const { groupIds, totalQuestions } =
      await selectGroupsForPartExactQuestions(part, thetaPart, targetQ);

    console.log(
      `Part ${part} → targetQ=${targetQ}, selectedGroups=${
        groupIds.length
      }, totalQuestions=${totalQuestions}, shortfall=${
        targetQ - totalQuestions
      }`
    );

    selectedSourceGroupIds.push(...groupIds);
    globalQuestionCount += totalQuestions;
  }

  console.log("💡 Total questions across all parts:", globalQuestionCount);

  if (globalQuestionCount < 100) {
    console.warn(
      `⚠️ Mini test chỉ có ${globalQuestionCount}/100 câu. Đang bổ sung thêm...`
    );

    // Phase 2: Bổ sung thêm group để đạt 100 câu
    const needed = 100 - globalQuestionCount;

    // Lấy group chưa dùng từ tất cả các part
    const unusedGroups = await Group.find({
      _id: { $nin: selectedSourceGroupIds },
      part: { $in: [1, 2, 3, 4, 5, 6, 7] },
    })
      .select("_id part questions")
      .lean();

    console.log(`📦 Tìm thấy ${unusedGroups.length} group chưa dùng trong DB`);

    // Tính số câu cho từng group
    type GroupWithCount = { _id: Types.ObjectId; part: number; count: number };
    const groupsWithCount: GroupWithCount[] = [];

    for (const g of unusedGroups) {
      const { questionCount } = await computeGroupStats(g);
      if (questionCount > 0 && g.part) {
        groupsWithCount.push({
          _id: g._id as Types.ObjectId,
          part: g.part,
          count: questionCount,
        });
      }
    }

    console.log(`✅ Có ${groupsWithCount.length} group hợp lệ để bổ sung`);

    // Sort theo số câu tăng dần để ưu tiên group nhỏ
    groupsWithCount.sort((a, b) => a.count - b.count);

    // Chọn thêm group cho đến khi đủ 100 câu
    let added = 0;
    for (const g of groupsWithCount) {
      if (globalQuestionCount >= 100) break;

      selectedSourceGroupIds.push(g._id);
      globalQuestionCount += g.count;
      added++;

      console.log(
        `  + Part ${g.part}: thêm ${g.count} câu (tổng: ${globalQuestionCount})`
      );
    }

    console.log(
      `✅ Đã bổ sung ${added} group, tổng câu: ${globalQuestionCount}/${
        needed + globalQuestionCount
      } cần thiết`
    );

    if (globalQuestionCount < 100) {
      console.error(
        `❌ Không đủ group trong DB! Chỉ đạt được ${globalQuestionCount}/100 câu`
      );
    }
  }

  // Ở đây: globalQuestionCount có thể < 100 nếu có Part không tìm được tổ hợp chính xác.
  // Nếu bạn MUỐN ép = 100, có thể thêm 1 PHASE FILL tiếp (giống lần trước),
  // nhưng vẫn không tách group.

  // 4. CLONE GROUP: tạo bản group mới cho mini test này
  const now = new Date();

  const sourceGroups = await Group.find({
    _id: { $in: selectedSourceGroupIds },
  }).lean();

  const clonedGroupDocs = sourceGroups.map((g: any) => ({
    test_id: null,
    quiz_id: null,
    minitest_id: null,
    practice_id: null,
    part: g.part,
    audioUrl: g.audioUrl,
    imagesUrl: g.imagesUrl,
    transcriptEnglish: g.transcriptEnglish,
    transcriptTranslation: g.transcriptTranslation,
    questions: g.questions, // reuse Question gốc
    created_at: now,
    updated_at: now,
  }));

  const clonedGroups = await Group.insertMany(clonedGroupDocs);
  const clonedGroupIds = clonedGroups.map((g) => g._id as Types.ObjectId);

  // 5. Tạo Test mini mới
  const miniTest = await Test.create({
    title: `Mini Test (generated) - ${now.toISOString().slice(0, 10)}`,
    audioListen: [], // nếu cần
    groups: clonedGroupIds,
    type: TestType.MINI_TEST,
    status: TestStatus.APPROVED,
    topic: "Adaptive weekly mini test",
    countComment: 0,
    countSubmit: 0,
    created_at: now,
    created_by: new Types.ObjectId(userId),
    updated_at: now,
  });

  // 6. Gắn minitest_id/test_id cho group clone (nếu muốn dễ trace)
  await Group.updateMany(
    { _id: { $in: clonedGroupIds } },
    {
      $set: {
        test_id: miniTest._id,
      },
    }
  );

  console.log("✅ Generated mini test:", miniTest._id.toString());
  return miniTest;
}
