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
 * PART ACTIVITY CONFIGURATION
 * Tỷ lệ % các loại activity phù hợp với đặc điểm từng Part
 * 
 * LISTENING (Part 1-4):
 *   - Part 1: Mô tả hình ảnh → Vocab + Dictation (nghe từ vựng mô tả)
 *   - Part 2: Hỏi đáp ngắn → Dictation + Shadowing (nghe câu hỏi ngắn)
 *   - Part 3: Hội thoại → Shadowing + Dictation + Lesson
 *   - Part 4: Bài nói độc thoại → Shadowing + Dictation + Lesson
 * 
 * READING (Part 5-7):
 *   - Part 5: Điền câu → Vocab + Lesson (ngữ pháp + từ vựng)
 *   - Part 6: Điền đoạn → Lesson + Vocab (đọc hiểu ngữ cảnh)
 *   - Part 7: Đọc hiểu dài → Lesson + Vocab
 ************************************************************/
const PART_ACTIVITY_CONFIG: Record<number, Record<string, number>> = {
  // Part 1: Listening - Mô tả hình ảnh → Vocab + Dictation
  1: { vocab: 0.40, dictation: 0.40, quiz: 0.20 },

  // Part 2: Listening - Hỏi đáp → Dictation + Shadowing
  2: { dictation: 0.50, shadowing: 0.30, quiz: 0.20 },

  // Part 3: Listening - Hội thoại → Shadowing + Dictation + Lesson
  3: { shadowing: 0.35, dictation: 0.30, lesson: 0.20, quiz: 0.15 },

  // Part 4: Listening - Bài nói → Shadowing + Dictation + Lesson
  4: { shadowing: 0.35, dictation: 0.30, lesson: 0.20, quiz: 0.15 },

  // Part 5: Reading - Điền câu → Vocab + Lesson (Grammar)
  5: { vocab: 0.40, lesson: 0.40, quiz: 0.20 },

  // Part 6: Reading - Điền đoạn → Lesson + Vocab
  6: { lesson: 0.50, vocab: 0.30, quiz: 0.20 },

  // Part 7: Reading - Đọc hiểu → Lesson + Vocab
  7: { lesson: 0.50, vocab: 0.30, quiz: 0.20 },
};

// Helper để lấy allowed types từ config
const CORE_TYPES_BY_PART: Record<number, string[]> = {
  1: Object.keys(PART_ACTIVITY_CONFIG[1]),
  2: Object.keys(PART_ACTIVITY_CONFIG[2]),
  3: Object.keys(PART_ACTIVITY_CONFIG[3]),
  4: Object.keys(PART_ACTIVITY_CONFIG[4]),
  5: Object.keys(PART_ACTIVITY_CONFIG[5]),
  6: Object.keys(PART_ACTIVITY_CONFIG[6]),
  7: Object.keys(PART_ACTIVITY_CONFIG[7]),
};

/************************************************************
 * WEEK SCHEDULE CONFIGURATION
 * Cấu hình phân bổ ngày học trong tuần
 ************************************************************/
const WEEK_SCHEDULE_CONFIG = {
  // Ngày 1-3: Weak parts (tập trung vào điểm yếu)
  weak_days: [1, 2, 3],
  weak_time_ratio: 0.65, // 65% thời gian tuần

  // Ngày 4-5: Medium parts
  medium_days: [4, 5],
  medium_time_ratio: 0.25, // 25% thời gian tuần

  // Ngày 6: Strong parts (ôn lại điểm mạnh)
  strong_days: [6],
  strong_time_ratio: 0.10, // 10% thời gian tuần

  // Ngày 7: Mini test only
  test_day: 7,
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
          estimated_time: estimateStudyTime("lesson"),
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
          estimated_time: estimateStudyTime("dictation"), // 10 phút
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
          estimated_time: estimateStudyTime("shadowing"), // 15 phút
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
          estimated_time: estimateStudyTime("quiz"),
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

/************************************************************
 * ==================== GREEDY SCHEDULER ====================
 * Thuật toán sắp xếp bài học vào tuần học - Không dùng LLM
 * 
 * DESIGN PRINCIPLES:
 * 1. Minh bạch: Mọi quyết định đều có metric
 * 2. Deterministic: Cùng input → cùng output
 * 3. Configurable: Dễ điều chỉnh tỷ lệ
 ************************************************************/

interface LearningItem {
  part: number;
  kind: string;
  resource_id: string;
  level: string;
  weight: number;
  estimated_time: number;
  title?: string;
}

interface SessionItem {
  kind: string;
  resource_id: string;
  estimated_time: number;
}

interface Session {
  session_no: number;
  part: number;
  items: SessionItem[];
  total_minutes: number;
}

interface DayPlan {
  day_index: number;
  day_type: "weak" | "medium" | "strong" | "test";
  parts_to_study: number[];
  sessions: Session[];
  total_minutes: number;
}

interface SchedulerMetrics {
  time_allocation: {
    weak_target: number;
    weak_actual: number;
    medium_target: number;
    medium_actual: number;
    strong_target: number;
    strong_actual: number;
  };
  daily_breakdown: {
    day_index: number;
    day_type: string;
    target_minutes: number;
    actual_minutes: number;
    parts_covered: number[];
    activities: Record<string, number>;
  }[];
  part_coverage: {
    part: number;
    group: string;
    total_minutes: number;
    sessions_count: number;
  }[];
  constraints_satisfied: boolean;
}

interface WeeklyPlanOutput {
  week_number: number;
  focus_parts: number[];
  days: DayPlan[];
  mini_test: {
    test_id: string;
    day_index: number;
    estimated_time: number;
  };
  metrics: SchedulerMetrics;
  debug_log: string;
}

interface ClassifiedParts {
  weak_parts: number[];
  medium_parts: number[];
  strong_parts: number[];
}

interface TimeConstraints {
  totalWeekMinutes: number;
  minutesPerDay: number;
  minutesPerDayMin: number;
  minutesPerDayMax: number;
}

/************************************************************
 * HELPER: Lấy items từ pool theo Part và Activity type
 ************************************************************/
function getItemsFromPool(
  pool: Record<number, LearningItem[]>,
  part: number,
  kind: string,
  usedIds: Set<string>
): LearningItem[] {
  const partItems = pool[part] || [];
  return partItems.filter(
    (item) => item.kind === kind && !usedIds.has(item.resource_id)
  );
}

/************************************************************
 * HELPER: Chọn items cho 1 Part theo tỷ lệ activity config
 ************************************************************/
function selectItemsForPart(
  pool: Record<number, LearningItem[]>,
  part: number,
  targetMinutes: number,
  usedIds: Set<string>
): { items: LearningItem[]; actualMinutes: number } {
  const config = PART_ACTIVITY_CONFIG[part];
  if (!config) {
    return { items: [], actualMinutes: 0 };
  }

  const selectedItems: LearningItem[] = [];
  let totalMinutes = 0;

  // Sắp xếp activities theo tỷ lệ giảm dần (ưu tiên activity chính)
  const sortedActivities = Object.entries(config).sort((a, b) => b[1] - a[1]);

  for (const [activityKind, ratio] of sortedActivities) {
    const targetForActivity = Math.round(targetMinutes * ratio);
    let minutesForActivity = 0;

    const availableItems = getItemsFromPool(pool, part, activityKind, usedIds);

    // Sắp xếp theo weight giảm dần (ưu tiên items quan trọng)
    availableItems.sort((a, b) => (b.weight || 0) - (a.weight || 0));

    for (const item of availableItems) {
      if (minutesForActivity >= targetForActivity) break;
      if (totalMinutes >= targetMinutes) break;

      selectedItems.push(item);
      usedIds.add(item.resource_id);
      minutesForActivity += item.estimated_time;
      totalMinutes += item.estimated_time;
    }
  }

  return { items: selectedItems, actualMinutes: totalMinutes };
}

/************************************************************
 * HELPER: Sắp xếp items trong session để đảm bảo đa dạng
 * Pattern: A-B-A hoặc A-B-C (không có A-A-A, A-A-B)
 ************************************************************/
function interleaveItems(items: LearningItem[]): LearningItem[] {
  if (items.length <= 2) return items;

  // Nhóm theo kind
  const byKind: Record<string, LearningItem[]> = {};
  for (const item of items) {
    if (!byKind[item.kind]) byKind[item.kind] = [];
    byKind[item.kind].push(item);
  }

  const result: LearningItem[] = [];
  const kinds = Object.keys(byKind);
  let lastKind = "";
  let lastLastKind = "";

  while (Object.values(byKind).some((arr) => arr.length > 0)) {
    // Tìm kind khác với 2 kind trước đó
    let selectedKind = kinds.find(
      (k) => k !== lastKind && k !== lastLastKind && byKind[k].length > 0
    );

    // Fallback: khác lastKind
    if (!selectedKind) {
      selectedKind = kinds.find((k) => k !== lastKind && byKind[k].length > 0);
    }

    // Fallback cuối: bất kỳ kind nào còn
    if (!selectedKind) {
      selectedKind = kinds.find((k) => byKind[k].length > 0);
    }

    if (!selectedKind) break;

    result.push(byKind[selectedKind].shift()!);
    lastLastKind = lastKind;
    lastKind = selectedKind;
  }

  return result;
}

/************************************************************
 * HELPER: Tính độ ưu tiên của Item (Sư phạm)
 * Cao → Thấp: Lesson > Dictation/Shadowing > Vocab > Quiz
 * Cộng thêm điểm Weight
 ************************************************************/
function getItemPriority(item: LearningItem): number {
  let typeScore = 0;
  switch (item.kind) {
    case "lesson":
      typeScore = 5;
      break; // Lý thuyết là quan trọng nhất
    case "dictation":
    case "shadowing":
      typeScore = 4;
      break; // Kỹ năng thực hành
    case "vocab":
      typeScore = 3;
      break; // Từ vựng nền tảng
    case "quiz":
      typeScore = 2;
      break; // Kiểm tra (có thể giảm bớt nếu thiếu giờ)
    default:
      typeScore = 1;
  }
  // Weight (0.1 -> 1.0) * 10 => 1 -> 10 điểm
  // Tổng score ~ 2 -> 15
  return typeScore + (item.weight || 0) * 10;
}

/************************************************************
 * Tạo kế hoạch học cho 1 ngày (có tối ưu thời gian loop)
 ************************************************************/
function createDayPlan(
  pool: Record<number, LearningItem[]>,
  dayIndex: number,
  dayType: "weak" | "medium" | "strong" | "test",
  partsToStudy: number[],
  targetMinutes: number,
  usedIds: Set<string>
): DayPlan {
  if (dayType === "test") {
    return {
      day_index: dayIndex,
      day_type: dayType,
      parts_to_study: [],
      sessions: [],
      total_minutes: 0,
    };
  }

  // Phân bổ sơ bộ ban đầu
  let dayItems: { part: number; item: LearningItem }[] = [];
  const minutesPerPart = Math.floor(
    targetMinutes / Math.max(partsToStudy.length, 1)
  );

  for (const part of partsToStudy) {
    // Fill to approx minutesPerPart
    const { items } = selectItemsForPart(pool, part, minutesPerPart, usedIds);
    items.forEach((item) => dayItems.push({ part, item }));
  }

  // === OPTIMIZATION LOOP (+- 20 mins) ===
  const minTarget = targetMinutes - 20;
  const maxTarget = targetMinutes + 20;
  let currentTotal = dayItems.reduce(
    (sum, x) => sum + x.item.estimated_time,
    0
  );
  let iteration = 0;
  const MAX_ITER = 15;

  while (
    (currentTotal < minTarget || currentTotal > maxTarget) &&
    iteration < MAX_ITER
  ) {
    iteration++;

    if (currentTotal > maxTarget) {
      // Case: DƯ THỜI GIAN -> Cắt giảm bài
      // Chiến thuật: Bỏ bài có priority thấp nhất (Quiz, Vocab weight thấp...)
      dayItems.sort(
        (a, b) => getItemPriority(a.item) - getItemPriority(b.item)
      ); // Tăng dần (thấp xếp trước)

      const removed = dayItems.shift(); // Lấy thằng thấp nhất ra
      if (removed) {
        usedIds.delete(removed.item.resource_id); // Trả lại pool (cho phép dùng ở ngày khác nếu cần)
        currentTotal -= removed.item.estimated_time;
      } else {
        break; // Hết bài để xóa
      }
    } else if (currentTotal < minTarget) {
      // Case: THIẾU THỜI GIAN -> Thêm bài
      // Chiến thuật: Tìm trong pool của các Parts cần học hôm nay, lấy bài Priority cao nhất chưa học
      let candidates: { part: number; item: LearningItem }[] = [];

      for (const part of partsToStudy) {
        const partPool = pool[part] || [];
        partPool.forEach((pItem) => {
          if (!usedIds.has(pItem.resource_id)) {
            candidates.push({ part, item: pItem });
          }
        });
      }

      // Sắp xếp giảm dần priority (cao xếp trước)
      candidates.sort(
        (a, b) => getItemPriority(b.item) - getItemPriority(a.item)
      );

      // Tìm ứng viên phù hợp (không làm tràn time quá mức)
      // Cho phép tràn nhẹ (maxTarget) nhưng ko quá lố
      let bestCandidate = null;
      for (const cand of candidates) {
        if (currentTotal + cand.item.estimated_time <= maxTarget + 10) {
          bestCandidate = cand;
          break;
        }
      }

      if (bestCandidate) {
        dayItems.push(bestCandidate);
        usedIds.add(bestCandidate.item.resource_id);
        currentTotal += bestCandidate.item.estimated_time;
      } else {
        break; // Không còn bài nào vừa vặn
      }
    }
  }

  // === RECONSTRUCT SESSIONS ===
  // Group lại theo Part để hiển thị đúng cấu trúc
  const sessions: Session[] = [];
  const itemsByPart: Record<number, LearningItem[]> = {};

  for (const entry of dayItems) {
    if (!itemsByPart[entry.part]) itemsByPart[entry.part] = [];
    itemsByPart[entry.part].push(entry.item);
  }

  let sessionNo = 1;
  // Duyệt theo thứ tự ưu tiên partsToStudy
  for (const part of partsToStudy) {
    const items = itemsByPart[part] || [];
    if (items.length === 0) continue;

    const orderedItems = interleaveItems(items);
    sessions.push({
      session_no: sessionNo++,
      part,
      items: orderedItems.map((item) => ({
        kind: item.kind,
        resource_id: item.resource_id,
        estimated_time: item.estimated_time,
      })),
      total_minutes: items.reduce((s, i) => s + i.estimated_time, 0),
    });
  }

  return {
    day_index: dayIndex,
    day_type: dayType,
    parts_to_study: partsToStudy,
    sessions,
    total_minutes: currentTotal,
  };
}

/************************************************************
 * Tính metrics cho kế hoạch
 ************************************************************/
function calculateSchedulerMetrics(
  days: DayPlan[],
  classifiedParts: ClassifiedParts,
  totalWeekMinutes: number,
  minutesPerDay: number
): SchedulerMetrics {
  const { weak_parts, medium_parts, strong_parts } = classifiedParts;

  // Tính thời gian theo group
  let weakActual = 0;
  let mediumActual = 0;
  let strongActual = 0;

  const partMinutes: Record<number, number> = {};
  const partSessions: Record<number, number> = {};

  for (const day of days) {
    for (const session of day.sessions) {
      const part = session.part;
      const minutes = session.total_minutes;

      // Cộng vào part
      partMinutes[part] = (partMinutes[part] || 0) + minutes;
      partSessions[part] = (partSessions[part] || 0) + 1;

      // Cộng vào group
      if (weak_parts.includes(part)) weakActual += minutes;
      else if (medium_parts.includes(part)) mediumActual += minutes;
      else if (strong_parts.includes(part)) strongActual += minutes;
    }
  }

  // Tính targets
  const weakTarget = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.weak_time_ratio);
  const mediumTarget = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.medium_time_ratio);
  const strongTarget = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.strong_time_ratio);

  // Daily breakdown
  const dailyBreakdown = days.map((day) => {
    const activities: Record<string, number> = {};
    for (const session of day.sessions) {
      for (const item of session.items) {
        activities[item.kind] = (activities[item.kind] || 0) + item.estimated_time;
      }
    }

    return {
      day_index: day.day_index,
      day_type: day.day_type,
      target_minutes: minutesPerDay,
      actual_minutes: day.total_minutes,
      parts_covered: day.parts_to_study,
      activities,
    };
  });

  // Part coverage
  const allParts = [...weak_parts, ...medium_parts, ...strong_parts];
  const partCoverage = allParts.map((part) => ({
    part,
    group: weak_parts.includes(part)
      ? "weak"
      : medium_parts.includes(part)
        ? "medium"
        : "strong",
    total_minutes: partMinutes[part] || 0,
    sessions_count: partSessions[part] || 0,
  }));

  // Constraints check
  const constraintsSatisfied =
    weakActual >= weakTarget * 0.8 && // Cho phép sai số 20%
    allParts.every((p) => (partMinutes[p] || 0) > 0); // Tất cả parts đều có

  return {
    time_allocation: {
      weak_target: weakTarget,
      weak_actual: weakActual,
      medium_target: mediumTarget,
      medium_actual: mediumActual,
      strong_target: strongTarget,
      strong_actual: strongActual,
    },
    daily_breakdown: dailyBreakdown,
    part_coverage: partCoverage,
    constraints_satisfied: constraintsSatisfied,
  };
}

/************************************************************
 * Format metrics report (debug)
 ************************************************************/
function formatMetricsReport(metrics: SchedulerMetrics, weekNumber: number): string {
  const { time_allocation, daily_breakdown, part_coverage, constraints_satisfied } = metrics;

  let report = `
╔══════════════════════════════════════════════════════════════╗
║     📊 WEEK ${weekNumber} - GREEDY SCHEDULER METRICS REPORT          ║
╠══════════════════════════════════════════════════════════════╣
║ ⏱️  TIME ALLOCATION                                          ║
╠──────────────────────────────────────────────────────────────╣
║  Weak Parts:   ${String(time_allocation.weak_actual).padStart(3)}/${String(time_allocation.weak_target).padStart(3)} min  (target: 65%)           ║
║  Medium Parts: ${String(time_allocation.medium_actual).padStart(3)}/${String(time_allocation.medium_target).padStart(3)} min  (target: 25%)           ║
║  Strong Parts: ${String(time_allocation.strong_actual).padStart(3)}/${String(time_allocation.strong_target).padStart(3)} min  (target: 10%)           ║
╠══════════════════════════════════════════════════════════════╣
║ 📅 DAILY BREAKDOWN                                           ║
╠──────────────────────────────────────────────────────────────╣`;

  for (const day of daily_breakdown) {
    const actStr = Object.entries(day.activities)
      .map(([k, v]) => `${k}:${v}m`)
      .join(", ") || "mini-test only";
    report += `
║  Day ${day.day_index} [${day.day_type.padEnd(6)}]: ${String(day.actual_minutes).padStart(3)}/${String(day.target_minutes).padStart(3)} min | Parts: [${day.parts_covered.join(",") || "-"}]
║    └─ ${actStr}`;
  }

  report += `
╠══════════════════════════════════════════════════════════════╣
║ 📈 PART COVERAGE                                             ║
╠──────────────────────────────────────────────────────────────╣`;

  for (const pc of part_coverage) {
    report += `
║  Part ${pc.part} [${pc.group.padEnd(6)}]: ${String(pc.total_minutes).padStart(3)} min | ${pc.sessions_count} sessions`;
  }

  report += `
╠══════════════════════════════════════════════════════════════╣
║ ✅ CONSTRAINTS: ${constraints_satisfied ? "ALL SATISFIED ✓" : "SOME VIOLATED ✗"}                        ║
╚══════════════════════════════════════════════════════════════╝`;

  return report;
}

/************************************************************
 * 🎯 MAIN FUNCTION: Tạo kế hoạch tuần học bằng Greedy Algorithm
 * 
 * LOGIC MỚI (Continuous Fill):
 * - Tổng thời gian tuần = (study_days - 1) * minutesPerDay (trừ ngày test)
 * - Weak time = tổng * 65%, Medium = 25%, Strong = 10%
 * - Fill liên tục: Weak → Medium → Strong
 * - 1 ngày có thể học 2 nhóm nếu hết thời gian nhóm trước
 ************************************************************/
function generateWeeklyPlanGreedy(input: {
  userProfile: {
    current_week: number;
    study_days_per_week: number;
  };
  candidateItems: Record<number, LearningItem[]>;
  miniTest: { _id: any; estimated_time?: number };
  classifiedParts: ClassifiedParts;
  timeConstraints: TimeConstraints;
}): WeeklyPlanOutput {
  const {
    userProfile,
    candidateItems,
    miniTest,
    classifiedParts,
    timeConstraints,
  } = input;

  const { weak_parts, medium_parts, strong_parts } = classifiedParts;
  const { minutesPerDay } = timeConstraints;
  const studyDays = userProfile.study_days_per_week || 7;

  // Track used items (mỗi item chỉ dùng 1 lần/tuần)
  const usedIds = new Set<string>();

  // Deep clone pool để không ảnh hưởng input
  const pool: Record<number, LearningItem[]> = {};
  for (const part of Object.keys(candidateItems)) {
    pool[Number(part)] = [...(candidateItems[Number(part)] || [])];
  }

  // === TÍNH THỜI GIAN THEO LOGIC MỚI ===
  // Ngày cuối (test_day) chỉ làm mini test, không tính vào thời gian học
  const actualStudyDays = studyDays - 1; // 6 ngày học thực
  const totalWeekMinutes = actualStudyDays * minutesPerDay;

  // Phân bổ thời gian theo tỷ lệ
  const weakTotalMinutes = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.weak_time_ratio);
  const mediumTotalMinutes = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.medium_time_ratio);
  const strongTotalMinutes = Math.round(totalWeekMinutes * WEEK_SCHEDULE_CONFIG.strong_time_ratio);

  console.log("🎯 Time Budget (Continuous Fill Logic):", {
    totalWeekMinutes,
    weakBudget: weakTotalMinutes,
    mediumBudget: mediumTotalMinutes,
    strongBudget: strongTotalMinutes,
    minutesPerDay,
    actualStudyDays,
  });

  // === CHUẨN BỊ QUEUE CÁC NHÓM ===
  // Mỗi nhóm có: parts, remainingMinutes, type
  const groupQueue: {
    type: "weak" | "medium" | "strong";
    parts: number[];
    remainingMinutes: number;
  }[] = [
    { type: "weak", parts: weak_parts, remainingMinutes: weakTotalMinutes },
    { type: "medium", parts: medium_parts, remainingMinutes: mediumTotalMinutes },
    { type: "strong", parts: strong_parts, remainingMinutes: strongTotalMinutes },
  ];

  const days: DayPlan[] = [];
  let currentGroupIndex = 0;

  // === FILL TỪNG NGÀY (1 → actualStudyDays) ===
  for (let dayIndex = 1; dayIndex <= actualStudyDays; dayIndex++) {
    const daySessions: Session[] = [];
    let dayTotalMinutes = 0;
    const dayTarget = minutesPerDay;
    const minTarget = dayTarget - 20;
    const maxTarget = dayTarget + 20;

    const partsStudiedToday: number[] = [];
    let dayType: "weak" | "medium" | "strong" = "weak";

    // Fill ngày này đến khi đủ ~minutesPerDay
    while (dayTotalMinutes < minTarget && currentGroupIndex < groupQueue.length) {
      const currentGroup = groupQueue[currentGroupIndex];
      dayType = currentGroup.type; // Ngày sẽ mang type của group chính

      // Tính thời gian còn có thể fill cho group này trong ngày này
      const remainingDayBudget = dayTarget - dayTotalMinutes;
      const groupBudgetForToday = Math.min(
        currentGroup.remainingMinutes,
        remainingDayBudget
      );

      if (groupBudgetForToday <= 0) {
        // Hết budget cho group này, chuyển sang group tiếp theo
        currentGroupIndex++;
        continue;
      }

      // === CHỌN ITEMS TỪ PARTS CỦA GROUP NÀY ===
      const partsForGroup = currentGroup.parts;
      const minutesPerPart = Math.floor(
        groupBudgetForToday / Math.max(partsForGroup.length, 1)
      );

      let groupMinutesUsed = 0;

      for (const part of partsForGroup) {
        if (groupMinutesUsed >= groupBudgetForToday) break;
        if (dayTotalMinutes >= maxTarget) break;

        const partBudget = Math.min(
          minutesPerPart,
          groupBudgetForToday - groupMinutesUsed,
          maxTarget - dayTotalMinutes
        );

        const { items, actualMinutes } = selectItemsForPart(
          pool,
          part,
          partBudget,
          usedIds
        );

        if (items.length > 0) {
          const orderedItems = interleaveItems(items);

          // Tìm session đã có cho part này trong ngày (nếu có)
          let existingSession = daySessions.find((s) => s.part === part);
          if (existingSession) {
            // Thêm vào session đã có
            existingSession.items.push(
              ...orderedItems.map((item) => ({
                kind: item.kind,
                resource_id: item.resource_id,
                estimated_time: item.estimated_time,
              }))
            );
            existingSession.total_minutes += actualMinutes;
          } else {
            // Tạo session mới
            daySessions.push({
              session_no: daySessions.length + 1,
              part,
              items: orderedItems.map((item) => ({
                kind: item.kind,
                resource_id: item.resource_id,
                estimated_time: item.estimated_time,
              })),
              total_minutes: actualMinutes,
            });
          }

          if (!partsStudiedToday.includes(part)) {
            partsStudiedToday.push(part);
          }

          groupMinutesUsed += actualMinutes;
          dayTotalMinutes += actualMinutes;
        }
      }

      // Trừ thời gian đã dùng khỏi budget của group
      currentGroup.remainingMinutes -= groupMinutesUsed;

      // Nếu group hết budget, chuyển sang group tiếp theo
      if (currentGroup.remainingMinutes <= 0) {
        currentGroupIndex++;
      }
    }

    // === OPTIMIZATION LOOP: Điều chỉnh +-20 phút ===
    let iteration = 0;
    const MAX_ITER = 10;

    while (
      (dayTotalMinutes < minTarget || dayTotalMinutes > maxTarget) &&
      iteration < MAX_ITER
    ) {
      iteration++;

      if (dayTotalMinutes > maxTarget) {
        // Dư giờ -> Bỏ bài priority thấp nhất
        let allItems: { sessionIdx: number; itemIdx: number; item: SessionItem; priority: number }[] = [];

        daySessions.forEach((session, sIdx) => {
          session.items.forEach((item, iIdx) => {
            allItems.push({
              sessionIdx: sIdx,
              itemIdx: iIdx,
              item,
              priority: getItemPriorityByKind(item.kind),
            });
          });
        });

        // Sắp xếp tăng dần priority (thấp nhất trước)
        allItems.sort((a, b) => a.priority - b.priority);

        if (allItems.length > 0) {
          const toRemove = allItems[0];
          const session = daySessions[toRemove.sessionIdx];
          session.items.splice(toRemove.itemIdx, 1);
          session.total_minutes -= toRemove.item.estimated_time;
          dayTotalMinutes -= toRemove.item.estimated_time;

          // Trả lại item cho pool (để có thể dùng ngày khác)
          usedIds.delete(toRemove.item.resource_id);

          // Xóa session rỗng
          if (session.items.length === 0) {
            daySessions.splice(toRemove.sessionIdx, 1);
          }
        } else {
          break;
        }
      } else if (dayTotalMinutes < minTarget) {
        // Thiếu giờ -> Thêm bài
        let bestCandidate: { part: number; item: LearningItem } | null = null;
        let bestPriority = -1;

        // Tìm trong các parts đã học hôm nay
        for (const part of partsStudiedToday) {
          const partPool = pool[part] || [];
          for (const pItem of partPool) {
            if (!usedIds.has(pItem.resource_id)) {
              const priority = getItemPriority(pItem);
              if (
                priority > bestPriority &&
                dayTotalMinutes + pItem.estimated_time <= maxTarget + 10
              ) {
                bestCandidate = { part, item: pItem };
                bestPriority = priority;
              }
            }
          }
        }

        if (bestCandidate) {
          usedIds.add(bestCandidate.item.resource_id);
          dayTotalMinutes += bestCandidate.item.estimated_time;

          // Thêm vào session của part tương ứng
          let session = daySessions.find((s) => s.part === bestCandidate!.part);
          if (session) {
            session.items.push({
              kind: bestCandidate.item.kind,
              resource_id: bestCandidate.item.resource_id,
              estimated_time: bestCandidate.item.estimated_time,
            });
            session.total_minutes += bestCandidate.item.estimated_time;
          }
        } else {
          break;
        }
      }
    }

    // Đánh lại session_no
    daySessions.forEach((s, idx) => {
      s.session_no = idx + 1;
    });

    // Xác định day_type dựa trên phần lớn thời gian học
    const timeByType: Record<string, number> = { weak: 0, medium: 0, strong: 0 };
    for (const session of daySessions) {
      const part = session.part;
      if (weak_parts.includes(part)) timeByType.weak += session.total_minutes;
      else if (medium_parts.includes(part)) timeByType.medium += session.total_minutes;
      else if (strong_parts.includes(part)) timeByType.strong += session.total_minutes;
    }
    const dominantType = (Object.entries(timeByType).sort((a, b) => b[1] - a[1])[0]?.[0] || "weak") as "weak" | "medium" | "strong";

    days.push({
      day_index: dayIndex,
      day_type: dominantType,
      parts_to_study: partsStudiedToday,
      sessions: daySessions,
      total_minutes: dayTotalMinutes,
    });
  }

  // === NGÀY CUỐI: MINI TEST ONLY ===
  days.push({
    day_index: studyDays,
    day_type: "test",
    parts_to_study: [],
    sessions: [],
    total_minutes: 0,
  });

  // === TÍNH METRICS ===
  const metrics = calculateSchedulerMetrics(
    days,
    classifiedParts,
    totalWeekMinutes,
    minutesPerDay
  );

  const weekNumber = userProfile.current_week + 1;
  const debugLog = formatMetricsReport(metrics, weekNumber);

  // Log metrics to console
  console.log(debugLog);

  // ===== BUILD OUTPUT =====
  return {
    week_number: weekNumber,
    focus_parts: weak_parts,
    days,
    mini_test: {
      test_id: miniTest._id?.toString() || "",
      day_index: studyDays,
      estimated_time: miniTest.estimated_time || 30,
    },
    metrics,
    debug_log: debugLog,
  };
}

/************************************************************
 * HELPER: Tính priority chỉ từ kind (dùng cho SessionItem)
 ************************************************************/
function getItemPriorityByKind(kind: string): number {
  switch (kind) {
    case "lesson":
      return 5;
    case "dictation":
    case "shadowing":
      return 4;
    case "vocab":
      return 3;
    case "quiz":
      return 2;
    default:
      return 1;
  }
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

  // Bước 6: Tạo plan cho tuần kế tiếp bằng GREEDY ALGORITHM (không dùng LLM)
  const weeklyNextPlan = generateWeeklyPlanGreedy({
    userProfile: {
      current_week: userProfile.current_week || 0,
      study_days_per_week: userProfile.study_days_per_week || 7,
    },
    candidateItems: normalized as Record<number, LearningItem[]>,
    miniTest: miniTestNew,
    classifiedParts: classifyPartsByTheta(abilities.thetaByPart),
    timeConstraints: {
      totalWeekMinutes,
      minutesPerDay,
      minutesPerDayMin: minutesPerDay - 10,
      minutesPerDayMax: minutesPerDay + 10,
    },
  });

  if (!weeklyNextPlan) {
    throw new Error("Failed to generate IRT weekly plan for user " + userId);
  }

  saveDebugFile(`irt_weekly_raw_plan_user_${userId}.json`, weeklyNextPlan);

  // weekly_data giờ là output từ Greedy (không cần .json)
  const weekly_data = weeklyNextPlan;

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
