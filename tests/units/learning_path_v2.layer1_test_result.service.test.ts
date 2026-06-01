import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../src/models", () => ({
  Question: {
    find: jest.fn(),
  },
  Group: {
    find: jest.fn(),
  },
}));

import { Group, Question } from "../../src/models";
import {
  normalizeFullTestResult,
  normalizeInitialAssessment,
  normalizeMiniTestResult,
} from "../../src/services/learning_path_v2/layer1_test_result.service";

const createLeanQuery = (rows: unknown[]) => {
  const query: { select: jest.Mock; lean: jest.Mock } = {
    select: jest.fn(),
    lean: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.lean.mockImplementation(() => Promise.resolve(rows));
  return query;
};

const mockQuestionMetadata = (rows: unknown[] = []) => {
  (Question.find as unknown as jest.Mock).mockReturnValue(createLeanQuery(rows));
};

const mockGroupMetadata = (rows: unknown[] = []) => {
  (Group.find as unknown as jest.Mock).mockReturnValue(createLeanQuery(rows));
};

const mockNoQuestionMetadata = () => {
  mockQuestionMetadata([]);
  mockGroupMetadata([]);
};

describe("LearningPath v2 Layer 1 test result normalization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNoQuestionMetadata();
  });

  it("normalizeFullTestResult -> completedPart full_test -> returns full_test type", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        _id: "result-1",
        test_id: "test-1",
        completedPart: "full_test",
        score: 450,
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.trigger_type).toBe("full_test_review");
    expect(result.test_type).toBe("full_test");
    expect(result.source).toBe("overview_test");
    expect(result.test_result_id).toBe("result-1");
    expect(result.raw_score).toBe(450);
  });

  it("normalizeFullTestResult -> completedPart demo_test -> returns demo_test type", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        completedPart: "demo_test",
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.test_type).toBe("demo_test");
  });

  it("normalizeMiniTestResult -> completedPart mini-test or mini_test -> returns mini_test type", async () => {
    // Chuẩn bị
    const legacyDashInput = {
      trigger_type: "mini_test_completion" as const,
      user_id: "user-1",
      mini_test_result: {
        test_id: "mini-1",
        completedPart: "mini-test",
      },
    };
    const legacyUnderscoreInput = {
      trigger_type: "mini_test_completion" as const,
      user_id: "user-1",
      mini_test_result: {
        test_id: "mini-1",
        completedPart: "mini_test",
      },
    };

    // Thực thi
    const legacyDash = await normalizeMiniTestResult(legacyDashInput);
    const legacyUnderscore = await normalizeMiniTestResult(legacyUnderscoreInput);

    // Kiểm tra
    expect(legacyDash.test_type).toBe("mini_test");
    expect(legacyUnderscore.test_type).toBe("mini_test");
  });

  it("normalizeFullTestResult -> practice parts string -> returns practice type", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        completedPart: "1,2,5",
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.test_type).toBe("practice");
    expect(result.metadata.raw_completedPart).toBe("1,2,5");
  });

  it("normalizeFullTestResult -> duration in seconds -> keeps elapsed_seconds", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        duration: 123,
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.elapsed_seconds).toBe(123);
    expect(result.metadata.raw_duration).toBe(123);
  });

  it("normalizeFullTestResult -> legacy answer fields -> normalizes selected_option and is_correct", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [
          {
            question_id: "question-1",
            selectedOption: "A",
            isCorrect: true,
            part: 1,
            tags: ["photo", 2],
          },
          {
            question_id: "question-2",
            selectedOption: "B",
            isCorrect: false,
            part: 1,
          },
        ],
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.answers).toEqual([
      {
        question_id: "question-1",
        selected_option: "A",
        correct_answer: undefined,
        is_correct: true,
        part_type: 1,
        tags: ["photo", "2"],
        raw_tags: undefined,
        skills: [],
        skill_keys: [],
        response_time_seconds: undefined,
      },
      {
        question_id: "question-2",
        selected_option: "B",
        correct_answer: undefined,
        is_correct: false,
        part_type: 1,
        tags: undefined,
        raw_tags: undefined,
        skills: [],
        skill_keys: [],
        response_time_seconds: undefined,
      },
    ]);
    expect(result.accuracy).toBe(50);
  });

  it("normalizeFullTestResult -> part result with Part name -> derives part_type", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        parts: [
          {
            part_name: "Part 5",
            accuracy: 80,
            total_questions: 30,
            correct_count: 24,
          },
        ],
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.part_results).toEqual([
      {
        part_type: 5,
        part_name: "Part 5",
        total_questions: 30,
        correct_count: 24,
        accuracy: 80,
      },
    ]);
  });

  it("normalizeFullTestResult -> empty or incomplete answers -> leaves accuracy undefined", async () => {
    // Chuẩn bị
    const emptyAnswersInput = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [],
      },
    };
    const incompleteCorrectnessInput = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [{ question_id: "question-1", selectedOption: "A" }],
      },
    };

    // Thực thi
    const emptyAnswers = await normalizeFullTestResult(emptyAnswersInput);
    const incompleteCorrectness = await normalizeFullTestResult(
      incompleteCorrectnessInput
    );

    // Kiểm tra
    expect(emptyAnswers.accuracy).toBeUndefined();
    expect(incompleteCorrectness.accuracy).toBeUndefined();
  });

  it("normalizeInitialAssessment -> missing optional fields -> does not throw", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "initial_generation" as const,
      user_id: "user-1",
      initial_assessment: {},
    };

    // Thực thi
    const result = await normalizeInitialAssessment(input);

    // Kiểm tra
    expect(result).toMatchObject({
      trigger_type: "initial_generation",
      user_id: "user-1",
      test_id: "",
      test_type: "entry_test",
      source: "manual",
      answers: [],
      part_results: [],
    });
  });

  it("normalizeMiniTestResult -> unsupported raw fields -> keeps metadata.raw_input without duplicating answers or parts", async () => {
    // Chuẩn bị
    const input = {
      trigger_type: "mini_test_completion" as const,
      user_id: "user-1",
      mini_test_result: {
        test_id: "mini-1",
        completedPart: "mini-test",
        day_study_id: "day-1",
        fromLesson: true,
        answers: [{ question_id: "question-1", isCorrect: true }],
        parts: [{ part_name: "Part 1", accuracy: 100 }],
      },
    };

    // Thực thi
    const result = await normalizeMiniTestResult(input);

    // Kiểm tra
    expect(result.metadata.day_study_id).toBe("day-1");
    expect(result.metadata.fromLesson).toBe(true);
    expect(result.metadata.raw_input).toEqual({
      day_study_id: "day-1",
      fromLesson: true,
    });
  });

  it("normalizeFullTestResult -> known question tag -> returns raw_tags skills skill_keys and skill_group", async () => {
    // Chuẩn bị
    mockQuestionMetadata([
      {
        _id: "question-1",
        tags: ["[Part 5] Từ loại"],
      },
    ]);
    mockGroupMetadata([
      {
        part: 5,
        questions: ["question-1"],
      },
    ]);
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [
          {
            question_id: "question-1",
            selectedOption: "A",
            isCorrect: true,
          },
        ],
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.answers[0].raw_tags).toEqual(["[Part 5] Từ loại"]);
    expect(result.answers[0].skills).toEqual([
      {
        key: "part5_word_form",
        label_vi: "Từ loại",
        raw_tag: "[Part 5] Từ loại",
        part_type: 5,
        skill_group: "basic",
      },
    ]);
    expect(result.answers[0].skill_keys).toEqual(["part5_word_form"]);
    expect(result.answers[0].part_type).toBe(5);
  });

  it("normalizeFullTestResult -> unknown question tag -> keeps raw_tags and records unmapped tag", async () => {
    // Chuẩn bị
    mockQuestionMetadata([
      {
        _id: "question-1",
        tags: ["[Part 5] Mystery"],
      },
    ]);
    mockGroupMetadata([
      {
        part: 5,
        questions: ["question-1"],
      },
    ]);
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [{ question_id: "question-1", isCorrect: true }],
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.answers[0].raw_tags).toEqual(["[Part 5] Mystery"]);
    expect(result.answers[0].skills).toEqual([]);
    expect(result.answers[0].skill_keys).toEqual([]);
    expect(result.metadata.unmapped_tags).toEqual(["[Part 5] Mystery"]);
  });

  it("normalizeFullTestResult -> question tags without Group.part -> keeps raw answer part_type", async () => {
    // Chuẩn bị
    mockQuestionMetadata([
      {
        _id: "question-1",
        tags: ["[Part 5] Từ loại"],
      },
      {
        _id: "question-2",
        tags: ["[Part 5] Từ loại"],
      },
    ]);
    mockGroupMetadata([]);
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [
          {
            question_id: "question-1",
            isCorrect: true,
            part: 5,
          },
          {
            question_id: "question-2",
            isCorrect: true,
          },
        ],
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.answers[0].raw_tags).toEqual(["[Part 5] Từ loại"]);
    expect(result.answers[0].part_type).toBe(5);
    expect(result.answers[0].skill_keys).toEqual(["part5_word_form"]);
    expect(result.answers[1].raw_tags).toEqual(["[Part 5] Từ loại"]);
    expect(result.answers[1].part_type).toBeUndefined();
  });

  it("normalizeFullTestResult -> Group.part available -> enriches answer part_type", async () => {
    // Chuẩn bị
    mockQuestionMetadata([
      {
        _id: "question-1",
        tags: ["[Part 5] Từ loại"],
      },
    ]);
    mockGroupMetadata([
      {
        part: 5,
        questions: ["question-1"],
      },
    ]);
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [{ question_id: "question-1", isCorrect: true }],
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.answers[0].part_type).toBe(5);
  });

  it("normalizeMiniTestResult -> legacy mini-test -> keeps mini_test type and enriches skills", async () => {
    // Chuẩn bị
    mockQuestionMetadata([
      {
        _id: "question-1",
        tags: ["[Part 5] Từ loại"],
      },
    ]);
    mockGroupMetadata([
      {
        part: 5,
        questions: ["question-1"],
      },
    ]);
    const input = {
      trigger_type: "mini_test_completion" as const,
      user_id: "user-1",
      mini_test_result: {
        test_id: "mini-1",
        completedPart: "mini-test",
        answers: [{ question_id: "question-1", isCorrect: true }],
      },
    };

    // Thực thi
    const result = await normalizeMiniTestResult(input);

    // Kiểm tra
    expect(result.test_type).toBe("mini_test");
    expect(result.answers[0].skill_keys).toEqual(["part5_word_form"]);
  });

  it("normalizeFullTestResult -> missing question metadata -> does not throw and records missing count", async () => {
    // Chuẩn bị
    mockQuestionMetadata([]);
    mockGroupMetadata([]);
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        answers: [{ question_id: "question-1", isCorrect: true }],
      },
    };

    // Thực thi
    const result = await normalizeFullTestResult(input);

    // Kiểm tra
    expect(result.answers[0].skills).toEqual([]);
    expect(result.answers[0].skill_keys).toEqual([]);
    expect(result.metadata.missing_question_metadata_count).toBe(1);
  });
});
