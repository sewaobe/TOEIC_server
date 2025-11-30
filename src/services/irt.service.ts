import { Group, LearningPath, Lesson, Quiz, TopicVocabulary, User, UserTest } from "../models";
import { Question } from "../models/question.model";
import dotenv from "dotenv";
import { connectDB } from "../configs/db";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { submitMiniTestService } from "./test.service";
import { generateNextWeekMiniTest } from "../utils/mini_test.util";
import { retrieveLearning } from "../retriever/retriever_learning";
import { generateIRTWeeklyPlan } from "./gemini.service";
import { saveDebugFile } from "./demo.service";

dotenv.config();
connectDB();

/************************************************************
 * 2PL MODEL (a, b)
 ************************************************************/
function P2PL(theta: number, a: number, b: number) {
    return 1 / (1 + Math.exp(-a * (theta - b)));
}

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
    let a = 1.0;    // discrimination
    let b = 0.0;    // difficulty
    const lr = 0.01;

    for (let iter = 0; iter < 60; iter++) {
        let gradA = 0, gradB = 0;

        for (const row of rows) {
            const p = P2PL(row.theta, a, b);
            const q = 1 - p;

            gradA += (row.correct - p) * (row.theta - b) * p * q;
            gradB += (row.correct - p) * (-a) * p * q;
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
            "answers.question_id": q._id
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
                        correct: ans.isCorrect ? 1 : 0
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
                irt_guessing: 0.25,  // KEEP FIXED FOR TOEIC
                updated_at: new Date()
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
            correct: ans.isCorrect ? 1 : 0
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
        thetaReading
    });

    await UserTest.updateOne(
        { _id: t._id },
        {
            theta_overall: thetaOverall,
            theta_listening: thetaListening,
            theta_reading: thetaReading
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
    }[]
}) {

    const overallRows: { a: number; b: number; correct: number }[] = [];
    const rowsByPart: Record<number, { a: number; b: number; correct: number }[]> = {};

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
        thetaByPart
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

    // Lưu vào UserTest
    await UserTest.updateOne(
        { _id: testId },
        {
            theta_overall: thetaOverall,
            theta_parts: thetaByPart
        }
    );

    // Lưu vào User (latest ability)
    await User.updateOne(
        { _id: userId },
        {
            latest_theta_overall: thetaOverall,
            latest_theta_parts: thetaByPart
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
    7: ["lesson", "quiz", "vocab"]
}

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
                vocab: []
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
            vocab: []
        };

        /***********************************
         * LESSON
         ***********************************/
        if (allowedTypes.includes("lesson")) {
            partResult.lessons = await Lesson.find({
                part_type: part,
                level: { $in: cefrLevels },
                weight: { $gte: weightRange.min, $lte: weightRange.max }
            }).select("_id title summary level weight planned_completion_time part_type");
        }

        /***********************************
         * DICTATION
         ***********************************/
        if (allowedTypes.includes("dictation")) {
            partResult.dictations = await Dictation.find({
                part_type: part,
                level: { $in: cefrLevels },
                weight: { $gte: weightRange.min, $lte: weightRange.max }
            }).select("_id title transcript level duration weight");
        }

        /***********************************
         * SHADOWING
         ***********************************/
        if (allowedTypes.includes("shadowing")) {
            partResult.shadowings = await Shadowing.find({
                part_type: part,
                level: { $in: cefrLevels },
                weight: { $gte: weightRange.min, $lte: weightRange.max }
            }).select("_id title transcript level duration weight");
        }

        /***********************************
         * QUIZ
         ***********************************/
        if (allowedTypes.includes("quiz")) {
            partResult.quizzes = await Quiz.find({
                part_type: part,
                level: { $in: cefrLevels },
                weight: { $gte: weightRange.min, $lte: weightRange.max }
            }).select("_id title level weight planned_completion_time question_ids");
        }

        /***********************************
         * VOCABULARY (luôn có)
         ***********************************/
        partResult.vocab = await TopicVocabulary.find({
            part_type: part,
            level: { $in: cefrLevels }
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
                kind: meta.item_type,       // quiz | lesson | dictation | vocab
                resource_id: meta.item_id,  // real Mongo ObjectId
                level: meta.level,
                weight: meta.weight ?? 0,
                title: extractTitle(doc),
                estimated_time: estimateStudyTime(meta.item_type)
            };
        });
    }

    return result;
}

function extractTitle(doc: string) {
    const m = doc.match(/TITLE:\s*(.+)/);
    return m ? m[1].trim() : "";
}

function estimateStudyTime(kind: string) {
    switch (kind) {
        case "quiz": return 10;
        case "lesson": return 20;
        case "vocab": return 5;
        case "dictation": return 10;
        case "shadowing": return 15;
        default: return 10;
    }
}

export const generateIRTWeeklyPlanService = async (
    userId: string,
    testId: string,
    answers: {
        question_id: string;
        selectedOption: string;
    }[],
    duration: number
) => {
    // Bước 0: Lấy dữ liệu cần thiết như thông tin user, tuần học hiện tại, thời gian hoàn thành...
    const infoLearningPathOfUser = await LearningPath.findOne({ user_id: userId }).lean();

    if (!infoLearningPathOfUser) {
        throw new Error("Learning path not found for user " + userId);
    }

    const userProfile = {
        user_id: userId,
        current_week: infoLearningPathOfUser.current_week,
        hours_per_day: infoLearningPathOfUser.time_per_day,
        study_days_per_week: infoLearningPathOfUser.days_per_week,
        target_score: infoLearningPathOfUser.target_score,
        target_date: infoLearningPathOfUser.target_completion_date
    }

    // Bước 1: Tính điểm bài test
    const result = await submitMiniTestService(userId, testId, answers, duration);

    if (!result) {
        throw new Error("Failed to submit mini test for user " + userId);
    }

    // Bước 2: Tính theta cho từng part
    const abilities = calculateTheta2PL(result);

    if (!abilities) {
        throw new Error("Failed to calculate abilities for user " + userId);
    }

    // Bước 3: Tạo mini test cho tuần kế tiếp
    const miniTestNew = await generateNextWeekMiniTest(userId, abilities.thetaByPart);

    if (!miniTestNew) {
        throw new Error("Failed to generate next week mini test for user " + userId);
    }

    // Bước 4: Retrieve các bài học theo theta part
    let retrieved: any = {};
    for (let part = 1; part <= 7; part++) {
        retrieved[part] = await retrieveLearning(
            `Retrieve learning items for TOEIC Part ${part} based on difficulty & level`,
            50
        );
    }

    if (!retrieved) {
        throw new Error("Failed to retrieve learning items for user " + userId);
    }

    // Bước 5: Chuẩn hóa dữ liệu
    const normalized = normalizeRetrieved(retrieved)

    if (!normalized) {
        throw new Error("Failed to normalize retrieved items for user " + userId);
    }

    // Bước 6: Tạo plan cho tuần kế tiếp
    const weeklyNextPlan = await generateIRTWeeklyPlan({
        userProfile,
        thetaOverall: abilities.thetaOverall,
        thetaByPart: abilities.thetaByPart,
        candidateItems: normalized,
        miniTest: miniTestNew
    });

    if (!weeklyNextPlan) {
        throw new Error("Failed to generate IRT weekly plan for user " + userId);
    }

    // Bước 7: Lưu các dữ liệu trên vô DB
    await estimateThetaForUserTest2PL(result.userTestId.toString());
    await saveAbilityToDB(userId, testId, abilities);

    saveDebugFile(
        `irt_weekly_plan_user_${userId}.json`,
        weeklyNextPlan
    )
}
