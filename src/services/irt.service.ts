import { UserTest } from "../models";
import { Question } from "../models/question.model";
import dotenv from "dotenv";
import { connectDB } from "../configs/db";

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
estimateAllTheta2PL();
