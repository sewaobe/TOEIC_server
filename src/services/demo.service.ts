// import dotenv from "dotenv";
// import { connectDB } from "../configs/db";
// dotenv.config();
// connectDB();

// // import { Group, User, UserTest } from "../models"
// // import { Lesson } from "../models/lesson.model";
// // import { Dictation } from "../models/dictation.model";
// // import { Shadowing } from "../models/shadowing.model";
// // import { Quiz } from "../models/quiz.model";
// // import { TopicVocabulary } from "../models/topic_vocabulary.model";
import fs from "fs";
import path from "path";
// import { User, UserTest, Question, TopicVocabulary } from "../models";
// // import { retrieveLearning } from '../retriever/retriever_learning';
// // import { generateNextWeekMiniTest } from '../utils/mini_test.util';
// // import { generateIRTWeeklyPlan } from './gemini.service';

export function saveDebugFile(filename: string, data: any) {
  // Lưu ra ngoài thư mục TOEIC_server để tránh reload chậm
  const folder = path.join(process.cwd(), "..", "toeic_outputs");

  // Tạo folder nếu chưa có
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const filepath = path.join(folder, filename);

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");

  console.log("📄 Debug file saved:", filepath);
}

// // ======================================================
// // ESTIMATE IRT PARAMETERS (2PL, c = 0.25)
// // ======================================================

// function logistic2PL(theta: number, a: number, b: number, c: number = 0.25) {
//   const expTerm = Math.exp(-a * (theta - b));
//   return c + (1 - c) / (1 + expTerm);
// }

// function estimateIRTParametersForQuestion(
//   responses: { theta: number; correct: boolean }[]
// ) {
//   if (!responses.length) {
//     return { a: 1.0, b: 0.0, c: 0.25 };
//   }

//   // Khởi tạo giá trị hợp lý
//   let a = 1.0; // discrimination
//   let b = 0.0; // difficulty
//   const c = 0.25; // guessing (cố định theo yêu cầu)

//   const maxIter = 40;
//   const lr = 0.01; // learning rate nhỏ để ổn định

//   for (let iter = 0; iter < maxIter; iter++) {
//     let gradA = 0;
//     let gradB = 0;

//     for (const r of responses) {
//       const { theta, correct } = r;
//       const y = correct ? 1 : 0;
//       const p = logistic2PL(theta, a, b, c);

//       // Gradient w.r.t a, b (bỏ qua thành phần của c vì c cố định)
//       const common = (y - p) * (1 - c);
//       gradA += common * (theta - b);
//       gradB += -common * a;
//     }

//     a += lr * gradA;
//     b += lr * gradB;

//     // Ràng buộc nhẹ để tránh giá trị quá cực đoan
//     if (!Number.isFinite(a)) a = 1.0;
//     if (!Number.isFinite(b)) b = 0.0;
//     a = Math.max(0.01, Math.min(a, 3));
//     b = Math.max(-4, Math.min(b, 4));
//   }

//   return { a, b, c };
// }

// // ======================================================
// // TÍNH THETA_OVERALL & THETA_PARTS TỪ USER_TEST
// // ======================================================

// // Hàm sigmoid 2PL (không đoán mò, c = 0)
// function P2PL(theta: number, a: number, b: number) {
//   return 1 / (1 + Math.exp(-a * (theta - b)));
// }

// // Newton–Raphson ước lượng theta cho 1 bài test, dùng thông số IRT từng câu hỏi
// function estimateTheta2PLFromQuestions(
//   rows: {
//     a: number;
//     b: number;
//     correct: number;
//   }[]
// ) {
//   if (!rows.length) return 0;

//   let theta = 0; // khởi tạo trung bình
//   const maxIter = 40;

//   for (let iter = 0; iter < maxIter; iter++) {
//     let num = 0;
//     let den = 0;

//     for (const row of rows) {
//       const { a, b, correct } = row;
//       const p = P2PL(theta, a, b);
//       const q = 1 - p;

//       num += a * (correct - p);
//       den += a * a * p * q;
//     }

//     if (den === 0) break;

//     theta += num / den;
//     theta = Math.max(-4, Math.min(theta, 4));
//   }

//   return theta;
// }

// /**
//  * Tính IRT parameters cho tất cả Question từ bảng UserTest
//  * - Với mỗi question: gom toàn bộ (theta_overall của bài test, isCorrect cho câu đó)
//  * - Ước lượng a, b bằng mô hình 2PL, c = 0.25 cố định
//  * - Cập nhật lại vào Question.irt_discrimination, Question.irt_difficulty, Question.irt_guessing
//  * - Optionally: có thể dùng để phân tích thêm cho User nếu cần sau này
//  */
// export async function recomputeIRTParamsFromUserTests() {
//   console.log("🚀 Recomputing IRT parameters from UserTest...");

//   const userTests = await UserTest.find({}).lean();
//   if (!userTests.length) {
//     console.log("⚠️ No UserTest records found.");
//     return;
//   }

//   // Gom responses theo question_id
//   const byQuestion: Record<string, { theta: number; correct: boolean }[]> = {};

//   for (const ut of userTests) {
//     const theta = typeof ut.theta_overall === "number" ? ut.theta_overall : 0;
//     if (!ut.answers || !ut.answers.length) continue;

//     for (const ans of ut.answers) {
//       if (!ans.question_id) continue;
//       const qid = ans.question_id.toString();
//       if (!byQuestion[qid]) byQuestion[qid] = [];
//       byQuestion[qid].push({ theta, correct: !!ans.isCorrect });
//     }
//   }

//   console.log(
//     `📊 Collected responses for ${Object.keys(byQuestion).length} questions.`
//   );

//   const bulkOps: any[] = [];

//   for (const [questionId, responses] of Object.entries(byQuestion)) {
//     const { a, b, c } = estimateIRTParametersForQuestion(responses);

//     bulkOps.push({
//       updateOne: {
//         filter: { _id: questionId },
//         update: {
//           $set: {
//             irt_discrimination: a,
//             irt_difficulty: b,
//             irt_guessing: c,
//           },
//         },
//       },
//     });
//   }

//   if (!bulkOps.length) {
//     console.log("⚠️ No question responses to update.");
//     return;
//   }

//   const result = await Question.bulkWrite(bulkOps);
// }
// /**
//  * Tính theta_overall và theta_parts cho tất cả UserTest, sau đó
//  * - cập nhật vào UserTest.theta_overall, UserTest.theta_parts
//  * - cập nhật luôn vào User.latest_theta_overall, User.latest_theta_parts
//  *
//  * Yêu cầu: Question đã có 3 tham số IRT (irt_discrimination, irt_difficulty, irt_guessing),
//  * nhưng ở đây ta dùng mô hình 2PL nên chỉ dùng a,b; guessing khi tính theta = 0.25 cố định.
//  */
// export async function recomputeThetaFromUserTests() {
//   console.log("🚀 Recomputing theta_overall & theta_parts from UserTest...");

//   const userTests = await UserTest.find({})
//     .populate({
//       path: "answers.question_id",
//       model: "Question",
//       select: "irt_discrimination irt_difficulty tags",
//     })
//     .lean();

//   if (!userTests.length) {
//     console.log("⚠️ No UserTest records found.");
//     return;
//   }

//   const userBulkUpdates: Record<
//     string,
//     { latest_theta_overall: number; latest_theta_parts: Record<number, number> }
//   > = {};
//   const userTestBulkOps: any[] = [];

//   for (const ut of userTests as any[]) {
//     if (!ut.answers || !ut.answers.length) continue;

//     const overallRows: { a: number; b: number; correct: number }[] = [];
//     const rowsByPart: Record<
//       number,
//       { a: number; b: number; correct: number }[]
//     > = {};

//     for (const ans of ut.answers) {
//       const q: any = ans.question_id;
//       if (!q || typeof q !== "object") continue;

//       const a =
//         typeof q.irt_discrimination === "number" ? q.irt_discrimination : 1.0;
//       const b = typeof q.irt_difficulty === "number" ? q.irt_difficulty : 0.0;
//       const correct = ans.isCorrect ? 1 : 0;

//       overallRows.push({ a, b, correct });

//       // Detect part number từ tags dạng "[Part X]"
//       let partNum: number | null = null;
//       for (const t of q.tags || []) {
//         const match = typeof t === "string" ? t.match(/\[Part (\d+)\]/) : null;
//         if (match) {
//           partNum = parseInt(match[1], 10);
//           break;
//         }
//       }

//       if (partNum && partNum >= 1 && partNum <= 7) {
//         if (!rowsByPart[partNum]) rowsByPart[partNum] = [];
//         rowsByPart[partNum].push({ a, b, correct });
//       }
//     }

//     const thetaOverall = estimateTheta2PLFromQuestions(overallRows);
//     const thetaByPart: Record<number, number> = {};

//     for (let part = 1; part <= 7; part++) {
//       const rows = rowsByPart[part] || [];
//       thetaByPart[part] = estimateTheta2PLFromQuestions(rows);
//     }

//     // Chuẩn bị update cho UserTest
//     userTestBulkOps.push({
//       updateOne: {
//         filter: { _id: ut._id },
//         update: {
//           $set: {
//             theta_overall: thetaOverall,
//             theta_parts: thetaByPart,
//           },
//         },
//       },
//     });

//     // Ghi nhận giá trị mới nhất cho User
//     const userId = ut.user_id?.toString();
//     if (userId) {
//       userBulkUpdates[userId] = {
//         latest_theta_overall: thetaOverall,
//         latest_theta_parts: thetaByPart,
//       };
//     }
//   }

//   if (userTestBulkOps.length) {
//     const res = await UserTest.bulkWrite(userTestBulkOps);
//     console.log("✅ Updated theta for UserTest docs");
//   } else {
//     console.log("⚠️ No UserTest updates to perform.");
//   }

//   const userBulkOps: any[] = [];
//   for (const [userId, payload] of Object.entries(userBulkUpdates)) {
//     userBulkOps.push({
//       updateOne: {
//         filter: { _id: userId },
//         update: {
//           $set: {
//             latest_theta_overall: payload.latest_theta_overall,
//             latest_theta_parts: payload.latest_theta_parts,
//           },
//         },
//       },
//     });
//   }

//   if (userBulkOps.length) {
//     const resUser = await User.bulkWrite(userBulkOps);
//     console.log("✅ Updated latest theta for Users");
//   } else {
//     console.log("⚠️ No User updates to perform.");
//   }
// }
// // recomputeThetaFromUserTests();

// // ======================================================
// // RANDOMIZE part_type CHO TẤT CẢ TOPIC_VOCABULARY (1..7)
// // ======================================================

// export async function randomizeTopicVocabularyPartType() {
//   console.log("🚀 Randomizing part_type for all TopicVocabulary (1..7)...");

//   const topics = await TopicVocabulary.find({}).select("_id part_type").lean();
//   if (!topics.length) {
//     console.log("⚠️ No TopicVocabulary found.");
//     return;
//   }

//   const bulkOps: any[] = [];

//   for (const t of topics) {
//     const randomPart = Math.floor(Math.random() * 7) + 1; // 1..7

//     bulkOps.push({
//       updateOne: {
//         filter: { _id: t._id },
//         update: { $set: { part_type: randomPart } },
//       },
//     });
//   }

//   if (!bulkOps.length) {
//     console.log("⚠️ No updates to perform for TopicVocabulary.");
//     return;
//   }

//   await TopicVocabulary.bulkWrite(bulkOps);
//   console.log("✅ Randomized part_type for TopicVocabulary");
// }
// randomizeTopicVocabularyPartType();
// // Chạy 1 lần khi cần:
// // randomizeTopicVocabularyPartType().then(() => process.exit(0));

// // Gọi tạm khi chạy file này trực tiếp để backfill
// // recomputeThetaFromUserTests().then(() => process.exit(0));
// // // ======================================================

// // export const submitMiniTestService = async (
// //     userId: string,
// //     testId: string,
// //     answers: {
// //         question_id: string,
// //         selectedOption: string
// //     }[]
// // ) => {
// //     // 1) Lấy danh sách câu hỏi của mini test
// //     const groups = await Group
// //         .find({ test_id: testId })
// //         .select("_id questions")
// //         .populate({
// //             path: "questions",
// //             select: "_id correctAnswer tags irt_discrimination irt_difficulty irt_guessing"
// //         })
// //         .lean();

// //     if (!groups || groups.length === 0) {
// //         throw new Error("MiniTest not found");
// //     }

// //     // Flatten danh sách câu hỏi
// //     const questionList = groups.flatMap(g => g.questions);

// //     // 2) Tính điểm (số câu đúng)
// //     let totalCorrect = 0;

// //     const responses = questionList.map((q: any) => {
// //         const userAns = answers.find(a => a.question_id === q._id.toString());
// //         const isCorrect = userAns && userAns.selectedOption === q.correctAnswer;

// //         if (isCorrect) totalCorrect++;

// //         // Detect part number
// //         let partNum: number | null = null;
// //         for (const t of q.tags || []) {
// //             const match = t.match(/\[Part (\d+)\]/);
// //             if (match) {
// //                 partNum = parseInt(match[1]);
// //                 break;
// //             }
// //         }

// //         return {
// //             questionId: q._id.toString(),
// //             correct: isCorrect ? 1 : 0,
// //             a: q.irt_discrimination,
// //             b: q.irt_difficulty,
// //             c: q.irt_guessing ?? 0.25,
// //             part: partNum // 1..7 hoặc null
// //         };
// //     });

// //     console.log("=== MINI TEST SUBMISSION ===");
// //     console.log(`User: ${userId}`);
// //     console.log(`Test: ${testId}`);
// //     console.log(`Total Questions: ${responses.length}`);
// //     console.log(`Total Correct: ${totalCorrect}`);
// //     console.log("Responses:", responses);

// //     return {
// //         userId,
// //         testId,
// //         totalCorrect,
// //         totalQuestions: responses.length,
// //         responses
// //     };
// // };

// // /************************************************************
// //  * SIGMOID — 2PL Probability
// //  ************************************************************/
// // function P2PL(theta: number, a: number, b: number) {
// //     return 1 / (1 + Math.exp(-a * (theta - b)));
// // }

// // /************************************************************
// //  * NEWTON–RAPHSON TO ESTIMATE THETA
// //  ************************************************************/
// // function estimateTheta2PL(rows: { a: number; b: number; correct: number }[]) {
// //     if (rows.length === 0) return 0;

// //     let theta = 0;            // khởi tạo trung bình
// //     const maxIter = 50;

// //     for (let iter = 0; iter < maxIter; iter++) {
// //         let num = 0;
// //         let den = 0;

// //         for (const row of rows) {
// //             const { a, b, correct } = row;

// //             const p = P2PL(theta, a, b);
// //             const q = 1 - p;

// //             // Gradient và Hessian
// //             num += a * (correct - p);
// //             den += a * a * p * q;
// //         }

// //         if (den === 0) break;

// //         theta += num / den;

// //         // Clamp để ổn định
// //         theta = Math.max(-4, Math.min(theta, 4));
// //     }

// //     return theta;
// // }

// // /************************************************************
// //  * STEP 4 — CALCULATE THETA (OVERALL + PART 1–7)
// //  ************************************************************/
// // export function calculateTheta2PL(result: {
// //     responses: {
// //         a: number;
// //         b: number;
// //         c: number;
// //         correct: number;
// //         part: number | null;
// //     }[]
// // }) {

// //     const overallRows: { a: number; b: number; correct: number }[] = [];
// //     const rowsByPart: Record<number, { a: number; b: number; correct: number }[]> = {};

// //     for (const r of result.responses) {
// //         const row = { a: r.a, b: r.b, correct: r.correct };
// //         overallRows.push(row);

// //         if (r.part != null && r.part >= 1 && r.part <= 7) {
// //             if (!rowsByPart[r.part]) rowsByPart[r.part] = [];
// //             rowsByPart[r.part].push(row);
// //         }
// //     }

// //     // Theta tổng
// //     const thetaOverall = estimateTheta2PL(overallRows);

// //     // Theta theo Part 1..7
// //     const thetaByPart: Record<number, number> = {};
// //     for (let part = 1; part <= 7; part++) {
// //         const rows = rowsByPart[part] || [];
// //         thetaByPart[part] = estimateTheta2PL(rows);
// //     }

// //     return {
// //         thetaOverall,
// //         thetaByPart
// //     };
// // }

// // /************************************************************
// //  * STEP 5 — SAVE ABILITY TO DATABASE
// //  ************************************************************/
// // export async function saveAbilityToDB(
// //     userId: string,
// //     testId: string,
// //     abilities: {
// //         thetaOverall: number;
// //         thetaByPart: Record<number, number>;
// //     }
// // ) {

// //     const { thetaOverall, thetaByPart } = abilities;

// //     console.log("📥 Saving abilities to DB:", abilities);

// //     // Lưu vào UserTest
// //     await UserTest.updateOne(
// //         { _id: testId },
// //         {
// //             theta_overall: thetaOverall,
// //             theta_parts: thetaByPart
// //         }
// //     );

// //     // Lưu vào User (latest ability)
// //     await User.updateOne(
// //         { _id: userId },
// //         {
// //             latest_theta_overall: thetaOverall,
// //             latest_theta_parts: thetaByPart
// //         }
// //     );

// //     console.log(`✔ Ability saved for user=${userId}, test=${testId}`);
// // }

// // /************************************************************
// //  * θ → CEFR Level bands
// //  ************************************************************/
// // function thetaToCEFR(theta: number) {
// //     if (theta < -1.0) return ["A1", "A2"];
// //     if (theta < -0.5) return ["A2", "B1"];
// //     if (theta < 0.0) return ["B1", "B2"];
// //     if (theta < 0.7) return ["B1", "B2", "C1"];
// //     return ["B2", "C1", "C2"];
// // }

// // /************************************************************
// //  * θ → Weight range (0–1)
// //  ************************************************************/
// // function thetaToWeightRange(theta: number) {
// //     if (theta < -0.7) return { min: 0.0, max: 0.4 }; // dễ
// //     if (theta < -0.2) return { min: 0.0, max: 0.6 }; // dễ -> TB
// //     if (theta < 0.5) return { min: 0.3, max: 0.8 }; // TB
// //     return { min: 0.5, max: 1.0 }; // TB -> Khó
// // }

// // /************************************************************
// //  * CORE TYPES BY PART
// //  ************************************************************/
// // const CORE_TYPES_BY_PART: Record<number, string[]> = {
// //     1: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
// //     2: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
// //     3: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
// //     4: ["lesson", "dictation", "shadowing", "quiz", "vocab"],
// //     5: ["lesson", "quiz", "vocab"],
// //     6: ["lesson", "quiz", "vocab"],
// //     7: ["lesson", "quiz", "vocab"]
// // }

// // /************************************************************
// //  * MAIN FUNCTION — FILTER CANDIDATE ITEMS
// //  ************************************************************/
// // export async function getCandidateLearningItems(
// //     thetaByPart: Record<number, number>
// // ) {
// //     const result: Record<number, any> = {};

// //     for (let part = 1; part <= 7; part++) {
// //         const theta = thetaByPart[part];

// //         // Nếu không có dữ liệu → trả về rỗng
// //         if (theta === undefined || isNaN(theta)) {
// //             result[part] = {
// //                 lessons: [],
// //                 dictations: [],
// //                 shadowings: [],
// //                 quizzes: [],
// //                 vocab: []
// //             };
// //             continue;
// //         }

// //         const cefrLevels = thetaToCEFR(theta);
// //         const weightRange = thetaToWeightRange(theta);
// //         const allowedTypes = CORE_TYPES_BY_PART[part];

// //         console.log(`\n=== Part ${part} ===`);
// //         console.log("Theta:", theta);
// //         console.log("CEFR:", cefrLevels);
// //         console.log("Weight:", weightRange);
// //         console.log("Allowed types:", allowedTypes);

// //         const partResult: any = {
// //             lessons: [],
// //             dictations: [],
// //             shadowings: [],
// //             quizzes: [],
// //             vocab: []
// //         };

// //         /***********************************
// //          * LESSON
// //          ***********************************/
// //         if (allowedTypes.includes("lesson")) {
// //             partResult.lessons = await Lesson.find({
// //                 part_type: part,
// //                 level: { $in: cefrLevels },
// //                 weight: { $gte: weightRange.min, $lte: weightRange.max }
// //             }).select("_id title summary level weight planned_completion_time part_type");
// //         }

// //         /***********************************
// //          * DICTATION
// //          ***********************************/
// //         if (allowedTypes.includes("dictation")) {
// //             partResult.dictations = await Dictation.find({
// //                 part_type: part,
// //                 level: { $in: cefrLevels },
// //                 weight: { $gte: weightRange.min, $lte: weightRange.max }
// //             }).select("_id title transcript level duration weight");
// //         }

// //         /***********************************
// //          * SHADOWING
// //          ***********************************/
// //         if (allowedTypes.includes("shadowing")) {
// //             partResult.shadowings = await Shadowing.find({
// //                 part_type: part,
// //                 level: { $in: cefrLevels },
// //                 weight: { $gte: weightRange.min, $lte: weightRange.max }
// //             }).select("_id title transcript level duration weight");
// //         }

// //         /***********************************
// //          * QUIZ
// //          ***********************************/
// //         if (allowedTypes.includes("quiz")) {
// //             partResult.quizzes = await Quiz.find({
// //                 part_type: part,
// //                 level: { $in: cefrLevels },
// //                 weight: { $gte: weightRange.min, $lte: weightRange.max }
// //             }).select("_id title level weight planned_completion_time question_ids");
// //         }

// //         /***********************************
// //          * VOCABULARY (luôn có)
// //          ***********************************/
// //         partResult.vocab = await TopicVocabulary.find({
// //             part_type: part,
// //             level: { $in: cefrLevels }
// //         }).select("_id title description level iconName");

// //         /***********************************
// //          * STORE
// //          ***********************************/
// //         result[part] = partResult;
// //     }

// //     return result;
// // }

// // export function normalizeRetrieved(raw: any) {
// //     const result: any = {};

// //     for (const part of Object.keys(raw)) {
// //         const partNumber = Number(part);
// //         const block = raw[part];

// //         const ids = block.ids[0];
// //         const docs = block.documents[0];
// //         const metas = block.metadatas[0];

// //         result[partNumber] = ids.map((id: any, idx: any) => {
// //             const meta = metas[idx];
// //             const doc = docs[idx];

// //             return {
// //                 part: meta.part_type,
// //                 kind: meta.item_type,       // quiz | lesson | dictation | vocab
// //                 resource_id: meta.item_id,  // real Mongo ObjectId
// //                 level: meta.level,
// //                 weight: meta.weight ?? 0,
// //                 title: extractTitle(doc),
// //                 estimated_time: estimateStudyTime(meta.item_type)
// //             };
// //         });
// //     }

// //     return result;
// // }

// // function extractTitle(doc: string) {
// //     const m = doc.match(/TITLE:\s*(.+)/);
// //     return m ? m[1].trim() : "";
// // }

// // function estimateStudyTime(kind: string) {
// //     switch (kind) {
// //         case "quiz": return 10;
// //         case "lesson": return 20;
// //         case "vocab": return 5;
// //         case "dictation": return 10;
// //         case "shadowing": return 15;
// //         default: return 10;
// //     }
// // }

// // async function main() {
// //     // const result = await submitMiniTestService(
// //     //     "68addc718f9d649a167e8041",
// //     //     "692697d736d35f33229543b1", [{
// //     //         question_id: "692697d736d35f33229543b3", selectedOption: "A"
// //     //     }, {
// //     //         question_id: "692697d736d35f33229543b7", selectedOption: "C"
// //     //     }])

// //     // const abilities = calculateTheta2PL(result);

// //     // await saveAbilityToDB("68addc718f9d649a167e8041", "692697d736d35f33229543b1", abilities);
// //     // console.log("Ability", abilities);

// //     const thetaByPart = {
// //         1: -0.8,
// //         2: -0.5,
// //         3: 0.0,
// //         4: 0.3,
// //         5: -0.6,
// //         6: 0.2,
// //         7: 0.6
// //     };

// //     const mini_test_new = await generateNextWeekMiniTest(
// //         "68addc718f9d649a167e8041",
// //         thetaByPart
// //     );

// //     // const candidates = await getCandidateLearningItems(thetaByPart);

// //     // saveDebugFile(
// //     //     `candidates_${Date.now()}.json`,
// //     //     candidates
// //     // );

// //     // await ingestLearning(candidates);

// //     const retrieved: any = {};

// //     for (let part = 1; part <= 7; part++) {
// //         retrieved[part] = await retrieveLearning(
// //             `Retrieve learning items for TOEIC Part ${part} based on difficulty & level`,
// //             50
// //         );
// //     }

// //     const normalized = normalizeRetrieved(retrieved);

// //     // saveDebugFile(
// //     //     `normalized_${Date.now()}.json`,
// //     //     normalized
// //     // );

// //     const weeklyPlan = await generateIRTWeeklyPlan({
// //         userProfile: {
// //             user_id: "68addc718f9d649a167e8041",
// //             current_week: 2,
// //             hours_per_day: 1,
// //             study_days_per_week: 5,
// //             target_score: 700,
// //             target_date: "2026-02-10"
// //         },
// //         thetaOverall: 0.1,              // nếu có
// //         thetaByPart,
// //         candidateItems: normalized,
// //         miniTest: mini_test_new
// //     });

// //     saveDebugFile(
// //         `weekly_plan_${Date.now()}.json`,
// //         weeklyPlan
// //     );
// // }

// // main();

// // // Migration script to backfill IRT fields
// // // async function migrateIRT() {
// // //     const topic = await TopicVocabulary.find();

// // //     for (const t of topic) {
// // //         const part_type = Math.round(Math.random() * 6) + 1; // Random part 1-7
// // //         const level = ["A1", "A2", "B1", "B2", "C1", "C2"][Math.floor(Math.random() * 6)];

// // //         t.level = level as any;
// // //         t.part_type = part_type;
// // //         await t.save();
// // //     }

// // //     console.log("Migration completed!");
// // // }

// // // migrateIRT();

// // // import { ChromaClient } from "chromadb";

// // // export async function deleteLearningItemsCollection() {
// // //     const client = new ChromaClient({ path: process.env.CHROMA_URL });

// // //     const collectionName = "learning_items";

// // //     try {
// // //         await client.deleteCollection({ name: collectionName });
// // //         console.log(`🗑️ Deleted Chroma collection: ${collectionName}`);
// // //     } catch (err) {
// // //         console.error("❌ Error deleting collection:", err);
// // //     }
// // // }

// // // deleteLearningItemsCollection();
