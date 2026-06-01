import { describe, expect, it } from "@jest/globals";
import {
  normalizeFullTestResult,
  normalizeInitialAssessment,
  normalizeMiniTestResult,
} from "../../src/services/learning_path_v2/layer1_test_result.service";

describe("LearningPath v2 Layer 1 test result normalization", () => {
  it("normalizeFullTestResult -> completedPart full_test -> returns full_test type", async () => {
    // Arrange
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

    // Act
    const result = await normalizeFullTestResult(input);

    // Assert
    expect(result.trigger_type).toBe("full_test_review");
    expect(result.test_type).toBe("full_test");
    expect(result.source).toBe("overview_test");
    expect(result.test_result_id).toBe("result-1");
    expect(result.raw_score).toBe(450);
  });

  it("normalizeFullTestResult -> completedPart demo_test -> returns demo_test type", async () => {
    // Arrange
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        completedPart: "demo_test",
      },
    };

    // Act
    const result = await normalizeFullTestResult(input);

    // Assert
    expect(result.test_type).toBe("demo_test");
  });

  it("normalizeMiniTestResult -> completedPart mini-test or mini_test -> returns mini_test type", async () => {
    // Arrange
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

    // Act
    const legacyDash = await normalizeMiniTestResult(legacyDashInput);
    const legacyUnderscore = await normalizeMiniTestResult(legacyUnderscoreInput);

    // Assert
    expect(legacyDash.test_type).toBe("mini_test");
    expect(legacyUnderscore.test_type).toBe("mini_test");
  });

  it("normalizeFullTestResult -> practice parts string -> returns practice type", async () => {
    // Arrange
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        completedPart: "1,2,5",
      },
    };

    // Act
    const result = await normalizeFullTestResult(input);

    // Assert
    expect(result.test_type).toBe("practice");
    expect(result.metadata.raw_completedPart).toBe("1,2,5");
  });

  it("normalizeFullTestResult -> duration in seconds -> keeps elapsed_seconds", async () => {
    // Arrange
    const input = {
      trigger_type: "full_test_review" as const,
      user_id: "user-1",
      full_test_result: {
        test_id: "test-1",
        duration: 123,
      },
    };

    // Act
    const result = await normalizeFullTestResult(input);

    // Assert
    expect(result.elapsed_seconds).toBe(123);
    expect(result.metadata.raw_duration).toBe(123);
  });

  it("normalizeFullTestResult -> legacy answer fields -> normalizes selected_option and is_correct", async () => {
    // Arrange
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

    // Act
    const result = await normalizeFullTestResult(input);

    // Assert
    expect(result.answers).toEqual([
      {
        question_id: "question-1",
        selected_option: "A",
        correct_answer: undefined,
        is_correct: true,
        part_type: 1,
        tags: ["photo", "2"],
        response_time_seconds: undefined,
      },
      {
        question_id: "question-2",
        selected_option: "B",
        correct_answer: undefined,
        is_correct: false,
        part_type: 1,
        tags: undefined,
        response_time_seconds: undefined,
      },
    ]);
    expect(result.accuracy).toBe(50);
  });

  it("normalizeFullTestResult -> part result with Part name -> derives part_type", async () => {
    // Arrange
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

    // Act
    const result = await normalizeFullTestResult(input);

    // Assert
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
    // Arrange
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

    // Act
    const emptyAnswers = await normalizeFullTestResult(emptyAnswersInput);
    const incompleteCorrectness = await normalizeFullTestResult(
      incompleteCorrectnessInput
    );

    // Assert
    expect(emptyAnswers.accuracy).toBeUndefined();
    expect(incompleteCorrectness.accuracy).toBeUndefined();
  });

  it("normalizeInitialAssessment -> missing optional fields -> does not throw", async () => {
    // Arrange
    const input = {
      trigger_type: "initial_generation" as const,
      user_id: "user-1",
      initial_assessment: {},
    };

    // Act
    const result = await normalizeInitialAssessment(input);

    // Assert
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
    // Arrange
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

    // Act
    const result = await normalizeMiniTestResult(input);

    // Assert
    expect(result.metadata.day_study_id).toBe("day-1");
    expect(result.metadata.fromLesson).toBe(true);
    expect(result.metadata.raw_input).toEqual({
      day_study_id: "day-1",
      fromLesson: true,
    });
  });
});
