import {
  DayStudy,
  Group,
  LearningPath,
  Lesson,
  Quiz,
  TopicVocabulary,
  User,
  UserTest,
  WeekStudy,
} from "../models";
import { WeekStudyStatus } from "../models/enums/WeekStudyStatus";
import { SessionType } from "../models/enums/SessionType";
import { Types } from "mongoose";
import { Question } from "../models/question.model";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { submitMiniTestService } from "./test.service";
import { generateNextWeekMiniTest } from "../utils/mini_test.util";
import { generateIRTWeeklyPlan } from "./gemini.service";
import { saveDebugFile } from "./demo.service";
import { updatedThetaInUserTestService } from "./user_test.service";
import { updateUserStreak } from "./streak.service";
import { autoUnlockAfterComplete } from "./auto_unlock.service";
import { emitToUser } from "../socket/emitToUser.socket";

/************************************************************
 * ==================== IRT MODELS ====================
 ************************************************************/

/************************************************************
 * RASCH MODEL (1PL) - P(θ) = 1 / (1 + exp(-(θ - b)))
 * Chỉ có 1 parameter: b (difficulty)
 * Giả định tất cả câu hỏi có discrimination (a) = 1
 ************************************************************/
function PRasch(theta: number, b: number) {
  return 1 / (1 + Math.exp(-(theta - b)));
}

/************************************************************
 * 2PL MODEL (a, b) - P(θ) = 1 / (1 + exp(-a*(θ - b)))
 ************************************************************/
function P2PL(theta: number, a: number, b: number) {
  return 1 / (1 + Math.exp(-a * (theta - b)));
}

/************************************************************
 * ==================== RASCH 1PL MLE ====================
 ************************************************************/

/************************************************************
 * ESTIMATE THETA using Rasch 1PL (MLE với Newton-Raphson)
 * Thay vì duyệt từ -5 đến +5, MLE tìm theta tối ưu trực tiếp
 *
 * @param items - Mảng {b: difficulty, correct: 0|1}
 * @returns theta ước lượng
 ************************************************************/
export function estimateThetaRasch(
  items: { b: number; correct: number }[]
): number {
  if (!items.length) return 0;

  // Xử lý trường hợp đặc biệt: tất cả đúng hoặc tất cả sai
  const totalCorrect = items.reduce((sum, item) => sum + item.correct, 0);
  if (totalCorrect === 0) return -4; // Tất cả sai → theta thấp nhất
  if (totalCorrect === items.length) return 4; // Tất cả đúng → theta cao nhất

  // Newton-Raphson MLE
  let theta = 0; // Khởi tạo theta = 0 (trung bình)
  const maxIter = 30;
  const tolerance = 0.0001;

  for (let iter = 0; iter < maxIter; iter++) {
    let L1 = 0; // First derivative (Score function)
    let L2 = 0; // Second derivative (Fisher Information, negative)

    for (const item of items) {
      const p = PRasch(theta, item.b);
      const q = 1 - p;

      // Score function: Σ(u_i - P_i)
      L1 += item.correct - p;
      // Fisher Information: -Σ(P_i * Q_i)
      L2 += -p * q;
    }

    // Tránh chia cho 0
    if (Math.abs(L2) < 1e-10) break;

    // Newton-Raphson update: θ_new = θ_old - L'/L''
    const delta = L1 / L2;
    theta -= delta;

    // Kiểm tra hội tụ
    if (Math.abs(delta) < tolerance) {
      console.log(`🎯 Rasch MLE converged at iteration ${iter + 1}`);
      break;
    }

    // Giới hạn theta trong khoảng hợp lý
    theta = Math.max(-4, Math.min(4, theta));
  }

  return theta;
}

/************************************************************
 * CALIBRATE DIFFICULTY (b) using Rasch 1PL MLE
 * Ước lượng độ khó của 1 câu hỏi dựa trên responses
 *
 * @param responses - Mảng {theta: năng lực user, correct: 0|1}
 * @returns b (difficulty) ước lượng
 ************************************************************/
export function calibrateDifficultyRasch(
  responses: { theta: number; correct: number }[]
): number {
  if (!responses.length) return 0;

  // Xử lý trường hợp đặc biệt
  const totalCorrect = responses.reduce((sum, r) => sum + r.correct, 0);
  if (totalCorrect === 0) return 4; // Không ai đúng → câu rất khó
  if (totalCorrect === responses.length) return -4; // Tất cả đúng → câu rất dễ

  // Khởi tạo b bằng logit của tỷ lệ đúng (ước lượng nhanh)
  const pCorrect = totalCorrect / responses.length;
  let b = -Math.log(pCorrect / (1 - pCorrect));
  b = Math.max(-4, Math.min(4, b)); // Clamp

  // Newton-Raphson MLE để tinh chỉnh
  const maxIter = 30;
  const tolerance = 0.0001;

  for (let iter = 0; iter < maxIter; iter++) {
    let L1 = 0; // Derivative w.r.t b
    let L2 = 0; // Second derivative (Fisher Information)

    for (const r of responses) {
      const p = PRasch(r.theta, b);
      const q = 1 - p;

      // Derivative của log-likelihood theo b: Σ(P_i - u_i)
      L1 += p - r.correct;
      // Fisher Information: Σ(P_i * Q_i)
      L2 += p * q;
    }

    if (L2 < 1e-10) break;

    // Newton-Raphson update
    const delta = L1 / L2;
    b += delta;

    if (Math.abs(delta) < tolerance) {
      console.log(
        `🎯 Rasch difficulty calibration converged at iteration ${iter + 1}`
      );
      break;
    }

    b = Math.max(-4, Math.min(4, b));
  }

  return b;
}

/************************************************************
 * CALIBRATE ALL QUESTIONS using Rasch 1PL
 * Chuẩn hóa độ khó cho toàn bộ câu hỏi trong DB
 ************************************************************/
export async function calibrateIRTRasch() {
  console.log("🔧 Bắt đầu hiệu chỉnh IRT Rasch (1PL) cho toàn bộ câu hỏi…");

  const questions = await Question.find({});
  let calibratedCount = 0;

  for (const q of questions) {
    const tests = await UserTest.find({
      "answers.question_id": q._id,
    });

    // Cần tối thiểu 30 lượt làm để calibrate
    if (!tests || tests.length < 30) {
      continue;
    }

    const responses: { theta: number; correct: number }[] = [];

    for (const t of tests) {
      // Dùng theta đã lưu hoặc ước lượng từ score
      const theta = t.theta_overall ?? scoreToTheta(t.score, t.answers.length);

      for (const ans of t.answers) {
        if (ans.question_id.toString() === q._id.toString()) {
          responses.push({
            theta,
            correct: ans.isCorrect ? 1 : 0,
          });
        }
      }
    }

    if (responses.length < 20) continue;

    // Calibrate difficulty bằng Rasch MLE
    const b = calibrateDifficultyRasch(responses);

    console.log(`✓ Rasch calibrated ${q._id}: b=${b.toFixed(3)}`);

    await Question.updateOne(
      { _id: q._id },
      {
        irt_discrimination: 1.0, // Rasch giả định a = 1
        irt_difficulty: b,
        irt_guessing: 0.25, // Cố định cho TOEIC (4 đáp án)
        updated_at: new Date(),
      }
    );

    calibratedCount++;
  }

  console.log(
    `🎉 Hoàn tất hiệu chỉnh Rasch! Đã cập nhật ${calibratedCount} câu hỏi.`
  );
  return { calibratedCount };
}

/************************************************************
 * ESTIMATE THETA BY PART using Rasch 1PL
 * Tính theta cho từng Part 1-7
 ************************************************************/
export function calculateThetaRasch(result: {
  responses: {
    b: number; // difficulty
    correct: number;
    part: number | null;
  }[];
}) {
  const overallItems: { b: number; correct: number }[] = [];
  const itemsByPart: Record<number, { b: number; correct: number }[]> = {};

  for (const r of result.responses) {
    const item = { b: r.b, correct: r.correct };
    overallItems.push(item);

    if (r.part != null && r.part >= 1 && r.part <= 7) {
      if (!itemsByPart[r.part]) itemsByPart[r.part] = [];
      itemsByPart[r.part].push(item);
    }
  }

  // Theta tổng
  const thetaOverall = estimateThetaRasch(overallItems);

  // Theta theo Part 1..7
  const thetaByPart: Record<number, number> = {};
  for (let part = 1; part <= 7; part++) {
    const items = itemsByPart[part] || [];
    thetaByPart[part] = estimateThetaRasch(items);
  }

  return {
    thetaOverall,
    thetaByPart,
  };
}

/**
 * Cập nhật theta cho User sau khi làm Full Test hoặc Mini Test
 * Sử dụng mô hình Rasch (1PL MLE)
 */
export async function updateIRTAbilities(
  userId: string,
  userTestId: string,
  responses: { irt_difficulty: number; isCorrect: boolean; part: number }[]
) {
  const result = {
    responses: responses.map((r) => ({
      b: r.irt_difficulty || 0,
      correct: r.isCorrect ? 1 : 0,
      part: r.part,
    })),
  };

  const abilities = calculateThetaRasch(result);

  // Lưu vào DB (UserTest và User)
  await saveAbilityToDB(userId, userTestId, abilities);

  return abilities;
}

/************************************************************
 * ==================== 2PL MODEL (Original) ====================
 ************************************************************/

/************************************************************
 * Convert Score → Theta Estimate (dùng tạm)
 * Dùng để calibrate item ở giai đoạn đầu.
 ************************************************************/
function scoreToTheta(rawScore: number, totalQuestions: number): number {
  if (totalQuestions === 0) return 0;

  // Tỷ lệ đúng (0 → 1)
  let p = rawScore / (totalQuestions * 5);

  // Chặn tránh p = 0 hoặc 1
  p = Math.max(0.05, Math.min(0.95, p));

  return Math.log(p / (1 - p)); // logit transform
}

/************************************************************
 * CALIBRATE ITEM PARAMETERS (a, b) using 2PL
 ************************************************************/
function estimateIRTParams2PL(rows: { theta: number; correct: number }[]) {
  let a = 1.0; // discrimination
  let b = 0.0; // difficulty
  const lr = 0.01;

  for (let iter = 0; iter < 60; iter++) {
    let gradA = 0,
      gradB = 0;

    for (const row of rows) {
      const p = P2PL(row.theta, a, b);
      const q = 1 - p;

      gradA += (row.correct - p) * (row.theta - b) * p * q;
      gradB += (row.correct - p) * -a * p * q;
    }

    a += lr * gradA;
    b += lr * gradB;

    // Clamp để ổn định
    a = Math.max(0.2, Math.min(a, 2.0));
    b = Math.max(-3, Math.min(b, 3));
  }

  return { a, b };
}

/************************************************************
 * MAIN FUNCTION — CALIBRATE ALL QUESTIONS
 ************************************************************/
export async function calibrateIRT2PL() {
  console.log("🔧 Bắt đầu hiệu chỉnh IRT 2PL cho toàn bộ câu hỏi…");

  const questions = await Question.find({});

  for (const q of questions) {
    const tests = await UserTest.find({
      "answers.question_id": q._id,
    });

    // Cần tối thiểu 40 lượt làm để calibrate
    if (!tests || tests.length < 40) {
      console.log(`⚠️ Skip ${q._id}: Không đủ dữ liệu.`);
      continue;
    }

    const rows: { theta: number; correct: number }[] = [];

    for (const t of tests) {
      const theta = scoreToTheta(t.score, t.answers.length);

      for (const ans of t.answers) {
        if (ans.question_id.toString() === q._id.toString()) {
          rows.push({
            theta,
            correct: ans.isCorrect ? 1 : 0,
          });
        }
      }
    }

    if (rows.length < 30) continue;

    const { a, b } = estimateIRTParams2PL(rows);

    console.log(`✓ Updated ${q._id}: a=${a.toFixed(3)}, b=${b.toFixed(3)}`);

    await Question.updateOne(
      { _id: q._id },
      {
        irt_discrimination: a,
        irt_difficulty: b,
        irt_guessing: 0.25, // KEEP FIXED FOR TOEIC
        updated_at: new Date(),
      }
    );
  }

  console.log("🎉 Hoàn tất hiệu chỉnh IRT 2PL!");
}

/************************************************************
 * ESTIMATE THETA FOR A USER (Newton–Raphson 2PL)
 ************************************************************/
function estimateTheta2PL(rows: { a: number; b: number; correct: number }[]) {
  let theta = 0;
  const maxIter = 40;

  for (let iter = 0; iter < maxIter; iter++) {
    let num = 0;
    let den = 0;

    for (const row of rows) {
      const { a, b, correct } = row;

      const p = P2PL(theta, a, b);
      const q = 1 - p;

      // Newton-Raphson
      num += a * (correct - p);
      den += a * a * p * q;
    }

    if (den === 0) break;

    theta += num / den;

    // Chặn theta
    theta = Math.max(-4, Math.min(theta, 4));
  }

  return theta;
}

/************************************************************
 * ESTIMATE THETA FOR A SINGLE TEST (overall, reading, listening)
 ************************************************************/
export async function estimateThetaForUserTest2PL(userTestId: string) {
  const t = await UserTest.findById(userTestId);
  if (!t) return;

  const rowsOverall = [];
  const rowsListening = [];
  const rowsReading = [];

  for (const ans of t.answers) {
    const q = await Question.findById(ans.question_id);
    if (!q) continue;

    const row = {
      a: q.irt_discrimination,
      b: q.irt_difficulty,
      correct: ans.isCorrect ? 1 : 0,
    };

    rowsOverall.push(row);

    // Extract Part number from tags
    let partNum: number | null = null;

    for (const tag of q.tags) {
      const match = tag.match(/\[Part (\d+)\]/);
      if (match) {
        partNum = parseInt(match[1]);
        break;
      }
    }

    if (partNum !== null) {
      if (partNum >= 1 && partNum <= 4) rowsListening.push(row);
      else if (partNum >= 5 && partNum <= 7) rowsReading.push(row);
    }
  }

  const thetaOverall = estimateTheta2PL(rowsOverall);
  const thetaListening = estimateTheta2PL(rowsListening);
  const thetaReading = estimateTheta2PL(rowsReading);

  console.log(`Theta (2PL) for test ${t._id}:`, {
    thetaOverall,
    thetaListening,
    thetaReading,
  });

  // Sanitize values before saving to avoid NaN being written to numeric fields
  const safeThetaOverall = Number.isFinite(thetaOverall) ? thetaOverall : 0;
  const safeThetaListening = Number.isFinite(thetaListening)
    ? thetaListening
    : 0;
  const safeThetaReading = Number.isFinite(thetaReading) ? thetaReading : 0;

  if (
    !Number.isFinite(thetaOverall) ||
    !Number.isFinite(thetaListening) ||
    !Number.isFinite(thetaReading)
  ) {
    console.warn(
      `⚠️ Detected non-finite theta values for UserTest ${t._id}. Coercing to 0.`,
      { thetaOverall, thetaListening, thetaReading }
    );
  }

  await UserTest.updateOne(
    { _id: t._id },
    {
      theta_overall: safeThetaOverall,
      theta_listening: safeThetaListening,
      theta_reading: safeThetaReading,
    }
  );
}

/************************************************************
 * ESTIMATE THETA FOR ALL TESTS
 ************************************************************/
export async function estimateAllTheta2PL() {
  const tests = await UserTest.find({});
  for (const t of tests) {
    await estimateThetaForUserTest2PL(t._id.toString());
  }
}

// Run estimation (uncomment khi cần)
// calibrateIRT2PL();
// estimateAllTheta2PL();

// === Tất cả các hàm trên dùng để chuẩn hóa DB - Không có ý nghĩa gì trong ứng dụng ===

/************************************************************
 * STEP 4 — CALCULATE THETA (OVERALL + PART 1–7)
 ************************************************************/
export function calculateTheta2PL(result: {
  responses: {
    a: number;
    b: number;
    c: number;
    correct: number;
    part: number | null;
  }[];
}) {
  const overallRows: { a: number; b: number; correct: number }[] = [];
  const rowsByPart: Record<
    number,
    { a: number; b: number; correct: number }[]
  > = {};

  for (const r of result.responses) {
    const row = { a: r.a, b: r.b, correct: r.correct };
    overallRows.push(row);

    if (r.part != null && r.part >= 1 && r.part <= 7) {
      if (!rowsByPart[r.part]) rowsByPart[r.part] = [];
      rowsByPart[r.part].push(row);
    }
  }

  // Theta tổng
  const thetaOverall = estimateTheta2PL(overallRows);

  // Theta theo Part 1..7
  const thetaByPart: Record<number, number> = {};
  for (let part = 1; part <= 7; part++) {
    const rows = rowsByPart[part] || [];
    thetaByPart[part] = estimateTheta2PL(rows);
  }

  return {
    thetaOverall,
    thetaByPart,
  };
}

/************************************************************
 * STEP 5 — SAVE ABILITY TO DATABASE
 ************************************************************/
export async function saveAbilityToDB(
  userId: string,
  testId: string,
  abilities: {
    thetaOverall: number;
    thetaByPart: Record<number, number>;
  }
) {
  const { thetaOverall, thetaByPart } = abilities;

  console.log("📥 Saving abilities to DB:", abilities);

  // Sanitize theta values before saving to DB to avoid CastError when value is NaN
  const safeThetaOverall = Number.isFinite(thetaOverall) ? thetaOverall : 0;
  const safeThetaParts: Record<number, number> = {};
  let hadBadPart = false;
  for (let p = 1; p <= 7; p++) {
    const v = thetaByPart[p];
    if (Number.isFinite(v)) safeThetaParts[p] = v;
    else {
      hadBadPart = true;
      safeThetaParts[p] = 0;
    }
  }

  if (!Number.isFinite(thetaOverall) || hadBadPart) {
    console.warn(
      `⚠️ Detected non-finite theta values when saving ability for user=${userId}, test=${testId}. Coercing invalid values to 0.`,
      {
        thetaOverall,
        thetaByPart,
      }
    );
  }

  // Lưu vào UserTest
  await UserTest.updateOne(
    { _id: testId },
    {
      theta_overall: safeThetaOverall,
      theta_parts: safeThetaParts,
    }
  );

  // Lưu vào User (latest ability)
  await User.updateOne(
    { _id: userId },
    {
      latest_theta_overall: safeThetaOverall,
      latest_theta_parts: safeThetaParts,
    }
  );

  console.log(`✔ Ability saved for user=${userId}, test=${testId}`);
}

/************************************************************
 * θ → CEFR Level bands
 ************************************************************/
function thetaToCEFR(theta: number) {
  if (theta < -1.0) return ["A1", "A2"];
  if (theta < -0.5) return ["A2", "B1"];
  if (theta < 0.0) return ["B1", "B2"];
  if (theta < 0.7) return ["B1", "B2", "C1"];
  return ["B2", "C1", "C2"];
}

/************************************************************
 * θ → Weight range (0–1)
 ************************************************************/
function thetaToWeightRange(theta: number) {
  if (theta < -0.7) return { min: 0.0, max: 0.4 }; // dễ
  if (theta < -0.2) return { min: 0.0, max: 0.6 }; // dễ -> TB
  if (theta < 0.5) return { min: 0.3, max: 0.8 }; // TB
  return { min: 0.5, max: 1.0 }; // TB -> Khó
}

/************************************************************
 * CORE TYPES BY PART
 ************************************************************/
const CORE_TYPES_BY_PART: Record<number, string[]> = {
  1: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
  2: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
  3: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
  4: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
  5: ["lesson", "quiz", "vocab"],
  6: ["lesson", "quiz", "vocab"],
  7: ["lesson", "quiz", "vocab"],
};

/************************************************************
 * MAIN FUNCTION — FILTER CANDIDATE ITEMS
 ************************************************************/
export async function getCandidateLearningItems(
  thetaByPart: Record<number, number>
) {
  const result: Record<number, any> = {};

  for (let part = 1; part <= 7; part++) {
    const theta = thetaByPart[part];

    // Nếu không có dữ liệu → trả về rỗng
    if (theta === undefined || isNaN(theta)) {
      result[part] = {
        lessons: [],
        dictations: [],
        shadowings: [],
        quizzes: [],
        vocab: [],
      };
      continue;
    }

    const cefrLevels = thetaToCEFR(theta);
    const weightRange = thetaToWeightRange(theta);
    const allowedTypes = CORE_TYPES_BY_PART[part];

    console.log(`\n=== Part ${part} ===`);
    console.log("Theta:", theta);
    console.log("CEFR:", cefrLevels);
    console.log("Weight:", weightRange);
    console.log("Allowed types:", allowedTypes);

    const partResult: any = {
      lessons: [],
      dictations: [],
      shadowings: [],
      quizzes: [],
      vocab: [],
    };

    /***********************************
     * LESSON
     ***********************************/
    if (allowedTypes.includes("lesson")) {
      partResult.lessons = await Lesson.find({
        part_type: part,
        level: { $in: cefrLevels },
        weight: { $gte: weightRange.min, $lte: weightRange.max },
      }).select(
        "_id title summary level weight planned_completion_time part_type"
      );
    }

    /***********************************
     * DICTATION
     ***********************************/
    if (allowedTypes.includes("dictation")) {
      partResult.dictations = await Dictation.find({
        part_type: part,
        level: { $in: cefrLevels },
        weight: { $gte: weightRange.min, $lte: weightRange.max },
      }).select("_id title transcript level duration weight");
    }

    /***********************************
     * SHADOWING
     ***********************************/
    if (allowedTypes.includes("shadowing")) {
      partResult.shadowings = await Shadowing.find({
        part_type: part,
        level: { $in: cefrLevels },
        weight: { $gte: weightRange.min, $lte: weightRange.max },
      }).select("_id title transcript level duration weight");
    }

    /***********************************
     * QUIZ
     ***********************************/
    if (allowedTypes.includes("quiz")) {
      partResult.quizzes = await Quiz.find({
        part_type: part,
        level: { $in: cefrLevels },
        weight: { $gte: weightRange.min, $lte: weightRange.max },
      }).select("_id title level weight planned_completion_time question_ids");
    }

    /***********************************
     * VOCABULARY (luôn có)
     ***********************************/
    partResult.vocab = await TopicVocabulary.find({
      part_type: part,
      level: { $in: cefrLevels },
    }).select("_id title description level iconName");

    /***********************************
     * STORE
     ***********************************/
    result[part] = partResult;
  }

  return result;
}

export function normalizeRetrieved(raw: any) {
  const result: any = {};

  for (const part of Object.keys(raw)) {
    const partNumber = Number(part);
    const block = raw[part];

    const ids = block.ids[0];
    const docs = block.documents[0];
    const metas = block.metadatas[0];

    result[partNumber] = ids.map((id: any, idx: any) => {
      const meta = metas[idx];
      const doc = docs[idx];

      return {
        part: meta.part_type,
        kind: meta.item_type, // quiz | lesson | dictation | vocab
        resource_id: meta.item_id, // real Mongo ObjectId
        level: meta.level,
        weight: meta.weight ?? 0,
        title: extractTitle(doc),
        estimated_time: estimateStudyTime(meta.item_type),
      };
    });
  }

  return result;
}

/************************************************************
 * NORMALIZE CANDIDATE ITEMS from getCandidateLearningItems
 * Chuyển đổi dữ liệu từ getCandidateLearningItems sang format
 * phù hợp với generateIRTWeeklyPlan
 ************************************************************/
export function normalizeCandidateItems(raw: Record<number, any>) {
  const result: Record<number, any[]> = {};

  for (let part = 1; part <= 7; part++) {
    const block = raw[part];
    if (!block) {
      result[part] = [];
      continue;
    }

    const items: any[] = [];

    // Lessons
    if (Array.isArray(block.lessons)) {
      for (const item of block.lessons) {
        items.push({
          part: item.part_type ?? part,
          kind: "lesson",
          resource_id: item._id?.toString(),
          level: item.level,
          weight: item.weight ?? 0,
          title: item.title ?? "",
          estimated_time: item.planned_completion_time ?? estimateStudyTime("lesson"),
        });
      }
    }

    // Dictations
    if (Array.isArray(block.dictations)) {
      for (const item of block.dictations) {
        items.push({
          part: part,
          kind: "dictation",
          resource_id: item._id?.toString(),
          level: item.level,
          weight: item.weight ?? 0,
          title: item.title ?? "",
          estimated_time: item.duration ?? estimateStudyTime("dictation"),
        });
      }
    }

    // Shadowings
    if (Array.isArray(block.shadowings)) {
      for (const item of block.shadowings) {
        items.push({
          part: part,
          kind: "shadowing",
          resource_id: item._id?.toString(),
          level: item.level,
          weight: item.weight ?? 0,
          title: item.title ?? "",
          estimated_time: item.duration ?? estimateStudyTime("shadowing"),
        });
      }
    }

    // Quizzes
    if (Array.isArray(block.quizzes)) {
      for (const item of block.quizzes) {
        items.push({
          part: part,
          kind: "quiz",
          resource_id: item._id?.toString(),
          level: item.level,
          weight: item.weight ?? 0,
          title: item.title ?? "",
          estimated_time: item.planned_completion_time ?? estimateStudyTime("quiz"),
        });
      }
    }

    // Vocabulary
    if (Array.isArray(block.vocab)) {
      for (const item of block.vocab) {
        items.push({
          part: part,
          kind: "vocab",
          resource_id: item._id?.toString(),
          level: item.level,
          weight: 0,
          title: item.title ?? item.description ?? "",
          estimated_time: estimateStudyTime("vocab"),
        });
      }
    }

    result[part] = items;
  }

  return result;
}

function extractTitle(doc: string) {
  const m = doc.match(/TITLE:\s*(.+)/);
  return m ? m[1].trim() : "";
}

function estimateStudyTime(kind: string) {
  switch (kind) {
    case "quiz":
      return 10;
    case "lesson":
      return 20;
    case "vocab":
      return 30;
    case "dictation":
      return 10;
    case "shadowing":
      return 15;
    default:
      return 10;
  }
}

function classifyPartsByTheta(thetaByPart: Record<number, number>) {
  const entries = Object.entries(thetaByPart).map(([part, theta]) => ({
    part: Number(part),
    theta: Number(theta),
  }));

  // sort tăng dần → yếu nhất đến mạnh nhất
  entries.sort((a, b) => a.theta - b.theta);

  const weak = entries.slice(0, 3).map((x) => x.part); // 2–3 part yếu nhất
  const medium = entries.slice(3, 5).map((x) => x.part);
  const strong = entries.slice(5).map((x) => x.part);

  return {
    weak_parts: weak,
    medium_parts: medium,
    strong_parts: strong,
    sorted_list: entries, // để debug
  };
}

export const generateIRTWeeklyPlanService = async (
  userId: string,
  testId: string,
  answers: {
    question_id: string;
    selectedOption: string;
  }[],
  duration: number,
  day_study_id?: string
) => {
  // Bước 0: Lấy dữ liệu cần thiết như thông tin user, tuần học hiện tại, thời gian hoàn thành...
  const infoLearningPathOfUser = await LearningPath.findOne({
    user_id: userId,
  }).lean();

  if (!infoLearningPathOfUser) {
    throw new Error("Learning path not found for user " + userId);
  }

  const userProfile = {
    user_id: userId,
    current_week: infoLearningPathOfUser.current_week,
    hours_per_day: infoLearningPathOfUser.time_per_day,
    study_days_per_week: infoLearningPathOfUser.days_per_week,
    target_score: infoLearningPathOfUser.target_score,
    target_date: infoLearningPathOfUser.target_completion_date,
  };

  // Bước 1: Tính điểm bài test
  const result = await submitMiniTestService(userId, testId, answers, duration);

  // Emit grading result immediately so frontend can show correct/incorrect per item
  try {
    emitToUser(userId, "mini_test_submitted", {
      step: "submitted",
      userTestId: result.userTestId,
      score: result.score,
      totalCorrect: result.totalCorrect,
      totalQuestions: result.totalQuestions,
      detailedAnswers: result.detailedAnswers,
      responses: result.responses,
    });
  } catch (err) {
    console.warn("Failed to emit mini_test_submitted after submit:", err);
  }

  if (!result) {
    throw new Error("Failed to submit mini test for user " + userId);
  }

  // Bước 2: Tính theta cho từng part bằng mô hình Rasch (1PL MLE)
  const abilities = calculateThetaRasch(result);

  // Emit abilities immediately after theta calculation (step 2)
  try {
    emitToUser(userId, "mini_test_abilities", {
      abilities: abilities,
    });
  } catch (err) {
    console.warn(
      "Failed to emit mini_test_abilities after calculateThetaRasch:",
      err
    );
  }

  if (!abilities) {
    throw new Error("Failed to calculate abilities for user " + userId);
  }

  // Bước 3: Tạo mini test cho tuần kế tiếp
  const miniTestNew = await generateNextWeekMiniTest(
    userId,
    abilities.thetaByPart
  );

  if (!miniTestNew) {
    throw new Error(
      "Failed to generate next week mini test for user " + userId
    );
  }

  // Bước 4: Lấy các bài học phù hợp với năng lực người dùng (theo theta từng part)
  const candidateItems = await getCandidateLearningItems(abilities.thetaByPart);

  if (!candidateItems) {
    throw new Error("Failed to get candidate learning items for user " + userId);
  }

  // Bước 5: Chuẩn hóa dữ liệu sang format phù hợp với generateIRTWeeklyPlan
  const normalized = normalizeCandidateItems(candidateItems);

  if (!normalized) {
    throw new Error("Failed to normalize retrieved items for user " + userId);
  }

  const minutesPerDay = userProfile?.hours_per_day || 0;

  const totalWeekMinutes =
    minutesPerDay * (userProfile?.study_days_per_week || 0);

  const weakMinutes = Math.round(totalWeekMinutes * 0.65);
  const mediumMinutes = Math.round(totalWeekMinutes * 0.25);
  const strongMinutes = Math.round(totalWeekMinutes * 0.1);

  // Bước 6: Tạo plan cho tuần kế tiếp
  const weeklyNextPlan = await generateIRTWeeklyPlan({
    userProfile,
    candidateItems: normalized,
    miniTest: miniTestNew,
    classifiedParts: classifyPartsByTheta(abilities.thetaByPart),
    timeConstraints: {
      totalWeekMinutes,
      weakMinutes,
      mediumMinutes,
      strongMinutes,
      minutesPerDayMin: minutesPerDay - 10,
      minutesPerDayMax: minutesPerDay,
    },
  });

  if (!weeklyNextPlan) {
    throw new Error("Failed to generate IRT weekly plan for user " + userId);
  }

  saveDebugFile(`irt_weekly_raw_plan_user_${userId}.json`, weeklyNextPlan);

  const weekly_data = weeklyNextPlan.json;

  // Bước 7: Map weekly_data -> WeekStudy & DayStudy

  // Xác định tuần tiếp theo
  const nextWeekNo = (infoLearningPathOfUser.current_week || 0) + 1;

  // Tạo WeekStudy mới
  const weekStudyDoc = await WeekStudy.create({
    no: nextWeekNo,
    description:
      weekly_data?.debug_log || `Week ${nextWeekNo} auto-generated by IRT`,
    status: WeekStudyStatus.IN_PROGRESS,
    accuracy_overall: 0,
    days: [],
  });

  const dayIds: Types.ObjectId[] = [];

  if (Array.isArray(weekly_data?.days)) {
    const totalDays = weekly_data.days.length;

    for (let dIdx = 0; dIdx < totalDays; dIdx++) {
      const day = weekly_data.days[dIdx];
      const dayIndex: number = day.day_index; // 1..7

      const isFirstDay = dayIndex === 1;
      const isLastDay = dIdx === totalDays - 1;

      // Chuẩn bị sessions từ plan
      const sessions = Array.isArray(day.sessions)
        ? day.sessions.map((session: any, sessionIdx: number) => {
          const partNum: number | null = session.part ?? null;

          const isFirstSession = isFirstDay && sessionIdx === 0;

          const items =
            Array.isArray(session.items) && session.items.length > 0
              ? session.items.map((it: any, itemIdx: number) => {
                let mappedKind: SessionType;

                switch (it.kind) {
                  case "dictation":
                    mappedKind = SessionType.DICTATION;
                    break;
                  case "shadowing":
                    mappedKind = SessionType.SHADOWING;
                    break;
                  case "quiz":
                    mappedKind = SessionType.QUIZ;
                    break;
                  case "lesson":
                    mappedKind = SessionType.LESSON;
                    break;
                  case "vocab":
                  default:
                    mappedKind = SessionType.FLASH_CARD;
                    break;
                }

                const isFirstItem = isFirstSession && itemIdx === 0;

                return {
                  kind: mappedKind,
                  activity_id: it.resource_id
                    ? new Types.ObjectId(it.resource_id)
                    : undefined,
                  status: isFirstItem
                    ? WeekStudyStatus.IN_PROGRESS
                    : WeekStudyStatus.LOCK,
                };
              })
              : [];

          return {
            session_no: session.session_no,
            status: isFirstSession
              ? WeekStudyStatus.IN_PROGRESS
              : WeekStudyStatus.LOCK,
            part_type: partNum,
            items,
          };
        })
        : [];

      // Bổ sung mini test vào session cuối của ngày cuối cùng
      if (isLastDay && miniTestNew && miniTestNew._id) {
        const lastSessionIndex = sessions.length > 0 ? sessions.length - 1 : 0;

        if (!sessions[lastSessionIndex]) {
          sessions[lastSessionIndex] = {
            session_no: lastSessionIndex + 1,
            status: WeekStudyStatus.LOCK,
            part_type: null,
            items: [],
          };
        }

        sessions[lastSessionIndex].items.push({
          kind: SessionType.MINI_TEST,
          activity_id: new Types.ObjectId(miniTestNew._id),
          status: WeekStudyStatus.LOCK,
        });
      }

      const dayDoc = await DayStudy.create({
        week_id: weekStudyDoc._id,
        dayOfWeek: dayIndex - 1, // map 1..7 -> 0..6
        status: isFirstDay ? WeekStudyStatus.IN_PROGRESS : WeekStudyStatus.LOCK,
        accuracy_overall: 0,
        sessions,
      });

      dayIds.push(dayDoc._id as any);
    }
  }

  weekStudyDoc.days = dayIds;
  await weekStudyDoc.save();

  await LearningPath.updateOne(
    { _id: infoLearningPathOfUser._id },
    {
      $set: {
        current_week: nextWeekNo,
      },
      $push: {
        week_study_ids: weekStudyDoc._id,
      },
    }
  );

  // Bước 8: Lưu các dữ liệu trên vô DB
  await updatedThetaInUserTestService(
    abilities.thetaByPart,
    abilities.thetaOverall,
    result.userTestId.toString()
  );
  await estimateThetaForUserTest2PL(result.userTestId.toString());
  await saveAbilityToDB(userId, testId, abilities);

  // 🐛 DEBUG: Save weekly plan to file
  saveDebugFile(`irt_weekly_plan_user_${userId}.json`, {
    userProfile,
    abilities: {
      thetaOverall: abilities.thetaOverall,
      thetaByPart: abilities.thetaByPart,
    },
    classifiedParts: classifyPartsByTheta(abilities.thetaByPart),
    weeklyPlan: weeklyNextPlan,
    miniTest: miniTestNew,
  });

  // Bước 9: Cập nhật streak (chuỗi ngày học liên tục)
  try {
    await updateUserStreak(new Types.ObjectId(userId));
  } catch (err) {
    console.warn("⚠️ Failed to update streak:", err);
  }

  // Bước 10: Auto unlock cascade (unlock activity tiếp theo trong learning path)
  let unlockResult: any = null;
  if (day_study_id) {
    try {
      unlockResult = await autoUnlockAfterComplete(
        new Types.ObjectId(userId),
        testId,
        SessionType.MINI_TEST,
        result.score,
        day_study_id
      );
      console.log("✅ Auto unlock result:", unlockResult);
    } catch (err) {
      console.warn("⚠️ Failed to auto unlock:", err);
    }
  }

  return {
    score: result.score,
    detailedAnswers: result.detailedAnswers,
    unlockResult,
  };
};
