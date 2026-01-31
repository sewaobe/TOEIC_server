/**
 * 🎯 Script: IRT Rasch Calibration (1-PL Model)
 * 
 * Mục đích: Chuẩn hóa độ khó (difficulty parameter) của câu hỏi 
 * dựa trên lịch sử làm bài của 5000 user_test records
 * 
 * Phương pháp:
 * - IRT 1-PL (Rasch Model)
 * - Maximum Likelihood Estimation (MLE)
 * - Prior distribution: N(0, 1)
 * - Joint Maximum Likelihood Estimation với Newton-Raphson
 * - Theta constrained: [-5, 5]
 * - Difficulty scaled: [0, 1] (normalized weight)
 */

import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { Question, UserTest } from "../../models/index";

// ============ CẤU HÌNH ============
const MONGO = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/toeic_local";

// Tham số cho thuật toán
const MAX_ITERATIONS = 100;           // Số vòng lặp tối đa
const CONVERGENCE_THRESHOLD = 0.001;  // Ngưỡng hội tụ
const PRIOR_MEAN = 0;                 // Mean của prior N(0,1)
const PRIOR_VARIANCE = 1;             // Variance của prior N(0,1)

// Discrimination parameter (cố định = 1 trong Rasch model)
const DISCRIMINATION = 1.0;

// Giới hạn theta (ability)
const THETA_MIN = -5;
const THETA_MAX = 5;

// Giới hạn difficulty raw (trước khi scale)
const DIFFICULTY_RAW_MIN = -5;
const DIFFICULTY_RAW_MAX = 5;

// ============ HELPER FUNCTIONS ============

/**
 * Clamp giá trị trong khoảng [min, max]
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Scale difficulty từ IRT scale (-∞, +∞) về [0, 1]
 * Sử dụng sigmoid transformation
 * difficulty = 0 -> weight ≈ 0.5
 * difficulty < 0 (dễ) -> weight < 0.5
 * difficulty > 0 (khó) -> weight > 0.5
 */
function scaleDifficultyToWeight(rawDifficulty: number): number {
    // Sigmoid: 1 / (1 + exp(-k * x))
    // k = 0.5 để spread đều hơn
    const k = 0.5;
    const weight = 1 / (1 + Math.exp(-k * rawDifficulty));
    return clamp(weight, 0.0, 1.0);
}

// ============ RASCH MODEL FUNCTIONS ============

/**
 * Hàm xác suất trả lời đúng theo Rasch Model (1-PL IRT)
 * P(X = 1 | θ, b) = exp(θ - b) / (1 + exp(θ - b))
 * 
 * @param theta - Ability level của học sinh
 * @param difficulty - Độ khó của câu hỏi (b)
 * @returns Xác suất trả lời đúng [0, 1]
 */
function raschProbability(theta: number, difficulty: number): number {
    const exponent = DISCRIMINATION * (theta - difficulty);

    // Tránh overflow: nếu exponent quá lớn/nhỏ
    if (exponent > 20) return 1.0;
    if (exponent < -20) return 0.0;

    return Math.exp(exponent) / (1 + Math.exp(exponent));
}

/**
 * Tính gradient (đạo hàm bậc 1) của log-likelihood đối với difficulty
 * dLL/db = Σ[P(θ_i, b) - x_i] - (b - μ)/σ²
 * 
 * @param responses - Mảng {theta, isCorrect}
 * @param difficulty - Độ khó hiện tại
 * @returns Gradient value
 */
function gradientDifficulty(
    responses: { theta: number; isCorrect: boolean }[],
    difficulty: number
): number {
    let gradient = 0;

    // Gradient từ likelihood
    for (const resp of responses) {
        const prob = raschProbability(resp.theta, difficulty);
        const x = resp.isCorrect ? 1 : 0;
        gradient += prob - x;
    }

    // Gradient từ prior N(0, 1)
    const priorGradient = (difficulty - PRIOR_MEAN) / PRIOR_VARIANCE;

    return gradient + priorGradient;
}

/**
 * Tính Hessian (đạo hàm bậc 2) của log-likelihood đối với difficulty
 * d²LL/db² = -Σ[P(θ_i, b) * (1 - P(θ_i, b))] - 1/σ²
 * 
 * @param responses - Mảng {theta, isCorrect}
 * @param difficulty - Độ khó hiện tại
 * @returns Hessian value
 */
function hessianDifficulty(
    responses: { theta: number; isCorrect: boolean }[],
    difficulty: number
): number {
    let hessian = 0;

    // Hessian từ likelihood
    for (const resp of responses) {
        const prob = raschProbability(resp.theta, difficulty);
        hessian -= prob * (1 - prob);
    }

    // Hessian từ prior N(0, 1)
    const priorHessian = -1 / PRIOR_VARIANCE;

    return hessian + priorHessian;
}

/**
 * Tính gradient của log-likelihood đối với theta
 * dLL/dθ = Σ[x_i - P(θ, b_i)] - θ/σ²
 */
function gradientTheta(
    responses: { difficulty: number; isCorrect: boolean }[],
    theta: number
): number {
    let gradient = 0;

    // Gradient từ likelihood
    for (const resp of responses) {
        const prob = raschProbability(theta, resp.difficulty);
        const x = resp.isCorrect ? 1 : 0;
        gradient += x - prob;
    }

    // Gradient từ prior N(0, 1)
    const priorGradient = -theta / PRIOR_VARIANCE;

    return gradient + priorGradient;
}

/**
 * Tính Hessian của log-likelihood đối với theta
 * d²LL/dθ² = -Σ[P(θ, b_i) * (1 - P(θ, b_i))] - 1/σ²
 */
function hessianTheta(
    responses: { difficulty: number; isCorrect: boolean }[],
    theta: number
): number {
    let hessian = 0;

    // Hessian từ likelihood
    for (const resp of responses) {
        const prob = raschProbability(theta, resp.difficulty);
        hessian -= prob * (1 - prob);
    }

    // Hessian từ prior N(0, 1)
    const priorHessian = -1 / PRIOR_VARIANCE;

    return hessian + priorHessian;
}

/**
 * Ước lượng difficulty parameter bằng Newton-Raphson
 * b_new = b_old - (dLL/db) / (d²LL/db²)
 */
function estimateDifficulty(
    responses: { theta: number; isCorrect: boolean }[],
    initialDifficulty: number = 0
): { difficulty: number; converged: boolean; iterations: number } {

    if (responses.length === 0) {
        return { difficulty: 0, converged: false, iterations: 0 };
    }

    let difficulty = initialDifficulty;
    let converged = false;
    let iterations = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        iterations++;

        const gradient = gradientDifficulty(responses, difficulty);
        const hessian = hessianDifficulty(responses, difficulty);

        // Tránh chia cho 0
        if (Math.abs(hessian) < 1e-8) {
            break;
        }

        // Newton-Raphson update
        const update = -gradient / hessian;
        difficulty += update;

        // Clamp difficulty trong khoảng cho phép
        difficulty = clamp(difficulty, DIFFICULTY_RAW_MIN, DIFFICULTY_RAW_MAX);

        // Kiểm tra hội tụ
        if (Math.abs(update) < CONVERGENCE_THRESHOLD) {
            converged = true;
            break;
        }
    }

    return { difficulty, converged, iterations };
}

/**
 * Ước lượng theta (ability) cho user bằng Newton-Raphson
 * θ_new = θ_old - (dLL/dθ) / (d²LL/dθ²)
 */
function estimateTheta(
    responses: { difficulty: number; isCorrect: boolean }[],
    initialTheta: number = 0
): { theta: number; converged: boolean; iterations: number } {

    if (responses.length === 0) {
        return { theta: 0, converged: false, iterations: 0 };
    }

    let theta = initialTheta;
    let converged = false;
    let iterations = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        iterations++;

        const gradient = gradientTheta(responses, theta);
        const hessian = hessianTheta(responses, theta);

        // Tránh chia cho 0
        if (Math.abs(hessian) < 1e-8) {
            break;
        }

        // Newton-Raphson update
        const update = -gradient / hessian;
        theta += update;

        // Clamp theta trong khoảng [-5, 5]
        theta = clamp(theta, THETA_MIN, THETA_MAX);

        // Kiểm tra hội tụ
        if (Math.abs(update) < CONVERGENCE_THRESHOLD) {
            converged = true;
            break;
        }
    }

    return { theta, converged, iterations };
}

// ============ DATA STRUCTURES ============

interface QuestionResponseData {
    theta: number;
    isCorrect: boolean;
}

interface UserResponseData {
    difficulty: number;
    isCorrect: boolean;
}

/**
 * Response record - một câu trả lời của một session
 * sessionId = userTest._id (mỗi lần làm bài là 1 session riêng)
 */
interface ResponseRecord {
    sessionId: string;      // userTest._id - mỗi lần làm bài
    questionId: string;     // question._id
    isCorrect: boolean;
}

/**
 * Pre-indexed data structure cho JMLE
 * Tối ưu từ O(Q × S × A) xuống O(total_responses)
 */
interface IndexedData {
    // Tất cả responses (flat array)
    allResponses: ResponseRecord[];

    // Index: questionId -> indices trong allResponses
    questionIndex: Map<string, number[]>;

    // Index: sessionId -> indices trong allResponses  
    sessionIndex: Map<string, number[]>;

    // Parameters
    sessionThetas: Map<string, number>;      // sessionId -> theta
    questionDifficulties: Map<string, number>; // questionId -> difficulty

    // Stats
    totalSessions: number;
    totalQuestions: number;
    totalResponses: number;
}

// ============ DATA PROCESSING ============

/**
 * Thu thập và index dữ liệu responses từ database
 * Sử dụng sessionId (userTest._id) thay vì user_id
 * vì mỗi lần làm bài cần có theta riêng
 * 
 * Complexity: O(total_responses) - chỉ duyệt 1 lần
 */
async function collectAndIndexData(): Promise<IndexedData> {
    console.log("📊 Thu thập và index dữ liệu responses...");

    const userTests = await UserTest.find({})
        .select("_id answers")
        .lean();

    console.log(`   Tìm thấy ${userTests.length} user_test records (sessions)`);

    const allResponses: ResponseRecord[] = [];
    const questionIndex = new Map<string, number[]>();
    const sessionIndex = new Map<string, number[]>();
    const sessionThetas = new Map<string, number>();
    const questionDifficulties = new Map<string, number>();

    // Single pass: thu thập tất cả responses và build indices
    for (const ut of userTests) {
        const sessionId = ut._id.toString();

        // Khởi tạo theta = 0 cho session này
        sessionThetas.set(sessionId, 0);

        // Khởi tạo index array cho session
        if (!sessionIndex.has(sessionId)) {
            sessionIndex.set(sessionId, []);
        }

        for (const answer of ut.answers) {
            const questionId = answer.question_id.toString();
            const responseIdx = allResponses.length;

            // Thêm response record
            allResponses.push({
                sessionId,
                questionId,
                isCorrect: answer.isCorrect,
            });

            // Update question index
            if (!questionIndex.has(questionId)) {
                questionIndex.set(questionId, []);
                questionDifficulties.set(questionId, 0); // Khởi tạo difficulty = 0
            }
            questionIndex.get(questionId)!.push(responseIdx);

            // Update session index
            sessionIndex.get(sessionId)!.push(responseIdx);
        }
    }

    const data: IndexedData = {
        allResponses,
        questionIndex,
        sessionIndex,
        sessionThetas,
        questionDifficulties,
        totalSessions: sessionThetas.size,
        totalQuestions: questionDifficulties.size,
        totalResponses: allResponses.length,
    };

    console.log(`   Tổng số câu hỏi có dữ liệu: ${data.totalQuestions}`);
    console.log(`   Tổng số sessions (lần làm bài): ${data.totalSessions}`);
    console.log(`   Tổng số responses: ${data.totalResponses}`);

    return data;
}

/**
 * Joint Maximum Likelihood Estimation (JMLE) - Optimized
 * 
 * Tối ưu hóa:
 * 1. Pre-indexed data: lookup O(1) thay vì O(n)
 * 2. Sử dụng sessionId (userTest._id) thay vì user_id
 * 3. Batch processing với indices
 * 
 * Complexity: O(outer_iterations × total_responses × inner_iterations)
 * Thay vì: O(outer_iterations × questions × sessions × answers)
 */
async function jointEstimation() {
    console.log("\n🔄 Bắt đầu Joint Maximum Likelihood Estimation (Optimized)...");

    const data = await collectAndIndexData();
    const {
        allResponses,
        questionIndex,
        sessionIndex,
        sessionThetas,
        questionDifficulties
    } = data;

    let globalConverged = false;
    let outerIteration = 0;
    const maxOuterIterations = 20;

    while (!globalConverged && outerIteration < maxOuterIterations) {
        outerIteration++;
        console.log(`\n   📍 Outer Iteration ${outerIteration}/${maxOuterIterations}`);

        // ============ BƯỚC 1: Ước lượng DIFFICULTY (fix theta) ============
        console.log("      → Step 1: Estimating difficulties (fixing thetas)...");
        let diffConvergedCount = 0;
        let totalDiffIterations = 0;

        for (const [questionId, responseIndices] of questionIndex.entries()) {
            const currentDiff = questionDifficulties.get(questionId) || 0;

            // Build responses array với theta hiện tại - O(responses_for_question)
            const responses: QuestionResponseData[] = responseIndices.map(idx => {
                const resp = allResponses[idx];
                return {
                    theta: sessionThetas.get(resp.sessionId) || 0,
                    isCorrect: resp.isCorrect,
                };
            });

            // Ước lượng difficulty mới
            const { difficulty, converged, iterations } = estimateDifficulty(
                responses,
                currentDiff
            );

            questionDifficulties.set(questionId, difficulty);
            totalDiffIterations += iterations;
            if (converged) diffConvergedCount++;
        }

        const avgDiffIterations = totalDiffIterations / questionIndex.size;
        console.log(`      ✓ ${diffConvergedCount}/${questionIndex.size} questions converged`);
        console.log(`      ✓ Avg iterations: ${avgDiffIterations.toFixed(1)}`);

        // ============ BƯỚC 2: Ước lượng THETA (fix difficulty) ============
        console.log("      → Step 2: Estimating thetas (fixing difficulties)...");

        let thetaConvergedCount = 0;
        let maxThetaChange = 0;
        let totalThetaIterations = 0;

        for (const [sessionId, responseIndices] of sessionIndex.entries()) {
            const currentTheta = sessionThetas.get(sessionId) || 0;

            // Build responses array với difficulty hiện tại - O(responses_for_session)
            const responses: UserResponseData[] = responseIndices.map(idx => {
                const resp = allResponses[idx];
                return {
                    difficulty: questionDifficulties.get(resp.questionId) || 0,
                    isCorrect: resp.isCorrect,
                };
            });

            // Ước lượng theta mới
            const { theta, converged, iterations } = estimateTheta(
                responses,
                currentTheta
            );

            const change = Math.abs(theta - currentTheta);
            maxThetaChange = Math.max(maxThetaChange, change);

            sessionThetas.set(sessionId, theta);
            totalThetaIterations += iterations;
            if (converged) thetaConvergedCount++;
        }

        const avgThetaIterations = totalThetaIterations / sessionIndex.size;
        console.log(`      ✓ ${thetaConvergedCount}/${sessionIndex.size} sessions converged`);
        console.log(`      ✓ Avg iterations: ${avgThetaIterations.toFixed(1)}`);
        console.log(`      ✓ Max theta change: ${maxThetaChange.toFixed(4)}`);

        // Kiểm tra hội tụ toàn cục
        if (maxThetaChange < CONVERGENCE_THRESHOLD) {
            globalConverged = true;
            console.log("\n   🎉 Global convergence achieved!");
        }
    }

    if (!globalConverged) {
        console.log("\n   ⚠️ Max iterations reached without full convergence");
    }

    return { questionDifficulties, sessionThetas };
}

/**
 * Lưu kết quả calibration vào database
 * CHỈ cập nhật irt_difficulty cho questions (scaled về [0,1])
 * KHÔNG cập nhật theta vào user_test
 */
async function saveCalibrationResults(
    questionDifficulties: Map<string, number>
) {
    console.log("\n💾 Lưu kết quả calibration vào database...");

    // Cập nhật difficulties cho questions
    let updatedQuestions = 0;

    for (const [qId, rawDifficulty] of questionDifficulties.entries()) {
        // Scale difficulty về [0, 1]
        const weight = scaleDifficultyToWeight(rawDifficulty);

        await Question.findByIdAndUpdate(qId, {
            irt_difficulty: weight,  // Lưu weight đã scale
            irt_discrimination: DISCRIMINATION,
            irt_guessing: 0.25, // Default guessing parameter
        });

        updatedQuestions++;

        if (updatedQuestions % 100 === 0) {
            console.log(`   Progress: ${updatedQuestions}/${questionDifficulties.size} questions updated`);
        }
    }

    console.log(`   ✓ Đã cập nhật ${updatedQuestions} questions với difficulty (weight) trong [0, 1]`);
    console.log(`   ℹ️ Theta (ability) chỉ dùng tạm để calibrate, không lưu vào user_test`);
}

/**
 * Hiển thị thống kê kết quả
 */
async function displayStatistics(
    questionDifficulties: Map<string, number>,
    sessionThetas: Map<string, number>
) {
    console.log("\n📈 THỐNG KÊ KẾT QUẢ CALIBRATION:");
    console.log("=".repeat(60));

    // ========== Thống kê DIFFICULTY (RAW) ==========
    console.log("\n🎯 DIFFICULTY PARAMETERS (RAW - IRT Scale):");

    const rawDifficulties = Array.from(questionDifficulties.values());

    const diffMean = rawDifficulties.reduce((a, b) => a + b, 0) / rawDifficulties.length;
    const diffVariance = rawDifficulties.reduce(
        (sum, d) => sum + Math.pow(d - diffMean, 2),
        0
    ) / rawDifficulties.length;
    const diffStdDev = Math.sqrt(diffVariance);

    const sortedDiff = [...rawDifficulties].sort((a, b) => a - b);
    const diffMin = sortedDiff[0];
    const diffMax = sortedDiff[sortedDiff.length - 1];
    const diffMedian = sortedDiff[Math.floor(sortedDiff.length / 2)];

    console.log(`   Số câu hỏi: ${rawDifficulties.length}`);
    console.log(`   Mean: ${diffMean.toFixed(3)}`);
    console.log(`   Std Dev: ${diffStdDev.toFixed(3)}`);
    console.log(`   Min: ${diffMin.toFixed(3)}`);
    console.log(`   Max: ${diffMax.toFixed(3)}`);
    console.log(`   Median: ${diffMedian.toFixed(3)}`);

    // Phân loại độ khó (raw)
    const veryEasy = rawDifficulties.filter(d => d < -1.5).length;
    const easy = rawDifficulties.filter(d => d >= -1.5 && d < -0.5).length;
    const medium = rawDifficulties.filter(d => d >= -0.5 && d < 0.5).length;
    const hard = rawDifficulties.filter(d => d >= 0.5 && d < 1.5).length;
    const veryHard = rawDifficulties.filter(d => d >= 1.5).length;

    console.log(`\n   📊 Phân bố độ khó (raw):`);
    console.log(`      Very Easy (< -1.5):     ${veryEasy.toString().padStart(4)} (${(veryEasy / rawDifficulties.length * 100).toFixed(1)}%)`);
    console.log(`      Easy (-1.5 to -0.5):    ${easy.toString().padStart(4)} (${(easy / rawDifficulties.length * 100).toFixed(1)}%)`);
    console.log(`      Medium (-0.5 to 0.5):   ${medium.toString().padStart(4)} (${(medium / rawDifficulties.length * 100).toFixed(1)}%)`);
    console.log(`      Hard (0.5 to 1.5):      ${hard.toString().padStart(4)} (${(hard / rawDifficulties.length * 100).toFixed(1)}%)`);
    console.log(`      Very Hard (> 1.5):      ${veryHard.toString().padStart(4)} (${(veryHard / rawDifficulties.length * 100).toFixed(1)}%)`);

    // ========== Thống kê WEIGHT (SCALED [0,1]) ==========
    console.log("\n📊 DIFFICULTY WEIGHTS (SCALED [0, 1] - Saved to DB):");

    const weights = rawDifficulties.map(d => scaleDifficultyToWeight(d));

    const weightMean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const weightVariance = weights.reduce(
        (sum, w) => sum + Math.pow(w - weightMean, 2),
        0
    ) / weights.length;
    const weightStdDev = Math.sqrt(weightVariance);

    const sortedWeights = [...weights].sort((a, b) => a - b);
    const weightMin = sortedWeights[0];
    const weightMax = sortedWeights[sortedWeights.length - 1];
    const weightMedian = sortedWeights[Math.floor(sortedWeights.length / 2)];

    console.log(`   Mean: ${weightMean.toFixed(3)}`);
    console.log(`   Std Dev: ${weightStdDev.toFixed(3)}`);
    console.log(`   Min: ${weightMin.toFixed(3)}`);
    console.log(`   Max: ${weightMax.toFixed(3)}`);
    console.log(`   Median: ${weightMedian.toFixed(3)}`);

    // Phân loại weight
    const w1 = weights.filter(w => w < 0.3).length;
    const w2 = weights.filter(w => w >= 0.3 && w < 0.4).length;
    const w3 = weights.filter(w => w >= 0.4 && w < 0.6).length;
    const w4 = weights.filter(w => w >= 0.6 && w < 0.7).length;
    const w5 = weights.filter(w => w >= 0.7).length;

    console.log(`\n   📊 Phân bố weight:`);
    console.log(`      Very Easy (< 0.3):      ${w1.toString().padStart(4)} (${(w1 / weights.length * 100).toFixed(1)}%)`);
    console.log(`      Easy (0.3 to 0.4):      ${w2.toString().padStart(4)} (${(w2 / weights.length * 100).toFixed(1)}%)`);
    console.log(`      Medium (0.4 to 0.6):    ${w3.toString().padStart(4)} (${(w3 / weights.length * 100).toFixed(1)}%)`);
    console.log(`      Hard (0.6 to 0.7):      ${w4.toString().padStart(4)} (${(w4 / weights.length * 100).toFixed(1)}%)`);
    console.log(`      Very Hard (> 0.7):      ${w5.toString().padStart(4)} (${(w5 / weights.length * 100).toFixed(1)}%)`);

    // ========== Thống kê THETA ==========
    console.log("\n👤 THETA (ABILITY) PARAMETERS (Per session - used for calibration only):");

    const thetas = Array.from(sessionThetas.values());

    const thetaMean = thetas.reduce((a, b) => a + b, 0) / thetas.length;
    const thetaVariance = thetas.reduce(
        (sum, t) => sum + Math.pow(t - thetaMean, 2),
        0
    ) / thetas.length;
    const thetaStdDev = Math.sqrt(thetaVariance);

    const sortedTheta = [...thetas].sort((a, b) => a - b);
    const thetaMin = sortedTheta[0];
    const thetaMax = sortedTheta[sortedTheta.length - 1];
    const thetaMedian = sortedTheta[Math.floor(sortedTheta.length / 2)];

    console.log(`   Số sessions (lần làm bài): ${thetas.length}`);
    console.log(`   Mean: ${thetaMean.toFixed(3)}`);
    console.log(`   Std Dev: ${thetaStdDev.toFixed(3)}`);
    console.log(`   Min: ${thetaMin.toFixed(3)}`);
    console.log(`   Max: ${thetaMax.toFixed(3)}`);
    console.log(`   Median: ${thetaMedian.toFixed(3)}`);

    // Phân loại ability
    const veryWeak = thetas.filter(t => t < -1.5).length;
    const weak = thetas.filter(t => t >= -1.5 && t < -0.5).length;
    const average = thetas.filter(t => t >= -0.5 && t < 0.5).length;
    const strong = thetas.filter(t => t >= 0.5 && t < 1.5).length;
    const veryStrong = thetas.filter(t => t >= 1.5).length;

    console.log(`\n   📊 Phân bố ability (per session):`);
    console.log(`      Very Weak (< -1.5):     ${veryWeak.toString().padStart(4)} (${(veryWeak / thetas.length * 100).toFixed(1)}%)`);
    console.log(`      Weak (-1.5 to -0.5):    ${weak.toString().padStart(4)} (${(weak / thetas.length * 100).toFixed(1)}%)`);
    console.log(`      Average (-0.5 to 0.5):  ${average.toString().padStart(4)} (${(average / thetas.length * 100).toFixed(1)}%)`);
    console.log(`      Strong (0.5 to 1.5):    ${strong.toString().padStart(4)} (${(strong / thetas.length * 100).toFixed(1)}%)`);
    console.log(`      Very Strong (> 1.5):    ${veryStrong.toString().padStart(4)} (${(veryStrong / thetas.length * 100).toFixed(1)}%)`);
}

// ============ MAIN FUNCTION ============

async function calibrateIRTRasch() {
    console.log("🎯 BẮT ĐẦU IRT RASCH CALIBRATION (1-PL MODEL)");
    console.log("=".repeat(60));
    console.log(`   Theta range: [${THETA_MIN}, ${THETA_MAX}]`);
    console.log(`   Difficulty raw range: [${DIFFICULTY_RAW_MIN}, ${DIFFICULTY_RAW_MAX}]`);
    console.log(`   Weight (scaled) range: [0, 1]`);
    console.log(`   Prior distribution: N(${PRIOR_MEAN}, ${PRIOR_VARIANCE})`);
    console.log(`   Convergence threshold: ${CONVERGENCE_THRESHOLD}`);
    console.log(`   Max iterations: ${MAX_ITERATIONS}`);
    console.log("=".repeat(60));

    console.log("\n🔗 Kết nối MongoDB...");
    await mongoose.connect(MONGO);
    console.log(`✅ Đã kết nối: ${MONGO}`);

    try {
        // Kiểm tra dữ liệu trước khi calibrate
        const totalUserTests = await UserTest.countDocuments({});
        const totalQuestions = await Question.countDocuments({});

        console.log(`\n📋 KIỂM TRA DỮ LIỆU:`);
        console.log(`   Tổng số user_test records: ${totalUserTests}`);
        console.log(`   Tổng số questions trong DB: ${totalQuestions}`);

        if (totalUserTests === 0) {
            throw new Error("Không có dữ liệu user_test để calibrate. Hãy chạy seed_user_tests.ts trước!");
        }

        // ========== BƯỚC 1: Joint Maximum Likelihood Estimation ==========
        const startTime = Date.now();
        const { questionDifficulties, sessionThetas } = await jointEstimation();
        const estimationTime = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`\n⏱️ Thời gian ước lượng: ${estimationTime} giây`);

        // ========== BƯỚC 2: Lưu kết quả vào database ==========
        await saveCalibrationResults(questionDifficulties);

        // ========== BƯỚC 3: Hiển thị thống kê ==========
        await displayStatistics(questionDifficulties, sessionThetas);

        // ========== BƯỚC 4: Validation - Kiểm tra kết quả ==========
        console.log("\n🔍 VALIDATION:");
        console.log("=".repeat(60));

        // Lấy một số câu hỏi mẫu để kiểm tra
        const sampleQuestions = await Question.find({ irt_difficulty: { $exists: true } })
            .select("_id content irt_difficulty irt_discrimination")
            .limit(10)
            .lean();

        console.log("\n   📝 Sample questions với IRT parameters:");
        for (const q of sampleQuestions) {
            const qId = q._id.toString();
            const rawDiff = questionDifficulties.get(qId) || 0;
            console.log(`   - Q[${qId.slice(-6)}]: raw=${rawDiff.toFixed(3)}, weight=${q.irt_difficulty?.toFixed(3)}`);
        }

        // Kiểm tra model fit - tính Expected vs Observed accuracy
        console.log("\n   📊 Model Fit Analysis (Expected vs Observed):");
        await validateModelFit(questionDifficulties, sessionThetas);

        console.log("\n" + "=".repeat(60));
        console.log("🎉 IRT RASCH CALIBRATION HOÀN TẤT!");
        console.log("=".repeat(60));

        console.log("\n📌 GHI CHÚ:");
        console.log("   - irt_difficulty (weight) đã được lưu vào collection Question");
        console.log("   - Giá trị weight ∈ [0, 1]: 0 = rất dễ, 1 = rất khó");
        console.log("   - theta (ability) chỉ dùng tạm để calibrate, không lưu");
        console.log("   - Sử dụng weight này trong adaptive testing hoặc scoring");

    } catch (error) {
        console.error("\n❌ LỖI:", error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log("\n🔌 Đã ngắt kết nối MongoDB");
    }
}

/**
 * Validate model fit bằng cách so sánh Expected vs Observed accuracy
 * Đây là bước quan trọng trong IRT để đảm bảo model phù hợp với dữ liệu
 */
async function validateModelFit(
    questionDifficulties: Map<string, number>,
    sessionThetas: Map<string, number>
) {
    const userTests = await UserTest.find({})
        .select("_id answers")
        .lean();

    // Tính expected và observed cho từng câu hỏi
    const questionStats = new Map<string, { expected: number; observed: number; count: number }>();

    for (const ut of userTests) {
        const sessionId = ut._id.toString();
        const theta = sessionThetas.get(sessionId) || 0;

        for (const answer of ut.answers) {
            const qId = answer.question_id.toString();
            const difficulty = questionDifficulties.get(qId) || 0;

            // Tính expected probability
            const expectedProb = raschProbability(theta, difficulty);
            const observed = answer.isCorrect ? 1 : 0;

            if (!questionStats.has(qId)) {
                questionStats.set(qId, { expected: 0, observed: 0, count: 0 });
            }

            const stats = questionStats.get(qId)!;
            stats.expected += expectedProb;
            stats.observed += observed;
            stats.count++;
        }
    }

    // Tính residuals và chi-square fit
    let totalResidual = 0;
    let totalChiSquare = 0;
    let questionCount = 0;

    for (const [qId, stats] of questionStats.entries()) {
        if (stats.count > 0) {
            const expectedRate = stats.expected / stats.count;
            const observedRate = stats.observed / stats.count;
            const residual = observedRate - expectedRate;

            // Chi-square contribution
            const expectedCorrect = stats.expected;
            const expectedIncorrect = stats.count - expectedCorrect;

            if (expectedCorrect > 0 && expectedIncorrect > 0) {
                const chiContrib = Math.pow(stats.observed - expectedCorrect, 2) / expectedCorrect +
                    Math.pow((stats.count - stats.observed) - expectedIncorrect, 2) / expectedIncorrect;
                totalChiSquare += chiContrib;
            }

            totalResidual += Math.abs(residual);
            questionCount++;
        }
    }

    const meanAbsResidual = totalResidual / questionCount;
    const meanChiSquare = totalChiSquare / questionCount;

    console.log(`   Mean Absolute Residual (MAR): ${meanAbsResidual.toFixed(4)}`);
    console.log(`   Mean Chi-Square per question: ${meanChiSquare.toFixed(4)}`);

    // Đánh giá fit
    if (meanAbsResidual < 0.05) {
        console.log(`   ✅ Model fit: EXCELLENT (MAR < 0.05)`);
    } else if (meanAbsResidual < 0.10) {
        console.log(`   ✅ Model fit: GOOD (MAR < 0.10)`);
    } else if (meanAbsResidual < 0.15) {
        console.log(`   ⚠️ Model fit: ACCEPTABLE (MAR < 0.15)`);
    } else {
        console.log(`   ❌ Model fit: POOR (MAR >= 0.15) - Consider reviewing data quality`);
    }

    // Phân tích item-level fit (infit/outfit statistics theo IRT)
    console.log("\n   📊 Item Fit Statistics (Sample):");

    let sampleCount = 0;
    for (const [qId, stats] of questionStats.entries()) {
        if (sampleCount >= 5) break;
        if (stats.count < 10) continue; // Skip items với ít responses

        const expectedRate = stats.expected / stats.count;
        const observedRate = stats.observed / stats.count;
        const residual = observedRate - expectedRate;

        // Infit Mean Square (weighted by information)
        const variance = expectedRate * (1 - expectedRate);
        const infitMS = variance > 0 ? Math.pow(residual, 2) / variance : 1;

        console.log(`   - Q[${qId.slice(-6)}]: Obs=${observedRate.toFixed(3)}, Exp=${expectedRate.toFixed(3)}, Infit=${infitMS.toFixed(3)}`);
        sampleCount++;
    }
}

// ============ EXPORT FOR USE IN OTHER SCRIPTS ============
export { calibrateIRTRasch, raschProbability, estimateTheta, scaleDifficultyToWeight };

// ============ RUN ============
calibrateIRTRasch()
    .then(() => {
        console.log("\n✅ Script hoàn tất thành công!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("\n❌ Script thất bại:", err);
        process.exit(1);
    });