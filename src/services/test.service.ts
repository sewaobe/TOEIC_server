import { Test, ITest, UserTest, IQuestion } from "../models";
import { Types } from "mongoose";

// Lấy full test với tất cả populated fields
export const getFullTest = async (testId: string): Promise<ITest | null> => {
  return Test.findById(testId)
    .populate("audioListen", "url")
    .populate("questions.$*.groups.audioUrl", "url" )
    .populate("questions.$*.groups.imagesUrl", "url")
    .populate("questions.$*.groups.questions");
};

// Lấy một part cụ thể
export const getPart = async (testId: string, partName: string) => {
  const test = await getFullTest(testId);
  if (!test) return null;
  return test.questions.get("Part " + partName) || null;
};

// Lấy nhiều part
export const getParts = async (testId: string, partNames: string[]) => {
  const test = await getFullTest(testId);
  if (!test) return null;

  const result: Record<string, any> = {};
  partNames.forEach((p) => {
    const data = test.questions.get("Part " + p);
    if (data) result["Part " + p] = data;
  });
  return result;
};

// Submit test
export const submitTest = async (
  userId: string,
  testId: string,
  answers: { question_id: string; selectedOption: string }[]
) => {
  const test = await getFullTest(testId);
  if (!test) throw new Error("Test not found");

  const detailedAnswers = answers.map((a) => {
    let correct = false;

    // Duyệt từng part trong Map
    test.questions.forEach((partData, partName) => {
      if (!partData.groups || partData.groups.length === 0) {
        console.log("No groups in part:", partName);
        return;
      }

      // Duyệt từng group trong part
      for (const group of partData.groups) {
        // Duyệt từng question trong group
        for (const q of group.questions || []) {
          const question = q as unknown as IQuestion; // cast qua unknown trước
          if (question._id!.toString() === a.question_id) {
            correct = question.correctAnswer === a.selectedOption[0];
            break;
          }
        }

        if (correct) break; // đã tìm thấy question, thoát group
      }
      if (correct) return; // đã tìm thấy question, thoát part
    });

    return {
      question_id: new Types.ObjectId(a.question_id),
      selectedOption: a.selectedOption[0],
      isCorrect: correct,
    };
  });

  // Tính điểm
  const score =
    detailedAnswers.filter((a) => a.isCorrect).length / detailedAnswers.length*990;

  // Lưu UserTest
  const userTest = new UserTest({
    user_id: new Types.ObjectId(userId),
    test_id: new Types.ObjectId(testId),
    score,
    answers: detailedAnswers,
    submit_at: new Date(),
  });

  await userTest.save();

  return { score, answers: detailedAnswers };
};
