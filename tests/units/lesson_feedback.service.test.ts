/**
 * @fileoverview Unit Tests for Lesson Feedback Service
 * @description Comprehensive test suite for lesson feedback functionality
 *
 * Test Coverage:
 * - Create feedback (createLessonFeedback)
 * - Get feedback for day (getUserFeedbackForDay)
 * - Get feedbacks with pagination (getFeedbacks)
 * - Get feedbacks by user ID (getFeedbacksByUserId)
 * - Feedback statistics (getFeedbackStats, getFeedbackStatsByUserId)
 * - Popular feedback reasons (getPopularFeedbackReasons)
 * - Delete feedback (deleteFeedback)
 * - Edge cases and error handling
 *
 * @version 1.0.0
 */

import { Types } from "mongoose";
import {
    createLessonFeedback,
    getUserFeedbackForDay,
    getFeedbacks,
    getFeedbacksByUserId,
    getFeedbackStats,
    getFeedbackStatsByUserId,
    getPopularFeedbackReasons,
    deleteFeedback,
    CreateFeedbackDTO,
    FeedbackQueryOptions,
} from "../../src/services/lesson_feedback.service";
import { LearningPath, ILessonFeedback } from "../../src/models/learning_path.model";
import { DayStudy } from "../../src/models/day_study.model";
import { jest, describe, beforeEach, it, expect } from '@jest/globals';

// ============================================================
// MOCK SETUP
// ============================================================

jest.mock("../../src/models/learning_path.model");
jest.mock("../../src/models/day_study.model");

const MockedLearningPath = LearningPath as jest.Mocked<typeof LearningPath>;
const MockedDayStudy = DayStudy as jest.Mocked<typeof DayStudy>;

// ============================================================
// TEST DATA FACTORIES
// ============================================================

const createMockObjectId = () => new Types.ObjectId();

const createMockDayStudy = (overrides: any = {}) => ({
    _id: createMockObjectId(),
    week_id: createMockObjectId(),
    dayOfWeek: 1,
    status: "COMPLETED",
    ...overrides,
});

const createMockFeedback = (overrides: any = {}): ILessonFeedback => ({
    day_study_id: createMockObjectId(),
    rating: 4,
    reasons: ["Nội dung thực tế", "Giải thích chi tiết"],
    comment: "Bài học rất hay",
    is_positive: true,
    created_at: new Date(),
    ...overrides,
} as ILessonFeedback);

const createMockLearningPath = (overrides: any = {}) => ({
    _id: createMockObjectId(),
    user_id: createMockObjectId(),
    title: "Test Learning Path",
    week_study_ids: [createMockObjectId()],
    additional_week_studies: [],
    feedbacks: [],
    isActive: true,
    updated_at: new Date(),
    save: jest.fn<() => Promise<any>>().mockResolvedValue(true),
    ...overrides,
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const resetAllMocks = () => {
    jest.clearAllMocks();
};

// ============================================================
// TEST SUITES
// ============================================================

describe("Lesson Feedback Service Unit Tests", () => {
    beforeEach(() => {
        resetAllMocks();
    });

    // ==========================================================
    // SECTION 1: CREATE FEEDBACK
    // ==========================================================
    describe("1. Create Feedback (createLessonFeedback)", () => {
        describe("Validation", () => {
            it("TC-01 Should throw error when rating < 1", async () => {
                const dto: CreateFeedbackDTO = {
                    userId: createMockObjectId(),
                    dayStudyId: createMockObjectId().toString(),
                    rating: 0,
                    reasons: [],
                };

                await expect(createLessonFeedback(dto)).rejects.toThrow(
                    "Rating phải từ 1 đến 5"
                );
            });

            it("TC-02 Should throw error when rating > 5", async () => {
                const dto: CreateFeedbackDTO = {
                    userId: createMockObjectId(),
                    dayStudyId: createMockObjectId().toString(),
                    rating: 6,
                    reasons: [],
                };

                await expect(createLessonFeedback(dto)).rejects.toThrow(
                    "Rating phải từ 1 đến 5"
                );
            });

            it("TC-03 Should throw error when DayStudy not found", async () => {
                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(null);

                const dto: CreateFeedbackDTO = {
                    userId: createMockObjectId(),
                    dayStudyId: createMockObjectId().toString(),
                    rating: 4,
                };

                await expect(createLessonFeedback(dto)).rejects.toThrow(
                    "Không tìm thấy ngày học"
                );
            });

            it("TC-04 Should throw error when LearningPath not found", async () => {
                const mockDayStudy = createMockDayStudy();
                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(null);

                const dto: CreateFeedbackDTO = {
                    userId: createMockObjectId(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 4,
                };

                await expect(createLessonFeedback(dto)).rejects.toThrow(
                    "Không tìm thấy lộ trình học của user"
                );
            });
        });

        describe("Create New Feedback", () => {
            it("TC-05 Should create new feedback successfully with rating >= 4 (positive)", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                    feedbacks: [],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 5,
                    reasons: ["Nội dung thực tế", "Giải thích chi tiết"],
                    comment: "Tuyệt vời!",
                };

                const result = await createLessonFeedback(dto);

                expect(result.rating).toBe(5);
                expect(result.is_positive).toBe(true);
                expect(result.reasons).toEqual(["Nội dung thực tế", "Giải thích chi tiết"]);
                expect(result.comment).toBe("Tuyệt vời!");
                expect(mockLearningPath.save).toHaveBeenCalled();
            });

            it("TC-06 Should create new feedback with rating < 4 (negative)", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                    feedbacks: [],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 2,
                    reasons: ["Quá khó", "Giải thích khó hiểu"],
                };

                const result = await createLessonFeedback(dto);

                expect(result.rating).toBe(2);
                expect(result.is_positive).toBe(false);
                expect(result.reasons).toEqual(["Quá khó", "Giải thích khó hiểu"]);
            });

            it("TC-07 Should create feedback without optional comment", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                    feedbacks: [],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 4,
                };

                const result = await createLessonFeedback(dto);

                expect(result.rating).toBe(4);
                expect(result.reasons).toEqual([]);
                expect(result.comment).toBeUndefined();
            });

            it("TC-08 Should create feedback with empty reasons array", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                    feedbacks: [],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 3,
                    reasons: [],
                };

                const result = await createLessonFeedback(dto);

                expect(result.reasons).toEqual([]);
            });
        });

        describe("Update Existing Feedback", () => {
            it("TC-09 Should update existing feedback for same day", async () => {
                const dayStudyId = createMockObjectId();
                const mockDayStudy = createMockDayStudy({ _id: dayStudyId });

                const existingFeedback = createMockFeedback({
                    day_study_id: dayStudyId,
                    rating: 3,
                    is_positive: false,
                });

                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                    feedbacks: [existingFeedback],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: dayStudyId.toString(),
                    rating: 5,
                    reasons: ["Đúng trình độ"],
                    comment: "Cập nhật đánh giá",
                };

                const result = await createLessonFeedback(dto);

                expect(result.rating).toBe(5);
                expect(result.is_positive).toBe(true);
                expect(mockLearningPath.feedbacks[0].rating).toBe(5);
                expect(mockLearningPath.save).toHaveBeenCalled();
            });
        });

        describe("Find LearningPath through week_study_ids", () => {
            it("TC-10 Should find LearningPath via week_study_ids", async () => {
                const weekId = createMockObjectId();
                const mockDayStudy = createMockDayStudy({ week_id: weekId });
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [weekId],
                    additional_week_studies: [],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 4,
                };

                await createLessonFeedback(dto);

                expect(MockedLearningPath.findOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        $or: [
                            { week_study_ids: weekId },
                            { additional_week_studies: weekId },
                        ],
                    })
                );
            });

            it("TC-11 Should find LearningPath via additional_week_studies", async () => {
                const weekId = createMockObjectId();
                const mockDayStudy = createMockDayStudy({ week_id: weekId });
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [],
                    additional_week_studies: [weekId],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 4,
                };

                const result = await createLessonFeedback(dto);

                expect(result).toBeDefined();
                expect(result.rating).toBe(4);
            });
        });

        describe("Rating Boundary Tests", () => {
            it("TC-12 Should accept rating = 1 (minimum)", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 1,
                };

                const result = await createLessonFeedback(dto);

                expect(result.rating).toBe(1);
                expect(result.is_positive).toBe(false);
            });

            it("TC-13 Should accept rating = 5 (maximum)", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 5,
                };

                const result = await createLessonFeedback(dto);

                expect(result.rating).toBe(5);
                expect(result.is_positive).toBe(true);
            });

            it("TC-14 Should mark rating = 3 as negative (is_positive = false)", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 3,
                };

                const result = await createLessonFeedback(dto);

                expect(result.is_positive).toBe(false);
            });

            it("TC-15 Should mark rating = 4 as positive (is_positive = true)", async () => {
                const mockDayStudy = createMockDayStudy();
                const mockLearningPath = createMockLearningPath({
                    week_study_ids: [mockDayStudy.week_id],
                });

                (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
                (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating: 4,
                };

                const result = await createLessonFeedback(dto);

                expect(result.is_positive).toBe(true);
            });
        });
    });

    // ==========================================================
    // SECTION 2: GET USER FEEDBACK FOR DAY
    // ==========================================================
    describe("2. Get User Feedback For Day (getUserFeedbackForDay)", () => {
        it("TC-16 Should return null when DayStudy not found", async () => {
            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await getUserFeedbackForDay(
                createMockObjectId().toString(),
                createMockObjectId().toString()
            );

            expect(result).toBeNull();
        });

        it("TC-17 Should return null when LearningPath not found", async () => {
            const mockDayStudy = createMockDayStudy();
            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await getUserFeedbackForDay(
                createMockObjectId().toString(),
                mockDayStudy._id.toString()
            );

            expect(result).toBeNull();
        });

        it("TC-18 Should return null when LearningPath has no feedbacks", async () => {
            const mockDayStudy = createMockDayStudy();
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
                feedbacks: undefined,
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getUserFeedbackForDay(
                mockLearningPath.user_id.toString(),
                mockDayStudy._id.toString()
            );

            expect(result).toBeNull();
        });

        it("TC-19 Should return null when no feedback for specific day", async () => {
            const mockDayStudy = createMockDayStudy();
            const differentDayId = createMockObjectId();
            const mockFeedback = createMockFeedback({ day_study_id: differentDayId });
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
                feedbacks: [mockFeedback],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getUserFeedbackForDay(
                mockLearningPath.user_id.toString(),
                mockDayStudy._id.toString()
            );

            expect(result).toBeNull();
        });

        it("TC-20 Should return feedback when found", async () => {
            const dayStudyId = createMockObjectId();
            const mockDayStudy = createMockDayStudy({ _id: dayStudyId });
            const mockFeedback = createMockFeedback({
                day_study_id: dayStudyId,
                rating: 5,
            });
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
                feedbacks: [mockFeedback],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getUserFeedbackForDay(
                mockLearningPath.user_id.toString(),
                dayStudyId.toString()
            );

            expect(result).not.toBeNull();
            expect(result?.rating).toBe(5);
        });
    });

    // ==========================================================
    // SECTION 3: GET FEEDBACKS WITH PAGINATION
    // ==========================================================
    describe("3. Get Feedbacks with Pagination (getFeedbacks)", () => {
        it("TC-21 Should return empty result when LearningPath not found", async () => {
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await getFeedbacks({
                learningPathId: createMockObjectId().toString(),
            });

            expect(result.items).toEqual([]);
            expect(result.pagination.total).toBe(0);
        });

        it("TC-22 Should return empty result when no feedbacks", async () => {
            const mockLearningPath = createMockLearningPath({ feedbacks: [] });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
            });

            expect(result.items).toEqual([]);
            expect(result.pagination.total).toBe(0);
        });

        it("TC-23 Should return all feedbacks with default pagination", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5 }),
                createMockFeedback({ rating: 4 }),
                createMockFeedback({ rating: 3 }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
            });

            expect(result.items.length).toBe(3);
            expect(result.pagination.total).toBe(3);
            expect(result.pagination.page).toBe(1);
            expect(result.pagination.limit).toBe(10);
        });

        it("TC-24 Should filter by rating", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5 }),
                createMockFeedback({ rating: 4 }),
                createMockFeedback({ rating: 5 }),
                createMockFeedback({ rating: 3 }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
                rating: 5,
            });

            expect(result.items.length).toBe(2);
            expect(result.items.every((fb) => fb.rating === 5)).toBe(true);
        });

        it("TC-25 Should filter by isPositive = true", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5, is_positive: true }),
                createMockFeedback({ rating: 4, is_positive: true }),
                createMockFeedback({ rating: 2, is_positive: false }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
                isPositive: true,
            });

            expect(result.items.length).toBe(2);
            expect(result.items.every((fb) => fb.is_positive === true)).toBe(true);
        });

        it("TC-26 Should filter by isPositive = false", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5, is_positive: true }),
                createMockFeedback({ rating: 2, is_positive: false }),
                createMockFeedback({ rating: 1, is_positive: false }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
                isPositive: false,
            });

            expect(result.items.length).toBe(2);
            expect(result.items.every((fb) => fb.is_positive === false)).toBe(true);
        });

        it("TC-27 Should paginate correctly", async () => {
            const feedbacks = Array.from({ length: 25 }, (_, i) =>
                createMockFeedback({
                    rating: (i % 5) + 1,
                    created_at: new Date(Date.now() - i * 1000),
                })
            );
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const page1 = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
                page: 1,
                limit: 10,
            });

            expect(page1.items.length).toBe(10);
            expect(page1.pagination.page).toBe(1);
            expect(page1.pagination.total).toBe(25);
            expect(page1.pagination.totalPages).toBe(3);

            const page2 = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
                page: 2,
                limit: 10,
            });

            expect(page2.items.length).toBe(10);
            expect(page2.pagination.page).toBe(2);

            const page3 = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
                page: 3,
                limit: 10,
            });

            expect(page3.items.length).toBe(5);
            expect(page3.pagination.page).toBe(3);
        });

        it("TC-28 Should sort by created_at descending", async () => {
            const now = Date.now();
            const feedbacks = [
                createMockFeedback({ created_at: new Date(now - 3000) }),
                createMockFeedback({ created_at: new Date(now - 1000) }),
                createMockFeedback({ created_at: new Date(now - 2000) }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
            });

            // Should be sorted newest first
            for (let i = 0; i < result.items.length - 1; i++) {
                expect(
                    new Date(result.items[i].created_at).getTime()
                ).toBeGreaterThanOrEqual(
                    new Date(result.items[i + 1].created_at).getTime()
                );
            }
        });
    });

    // ==========================================================
    // SECTION 4: GET FEEDBACKS BY USER ID
    // ==========================================================
    describe("4. Get Feedbacks By User ID (getFeedbacksByUserId)", () => {
        it("TC-29 Should return empty array when no LearningPath found", async () => {
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockReturnValue({
                populate: jest.fn<() => Promise<any>>().mockResolvedValue(null),
            });

            const result = await getFeedbacksByUserId(createMockObjectId().toString());

            expect(result).toEqual([]);
        });

        it("TC-30 Should return empty array when no feedbacks", async () => {
            const mockLearningPath = createMockLearningPath({ feedbacks: undefined });
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockReturnValue({
                populate: jest.fn<() => Promise<any>>().mockResolvedValue(mockLearningPath),
            });

            const result = await getFeedbacksByUserId(mockLearningPath.user_id.toString());

            expect(result).toEqual([]);
        });

        it("TC-31 Should return feedbacks sorted by created_at desc", async () => {
            const now = Date.now();
            const feedbacks = [
                createMockFeedback({ created_at: new Date(now - 3000) }),
                createMockFeedback({ created_at: new Date(now - 1000) }),
                createMockFeedback({ created_at: new Date(now - 2000) }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockReturnValue({
                populate: jest.fn<() => Promise<any>>().mockResolvedValue(mockLearningPath),
            } as any);

            const result = await getFeedbacksByUserId(mockLearningPath.user_id.toString());

            expect(result.length).toBe(3);
            for (let i = 0; i < result.length - 1; i++) {
                expect(
                    new Date(result[i].created_at).getTime()
                ).toBeGreaterThanOrEqual(
                    new Date(result[i + 1].created_at).getTime()
                );
            }
        });

        it("TC-32 Should only get active LearningPath", async () => {
            const userId = createMockObjectId();
            const mockLearningPath = createMockLearningPath({
                user_id: userId,
                isActive: true,
                feedbacks: [createMockFeedback()],
            });
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockReturnValue({
                populate: jest.fn<() => Promise<any>>().mockResolvedValue(mockLearningPath),
            });

            await getFeedbacksByUserId(userId.toString());

            expect(MockedLearningPath.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: expect.any(Types.ObjectId),
                    isActive: true,
                })
            );
        });
    });

    // ==========================================================
    // SECTION 5: FEEDBACK STATISTICS
    // ==========================================================
    describe("5. Feedback Statistics (getFeedbackStats)", () => {
        it("TC-33 Should return zero stats when LearningPath not found", async () => {
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await getFeedbackStats(createMockObjectId().toString());

            expect(result.totalFeedbacks).toBe(0);
            expect(result.averageRating).toBe(0);
            expect(result.positiveFeedbacks).toBe(0);
            expect(result.negativeFeedbacks).toBe(0);
            expect(result.ratingDistribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
        });

        it("TC-34 Should return zero stats when no feedbacks", async () => {
            const mockLearningPath = createMockLearningPath({ feedbacks: [] });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbackStats(mockLearningPath._id.toString());

            expect(result.totalFeedbacks).toBe(0);
            expect(result.averageRating).toBe(0);
        });

        it("TC-35 Should calculate correct statistics", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5, is_positive: true }),
                createMockFeedback({ rating: 4, is_positive: true }),
                createMockFeedback({ rating: 4, is_positive: true }),
                createMockFeedback({ rating: 3, is_positive: false }),
                createMockFeedback({ rating: 2, is_positive: false }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbackStats(mockLearningPath._id.toString());

            expect(result.totalFeedbacks).toBe(5);
            expect(result.averageRating).toBe(3.6); // (5+4+4+3+2)/5 = 3.6
            expect(result.positiveFeedbacks).toBe(3);
            expect(result.negativeFeedbacks).toBe(2);
        });

        it("TC-36 Should calculate correct rating distribution", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5 }),
                createMockFeedback({ rating: 5 }),
                createMockFeedback({ rating: 4 }),
                createMockFeedback({ rating: 4 }),
                createMockFeedback({ rating: 4 }),
                createMockFeedback({ rating: 3 }),
                createMockFeedback({ rating: 2 }),
                createMockFeedback({ rating: 1 }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbackStats(mockLearningPath._id.toString());

            expect(result.ratingDistribution).toEqual({
                1: 1,
                2: 1,
                3: 1,
                4: 3,
                5: 2,
            });
        });

        it("TC-37 Should round average rating to 2 decimal places", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5 }),
                createMockFeedback({ rating: 4 }),
                createMockFeedback({ rating: 3 }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbackStats(mockLearningPath._id.toString());

            expect(result.averageRating).toBe(4); // (5+4+3)/3 = 4
            expect(Number.isInteger(result.averageRating * 100)).toBe(true);
        });
    });

    // ==========================================================
    // SECTION 6: GET FEEDBACK STATS BY USER ID
    // ==========================================================
    describe("6. Get Feedback Stats By User ID (getFeedbackStatsByUserId)", () => {
        it("TC-38 Should return zero stats when no active LearningPath", async () => {
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await getFeedbackStatsByUserId(createMockObjectId().toString());

            expect(result.totalFeedbacks).toBe(0);
            expect(result.averageRating).toBe(0);
        });

        it("TC-39 Should query only active LearningPath", async () => {
            const userId = createMockObjectId();
            const mockLearningPath = createMockLearningPath({
                user_id: userId,
                isActive: true,
                feedbacks: [createMockFeedback()],
            });

            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            await getFeedbackStatsByUserId(userId.toString());

            expect(MockedLearningPath.findOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: expect.any(Types.ObjectId),
                    isActive: true,
                })
            );
        });
    });

    // ==========================================================
    // SECTION 7: POPULAR FEEDBACK REASONS
    // ==========================================================
    describe("7. Popular Feedback Reasons (getPopularFeedbackReasons)", () => {
        it("TC-40 Should return empty array when LearningPath not found", async () => {
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await getPopularFeedbackReasons(createMockObjectId().toString());

            expect(result).toEqual([]);
        });

        it("TC-41 Should return empty array when no feedbacks", async () => {
            const mockLearningPath = createMockLearningPath({ feedbacks: undefined });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getPopularFeedbackReasons(mockLearningPath._id.toString());

            expect(result).toEqual([]);
        });

        it("TC-42 Should count reasons correctly", async () => {
            const feedbacks = [
                createMockFeedback({ reasons: ["Nội dung thực tế", "Giải thích chi tiết"] }),
                createMockFeedback({ reasons: ["Nội dung thực tế", "Đúng trình độ"] }),
                createMockFeedback({ reasons: ["Nội dung thực tế"] }),
                createMockFeedback({ reasons: ["Giải thích chi tiết"] }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getPopularFeedbackReasons(mockLearningPath._id.toString());

            expect(result).toContainEqual({ reason: "Nội dung thực tế", count: 3 });
            expect(result).toContainEqual({ reason: "Giải thích chi tiết", count: 2 });
            expect(result).toContainEqual({ reason: "Đúng trình độ", count: 1 });
        });

        it("TC-43 Should sort reasons by count descending", async () => {
            const feedbacks = [
                createMockFeedback({ reasons: ["A", "B", "C"] }),
                createMockFeedback({ reasons: ["A", "B"] }),
                createMockFeedback({ reasons: ["A"] }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getPopularFeedbackReasons(mockLearningPath._id.toString());

            expect(result[0]).toEqual({ reason: "A", count: 3 });
            expect(result[1]).toEqual({ reason: "B", count: 2 });
            expect(result[2]).toEqual({ reason: "C", count: 1 });
        });

        it("TC-44 Should filter by isPositive = true", async () => {
            const feedbacks = [
                createMockFeedback({ reasons: ["Reason Positive 1"], is_positive: true }),
                createMockFeedback({ reasons: ["Reason Positive 2"], is_positive: true }),
                createMockFeedback({ reasons: ["Reason Negative 1"], is_positive: false }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getPopularFeedbackReasons(
                mockLearningPath._id.toString(),
                true
            );

            expect(result.length).toBe(2);
            expect(result.some((r) => r.reason === "Reason Negative 1")).toBe(false);
        });

        it("TC-45 Should filter by isPositive = false", async () => {
            const feedbacks = [
                createMockFeedback({ reasons: ["Reason Positive 1"], is_positive: true }),
                createMockFeedback({ reasons: ["Reason Negative 1"], is_positive: false }),
                createMockFeedback({ reasons: ["Reason Negative 2"], is_positive: false }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getPopularFeedbackReasons(
                mockLearningPath._id.toString(),
                false
            );

            expect(result.length).toBe(2);
            expect(result.some((r) => r.reason === "Reason Positive 1")).toBe(false);
        });

        it("TC-46 Should limit to top 10 reasons", async () => {
            const reasons = Array.from({ length: 15 }, (_, i) => `Reason ${i + 1}`);
            const feedbacks = reasons.map((reason) =>
                createMockFeedback({ reasons: [reason] })
            );
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getPopularFeedbackReasons(mockLearningPath._id.toString());

            expect(result.length).toBe(10);
        });
    });

    // ==========================================================
    // SECTION 8: DELETE FEEDBACK
    // ==========================================================
    describe("8. Delete Feedback (deleteFeedback)", () => {
        it("TC-47 Should return false when DayStudy not found", async () => {
            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await deleteFeedback(
                createMockObjectId().toString(),
                createMockObjectId().toString()
            );

            expect(result).toBe(false);
        });

        it("TC-48 Should return false when LearningPath not found", async () => {
            const mockDayStudy = createMockDayStudy();
            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(null);

            const result = await deleteFeedback(
                mockDayStudy._id.toString(),
                createMockObjectId().toString()
            );

            expect(result).toBe(false);
        });

        it("TC-49 Should return false when no feedback was deleted", async () => {
            const mockDayStudy = createMockDayStudy();
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);
            (MockedLearningPath.updateOne as jest.MockedFunction<any>).mockResolvedValue({
                modifiedCount: 0,
            });

            const result = await deleteFeedback(
                mockDayStudy._id.toString(),
                mockLearningPath.user_id.toString()
            );

            expect(result).toBe(false);
        });

        it("TC-50 Should return true when feedback deleted successfully", async () => {
            const dayStudyId = createMockObjectId();
            const mockDayStudy = createMockDayStudy({ _id: dayStudyId });
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);
            (MockedLearningPath.updateOne as jest.MockedFunction<any>).mockResolvedValue({
                modifiedCount: 1,
            });

            const result = await deleteFeedback(
                dayStudyId.toString(),
                mockLearningPath.user_id.toString()
            );

            expect(result).toBe(true);
        });

        it("TC-51 Should call updateOne with correct $pull query", async () => {
            const dayStudyId = createMockObjectId();
            const mockDayStudy = createMockDayStudy({ _id: dayStudyId });
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);
            (MockedLearningPath.updateOne as jest.MockedFunction<any>).mockResolvedValue({
                modifiedCount: 1,
            });

            await deleteFeedback(
                dayStudyId.toString(),
                mockLearningPath.user_id.toString()
            );

            expect(MockedLearningPath.updateOne).toHaveBeenCalledWith(
                { _id: mockLearningPath._id },
                expect.objectContaining({
                    $pull: {
                        feedbacks: { day_study_id: expect.any(Types.ObjectId) },
                    },
                    $set: { updated_at: expect.any(Date) },
                })
            );
        });
    });

    // ==========================================================
    // SECTION 9: EDGE CASES AND ERROR HANDLING
    // ==========================================================
    describe("9. Edge Cases and Error Handling", () => {
        it("TC-52 Should handle empty reasons array in feedback", async () => {
            const mockDayStudy = createMockDayStudy();
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const dto: CreateFeedbackDTO = {
                userId: mockLearningPath.user_id.toString(),
                dayStudyId: mockDayStudy._id.toString(),
                rating: 4,
                reasons: [],
            };

            const result = await createLessonFeedback(dto);

            expect(result.reasons).toEqual([]);
        });

        it("TC-53 Should handle very long comment", async () => {
            const mockDayStudy = createMockDayStudy();
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const longComment = "A".repeat(500);
            const dto: CreateFeedbackDTO = {
                userId: mockLearningPath.user_id.toString(),
                dayStudyId: mockDayStudy._id.toString(),
                rating: 4,
                comment: longComment,
            };

            const result = await createLessonFeedback(dto);

            expect(result.comment).toBe(longComment);
        });

        it("TC-54 Should handle special characters in comment", async () => {
            const mockDayStudy = createMockDayStudy();
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const specialComment = "Bài học <script>alert('xss')</script> rất hay! 👍🎉";
            const dto: CreateFeedbackDTO = {
                userId: mockLearningPath.user_id.toString(),
                dayStudyId: mockDayStudy._id.toString(),
                rating: 5,
                comment: specialComment,
            };

            const result = await createLessonFeedback(dto);

            expect(result.comment).toBe(specialComment);
        });

        it("TC-55 Should handle userId as string and ObjectId", async () => {
            const mockDayStudy = createMockDayStudy();
            const userId = createMockObjectId();
            const mockLearningPath = createMockLearningPath({
                user_id: userId,
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            // Test with string
            const dto1: CreateFeedbackDTO = {
                userId: userId.toString(),
                dayStudyId: mockDayStudy._id.toString(),
                rating: 4,
            };

            const result1 = await createLessonFeedback(dto1);
            expect(result1).toBeDefined();

            // Test with ObjectId
            const dto2: CreateFeedbackDTO = {
                userId: userId,
                dayStudyId: mockDayStudy._id.toString(),
                rating: 4,
            };

            const result2 = await createLessonFeedback(dto2);
            expect(result2).toBeDefined();
        });

        it("TC-56 Should handle multiple feedbacks from same user", async () => {
            const feedbacks = Array.from({ length: 10 }, () =>
                createMockFeedback({ day_study_id: createMockObjectId() })
            );
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbackStats(mockLearningPath._id.toString());

            expect(result.totalFeedbacks).toBe(10);
        });

        it("TC-57 Should handle feedbacks with undefined fields gracefully", async () => {
            const feedbacks = [
                createMockFeedback({ comment: undefined }),
                createMockFeedback({ reasons: [] }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
            });

            expect(result.items.length).toBe(2);
        });
    });

    // ==========================================================
    // SECTION 10: INTEGRATION SCENARIOS
    // ==========================================================
    describe("10. Integration Scenarios", () => {
        it("TC-58 Should complete full feedback workflow", async () => {
            const dayStudyId = createMockObjectId();
            const mockDayStudy = createMockDayStudy({ _id: dayStudyId });
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
                feedbacks: [],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            // Step 1: Create feedback
            const dto: CreateFeedbackDTO = {
                userId: mockLearningPath.user_id.toString(),
                dayStudyId: dayStudyId.toString(),
                rating: 5,
                reasons: ["Nội dung thực tế"],
                comment: "Tuyệt vời!",
            };

            const created = await createLessonFeedback(dto);
            expect(created.rating).toBe(5);
            expect(mockLearningPath.feedbacks.length).toBe(1);

            // Step 2: Get feedback for day
            const retrieved = await getUserFeedbackForDay(
                mockLearningPath.user_id.toString(),
                dayStudyId.toString()
            );
            expect(retrieved?.rating).toBe(5);
        });

        it("TC-59 Should handle concurrent feedback submissions", async () => {
            const mockDayStudy = createMockDayStudy();
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
                feedbacks: [],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const dto: CreateFeedbackDTO = {
                userId: mockLearningPath.user_id.toString(),
                dayStudyId: mockDayStudy._id.toString(),
                rating: 4,
            };

            // Simulate concurrent submissions
            const promises = [
                createLessonFeedback(dto),
                createLessonFeedback({ ...dto, rating: 5 }),
            ];

            const results = await Promise.all(promises);

            // Both should complete without error
            expect(results[0]).toBeDefined();
            expect(results[1]).toBeDefined();
        });

        it("TC-60 Should correctly aggregate stats across multiple days", async () => {
            const feedbacks = [
                createMockFeedback({ rating: 5, reasons: ["A", "B"], is_positive: true }),
                createMockFeedback({ rating: 4, reasons: ["A"], is_positive: true }),
                createMockFeedback({ rating: 3, reasons: ["C"], is_positive: false }),
                createMockFeedback({ rating: 2, reasons: ["D"], is_positive: false }),
                createMockFeedback({ rating: 1, reasons: ["E"], is_positive: false }),
            ];
            const mockLearningPath = createMockLearningPath({ feedbacks });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const stats = await getFeedbackStats(mockLearningPath._id.toString());

            expect(stats.totalFeedbacks).toBe(5);
            expect(stats.averageRating).toBe(3); // (5+4+3+2+1)/5 = 3
            expect(stats.positiveFeedbacks).toBe(2);
            expect(stats.negativeFeedbacks).toBe(3);
            expect(stats.ratingDistribution).toEqual({
                1: 1,
                2: 1,
                3: 1,
                4: 1,
                5: 1,
            });

            const reasons = await getPopularFeedbackReasons(mockLearningPath._id.toString());

            expect(reasons.find((r) => r.reason === "A")?.count).toBe(2);
        });
    });

    // ==========================================================
    // SECTION 11: DATA VALIDATION
    // ==========================================================
    describe("11. Data Validation", () => {
        it("TC-61 Should validate rating is within [1, 5]", async () => {
            const invalidRatings = [-1, 0, 6, 10, 100];

            for (const rating of invalidRatings) {
                const dto: CreateFeedbackDTO = {
                    userId: createMockObjectId(),
                    dayStudyId: createMockObjectId().toString(),
                    rating,
                };

                await expect(createLessonFeedback(dto)).rejects.toThrow(
                    "Rating phải từ 1 đến 5"
                );
            }
        });

        it("TC-62 Should validate dayStudyId exists", async () => {
            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(null);

            const dto: CreateFeedbackDTO = {
                userId: createMockObjectId(),
                dayStudyId: "invalid-id",
                rating: 4,
            };

            await expect(createLessonFeedback(dto)).rejects.toThrow(
                "Không tìm thấy ngày học"
            );
        });

        it("TC-63 Should validate is_positive is correctly derived from rating", async () => {
            const mockDayStudy = createMockDayStudy();
            const mockLearningPath = createMockLearningPath({
                week_study_ids: [mockDayStudy.week_id],
            });

            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(mockDayStudy);
            (MockedLearningPath.findOne as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            const testCases = [
                { rating: 1, expectedPositive: false },
                { rating: 2, expectedPositive: false },
                { rating: 3, expectedPositive: false },
                { rating: 4, expectedPositive: true },
                { rating: 5, expectedPositive: true },
            ];

            for (const { rating, expectedPositive } of testCases) {
                const dto: CreateFeedbackDTO = {
                    userId: mockLearningPath.user_id.toString(),
                    dayStudyId: mockDayStudy._id.toString(),
                    rating,
                };

                const result = await createLessonFeedback(dto);
                expect(result.is_positive).toBe(expectedPositive);
            }
        });

        it("TC-64 Should validate pagination parameters", async () => {
            const mockLearningPath = createMockLearningPath({
                feedbacks: Array.from({ length: 50 }, () => createMockFeedback()),
            });
            (MockedLearningPath.findById as jest.MockedFunction<any>).mockResolvedValue(mockLearningPath);

            // Test page = 0 should default to 1
            const result = await getFeedbacks({
                learningPathId: mockLearningPath._id.toString(),
                page: 0,
                limit: 10,
            });

            // Even with page=0, should return results (defaults handled)
            expect(result.items.length).toBeGreaterThan(0);
        });

        it("TC-65 Should validate ObjectId format", async () => {
            // This test verifies behavior with potentially invalid ObjectId
            (MockedDayStudy.findById as jest.MockedFunction<any>).mockResolvedValue(null);

            const dto: CreateFeedbackDTO = {
                userId: "not-a-valid-objectid",
                dayStudyId: "also-not-valid",
                rating: 4,
            };

            // Should throw due to DayStudy not found (mock returns null)
            await expect(createLessonFeedback(dto)).rejects.toThrow();
        });
    });
});