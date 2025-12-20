import { Types } from "mongoose";
import { Question } from "../models/question.model";
import { Group } from "../models/group.model";
import { Test } from "../models/test.model";
import { TestType } from "../models/enums/TestType";
import { TestStatus } from "../models/enums/TestStatus";

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
