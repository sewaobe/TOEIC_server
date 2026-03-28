/**
 * 🎯 Script: Tạo dữ liệu mẫu (fake) cho user_test
 *
 * Mục đích: Tạo 1000 kết quả làm bài cho mỗi test (5 tests)
 * => Tổng cộng 5000 records user_test
 *
 * Test IDs:
 * - 68af86121918226d4c424fa6
 * - 68af86fb1918226d4c4250cd
 * - 68af87d21918226d4c4251c8
 * - 68af88ca1918226d4c4252b9
 * - 68af851b1918226d4c424e7f
 */

import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import {
  Test,
  Group,
  User,
  UserTest,
  Role,
} from "../models";

// ============ CẤU HÌNH ============
const TEST_IDS = [
  "68af86121918226d4c424fa6",
  "68af86fb1918226d4c4250cd",
  "68af87d21918226d4c4251c8",
  "68af88ca1918226d4c4252b9",
  "68af851b1918226d4c424e7f",
];

const RECORDS_PER_TEST = 1000;

// ============ HELPER FUNCTIONS ============

/**
 * Sinh số ngẫu nhiên theo phân phối chuẩn (Gaussian)
 * Giúp dữ liệu có tính tự nhiên hơn
 */
function gaussianRandom(mean: number, stdDev: number): number {
  let u1 = Math.random();
  let u2 = Math.random();
  // Box-Muller transform
  let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Giới hạn giá trị trong khoảng [min, max]
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Sinh accuracy ngẫu nhiên cho một "profile" người dùng
 * - Weak: 30-50%
 * - Average: 50-70%
 * - Strong: 70-90%
 * - Random: 30-90%
 */
function getProfileAccuracy(
  profile: "weak" | "average" | "strong" | "random"
): number {
  switch (profile) {
    case "weak":
      return gaussianRandom(40, 10);
    case "average":
      return gaussianRandom(60, 10);
    case "strong":
      return gaussianRandom(80, 8);
    case "random":
    default:
      return Math.random() * 60 + 30; // 30-90%
  }
}

/**
 * Chọn đáp án dựa trên accuracy
 * @param correctAnswer Đáp án đúng
 * @param choices Các lựa chọn
 * @param targetAccuracy Tỷ lệ đúng mong muốn (0-100)
 */
function selectAnswer(
  correctAnswer: string,
  choices: string[],
  targetAccuracy: number
): { selected: string; isCorrect: boolean } {
  const rand = Math.random() * 100;

  if (rand < targetAccuracy) {
    return { selected: correctAnswer, isCorrect: true };
  } else {
    // Chọn đáp án sai ngẫu nhiên
    const wrongChoices = choices.filter((c) => c !== correctAnswer);
    if (wrongChoices.length === 0) {
      return { selected: correctAnswer, isCorrect: true };
    }
    const wrongAnswer =
      wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
    return { selected: wrongAnswer, isCorrect: false };
  }
}

/**
 * Sinh thời gian làm bài ngẫu nhiên (giây)
 * TOEIC Full Test: 120 phút = 7200 giây
 * Range thực tế: 60-120 phút (3600-7200 giây)
 */
function generateDuration(): number {
  // Phân phối chuẩn với trung bình 100 phút, stdDev 15 phút
  const minutes = gaussianRandom(100, 15);
  const clampedMinutes = clamp(minutes, 60, 120);
  return Math.floor(clampedMinutes * 60);
}

/**
 * Sinh ngày submit ngẫu nhiên trong 6 tháng gần đây
 */
function generateSubmitDate(): Date {
  const now = Date.now();
  const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
  const randomTime = Math.random() * (now - sixMonthsAgo) + sixMonthsAgo;
  return new Date(randomTime);
}

/**
 * Tính điểm TOEIC dựa trên số câu đúng
 * TOEIC có 200 câu, điểm tối đa 990 (Listening 495 + Reading 495)
 */
function calculateToeicScore(
  listeningCorrect: number,
  listeningTotal: number,
  readingCorrect: number,
  readingTotal: number
): { listening: number; reading: number; total: number } {
  // Scale điểm: Mỗi phần có 495 điểm tối đa
  // Công thức ước lượng: điểm = (số đúng / tổng) * 495

  // Listening: Part 1-4 (thường 100 câu)
  const listeningScore = Math.round((listeningCorrect / listeningTotal) * 495);

  // Reading: Part 5-7 (thường 100 câu)
  const readingScore = Math.round((readingCorrect / readingTotal) * 495);

  return {
    listening: clamp(listeningScore, 5, 495),
    reading: clamp(readingScore, 5, 495),
    total: clamp(listeningScore + readingScore, 10, 990),
  };
}

// ============ MAIN FUNCTIONS ============

interface QuestionInfo {
  _id: Types.ObjectId;
  correctAnswer: string;
  choices: string[];
  part: number;
}

/**
 * Lấy tất cả questions của một test với thông tin part
 */
async function getTestQuestions(testId: string): Promise<QuestionInfo[]> {
  const test = await Test.findById(testId).populate("groups").lean();
  if (!test) {
    throw new Error(`Test ${testId} not found`);
  }

  const groups = await Group.find({
    _id: { $in: test.groups },
  })
    .populate("questions")
    .lean();

  const questions: QuestionInfo[] = [];

  for (const group of groups) {
    const part = group.part || 0;
    for (const q of group.questions as any[]) {
      // Get choices keys (A, B, C, D)
      const choiceKeys: string[] =
        q.choices instanceof Map
          ? (Array.from(q.choices.keys()) as string[])
          : Object.keys(q.choices || {});

      questions.push({
        _id: q._id,
        correctAnswer: q.correctAnswer || "A",
        choices: choiceKeys.length > 0 ? choiceKeys : ["A", "B", "C", "D"],
        part: part,
      });
    }
  }

  return questions;
}

/**
 * Tìm một user với role student
 */
async function findStudentUser(): Promise<Types.ObjectId> {
  // Tìm role student
  const studentRole = await Role.findOne({ name: "student" }).lean();
  if (!studentRole) {
    throw new Error("Student role not found in database");
  }

  // Tìm user với role student
  const student = await User.findOne({ role_id: studentRole._id }).lean();
  if (!student) {
    throw new Error("No student user found in database");
  }

  console.log(`✅ Found student user: ${student.email} (${student._id})`);
  return student._id;
}

/**
 * Sinh một record user_test hoàn chỉnh
 */
function generateUserTestRecord(
  userId: Types.ObjectId,
  testId: Types.ObjectId,
  questions: QuestionInfo[]
): any {
  // Chọn profile ngẫu nhiên cho user này
  const profiles: ("weak" | "average" | "strong" | "random")[] = [
    "weak",
    "average",
    "strong",
    "random",
  ];
  const profile = profiles[Math.floor(Math.random() * profiles.length)];

  // Tạo accuracy cho từng part (có biến động)
  const partAccuracies: Record<number, number> = {};
  for (let p = 1; p <= 7; p++) {
    // Mỗi part có accuracy riêng với một chút biến động từ profile chính
    const baseAccuracy = getProfileAccuracy(profile);
    partAccuracies[p] = clamp(
      baseAccuracy + (Math.random() - 0.5) * 20,
      10,
      95
    );
  }

  // Sinh answers
  const answers: {
    question_id: Types.ObjectId;
    selectedOption: string;
    isCorrect: boolean;
  }[] = [];
  const partStats: Record<number, { correct: number; total: number }> = {};

  for (const q of questions) {
    const part = q.part || 1;
    const accuracy = partAccuracies[part] || 50;

    const { selected, isCorrect } = selectAnswer(
      q.correctAnswer,
      q.choices,
      accuracy
    );

    answers.push({
      question_id: q._id,
      selectedOption: selected,
      isCorrect: isCorrect,
    });

    // Track stats per part
    if (!partStats[part]) {
      partStats[part] = { correct: 0, total: 0 };
    }
    partStats[part].total++;
    if (isCorrect) {
      partStats[part].correct++;
    }
  }

  // Tính parts accuracy
  const parts = Object.entries(partStats).map(([part, stats]) => ({
    part_name: `Part ${part}`,
    accuracy:
      stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
  }));

  // Tính điểm TOEIC
  const listeningParts = [1, 2, 3, 4];
  const readingParts = [5, 6, 7];

  let listeningCorrect = 0,
    listeningTotal = 0;
  let readingCorrect = 0,
    readingTotal = 0;

  for (const [part, stats] of Object.entries(partStats)) {
    const partNum = parseInt(part);
    if (listeningParts.includes(partNum)) {
      listeningCorrect += stats.correct;
      listeningTotal += stats.total;
    } else if (readingParts.includes(partNum)) {
      readingCorrect += stats.correct;
      readingTotal += stats.total;
    }
  }

  const { total: score } = calculateToeicScore(
    listeningCorrect,
    listeningTotal || 1,
    readingCorrect,
    readingTotal || 1
  );

  // Completed parts
  const completedPartsSet = new Set(
    questions.map((q) => q.part).filter((p) => p > 0)
  );
  const completedPart = Array.from(completedPartsSet)
    .sort((a, b) => a - b)
    .map((p) => `Part ${p}`)
    .join(",");

  return {
    user_id: userId,
    test_id: testId,
    score: score,
    answers: answers,
    parts: parts,
    completedPart: completedPart,
    duration: generateDuration(),
    submit_at: generateSubmitDate(),
  };
}

/**
 * Chạy seed cho tất cả tests
 */
async function seedUserTests() {
  const MONGO =
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/toeic-db";

  console.log("🔗 Connecting to MongoDB...");
  await mongoose.connect(MONGO);
  console.log("✅ Connected to MongoDB:", MONGO);

  try {
    // 1. Tìm student user
    const userId = await findStudentUser();

    // 2. Verify test IDs exist
    console.log("\n📋 Verifying test IDs...");
    for (const testId of TEST_IDS) {
      const test = await Test.findById(testId).lean();
      if (!test) {
        console.error(`❌ Test ${testId} NOT FOUND`);
        throw new Error(`Test ${testId} not found`);
      }
      console.log(`  ✓ ${testId}: "${test.title}"`);
    }

    // 3. Seed data cho từng test
    let totalCreated = 0;

    for (const testId of TEST_IDS) {
      console.log(`\n🎯 Processing test: ${testId}`);

      // Lấy questions
      const questions = await getTestQuestions(testId);
      console.log(`   📝 Found ${questions.length} questions`);

      if (questions.length === 0) {
        console.log(`   ⚠️ Skipping - no questions found`);
        continue;
      }

      // Hiển thị phân bố câu hỏi theo part
      const partCounts: Record<number, number> = {};
      for (const q of questions) {
        partCounts[q.part] = (partCounts[q.part] || 0) + 1;
      }
      console.log(`   📊 Questions by part:`, partCounts);

      // Sinh records
      const records: any[] = [];
      for (let i = 0; i < RECORDS_PER_TEST; i++) {
        const record = generateUserTestRecord(
          userId,
          new Types.ObjectId(testId),
          questions
        );
        records.push(record);

        if ((i + 1) % 200 === 0) {
          console.log(
            `   ⏳ Generated ${i + 1}/${RECORDS_PER_TEST} records...`
          );
        }
      }

      // Insert batch
      console.log(`   💾 Inserting ${records.length} records...`);
      const result = await UserTest.insertMany(records, { ordered: false });
      totalCreated += result.length;
      console.log(`   ✅ Inserted ${result.length} records for test ${testId}`);

      // Hiển thị thống kê mẫu
      const sampleScores = records.slice(0, 10).map((r) => r.score);
      const avgScore = Math.round(
        records.reduce((sum, r) => sum + r.score, 0) / records.length
      );
      console.log(`   📈 Sample scores: [${sampleScores.join(", ")}]`);
      console.log(`   📈 Average score: ${avgScore}`);
    }

    console.log(`\n🎉 DONE! Total records created: ${totalCreated}`);

    // Verify
    console.log("\n🔍 Verification:");
    for (const testId of TEST_IDS) {
      const count = await UserTest.countDocuments({
        test_id: new Types.ObjectId(testId),
      });
      console.log(`   Test ${testId}: ${count} records`);
    }

    // // ⚙️ TỰ ĐỘNG CHẠY CALIBRATION
    // console.log(
    //   "\n⚙️ Bắt đầu chạy IRT Rasch Calibration dựa trên dữ liệu vừa seed..."
    // );
    // await calibrateIRTRasch();
    console.log("✅ Calibration hoàn tất chuẩn xác!");
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// ============ RUN ============
seedUserTests()
  .then(() => {
    console.log("✅ Seed completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
