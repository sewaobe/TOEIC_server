import mongoose, { PipelineStage } from "mongoose"
import { UserTest } from "../models"
import { DictationAttempt } from "../models/dictation_attempt.model"
import { ShadowingAttempt } from "../models/shadowing_attempt.model"
import { FlashCardAttempt } from "../models/flashcard_attempt.model"

// Lấy tổng điểm TOEIC trong 1 tháng
export const getTotalScoreTestInMonth = async (userId: string) => {
    const total = await UserTest.aggregate([
        // Lọc các bài test thuộc về user và đã hoàn thành full test trong tháng hiện tại
        {
            $match: {
                user_id: new mongoose.Types.ObjectId(userId),
                submit_at: { $exists: true },
                completedPart: "full_test"
            }
        },
        // tách mảng parts để dễ dàng xử lý
        {
            $unwind: "$parts",
        },
        // Gom nhóm theo tháng/năm và loại part
        {
            $group: {
                _id: {
                    year: { $year: "$submit_at" },
                    month: { $month: "$submit_at" },
                    part_name: "$parts.part_name"
                },
                avgAccuracy: { $avg: "$parts.accuracy" },
                avgScore: { $avg: "$score" },
                count: { $sum: 1 }
            },
        },
        // Gom nhóm lại theo tháng/năm để tách riêng  listening/reading theo tháng
        {
            $group: {
                _id: {
                    year: "$_id.year",
                    month: "$_id.month"
                },
                avgScore: { $avg: "$avgScore" },
                avgListening: {
                    $avg: {
                        $cond: [{ $regexMatch: { input: "$_id.part_name", regex: /^Part [1-4]/ } }, "$avgAccuracy", null],
                    }
                },
                avgReading: {
                    $avg: {
                        $cond: [{ $regexMatch: { input: "$_id.part_name", regex: /^Part [5-7]/ } }, "$avgAccuracy", null],
                    }
                }
            }
        },
        {
            // Quy đổi phần trăm accuracy sang điểm TOEIC (0–495)
            $addFields: {
                avgListeningScore: { $divide: [{ $multiply: ["$avgListening", 495] }, 100] },
                avgReadingScore: { $divide: [{ $multiply: ["$avgReading", 495] }, 100] },
            },
        },
        {
            $addFields: {
                avgScore: { $add: ["$avgListeningScore", "$avgReadingScore"] },
            },
        },
        // Làm gọn kết quả
        {
            $project: {
                _id: 0,
                year: "$_id.year",
                month: "$_id.month",
                avgScore: { $round: ["$avgScore", 0] },
                avgListening: { $round: ["$avgListeningScore", 0] },
                avgReading: { $round: ["$avgReadingScore", 0] },
                testCount: 1
            }
        },
        // Sắp xếp theo thời gian
        { $sort: { year: 1, month: 1 } }
    ])

    return total;
}

export const getTotalUserTestInMonth = async (
    userId: string,
    year?: number,
    month?: number | "all",
    sort: "asc" | "desc" = "desc"
) => {
    // 🎯 Bộ lọc động theo năm / tháng
    const matchStage: any = {
        user_id: new mongoose.Types.ObjectId(userId),
        submit_at: { $exists: true },
    };

    if (year) {
        matchStage.$expr = { $eq: [{ $year: "$submit_at" }, year] };
    }

    if (month && month !== "all") {
        matchStage.$expr = matchStage.$expr
            ? {
                $and: [
                    matchStage.$expr,
                    { $eq: [{ $month: "$submit_at" }, Number(month)] },
                ],
            }
            : { $eq: [{ $month: "$submit_at" }, Number(month)] };
    }

    const pipeline: PipelineStage[] = [
        { $match: matchStage },

        // 🎧 Dựng thông tin từng bài test (từng ngày)
        {
            $project: {
                _id: 0,
                date: { $dateToString: { format: "%d/%m/%Y", date: "$submit_at" } },
                total: "$score",
                listening: {
                    $round: [
                        {
                            $multiply: [
                                {
                                    $divide: [
                                        {
                                            $avg: {
                                                $map: {
                                                    input: {
                                                        $filter: {
                                                            input: "$parts",
                                                            as: "p",
                                                            cond: {
                                                                $regexMatch: {
                                                                    input: "$$p.part_name",
                                                                    regex: /^Part [1-4]/,
                                                                },
                                                            },
                                                        },
                                                    },
                                                    as: "l",
                                                    in: "$$l.accuracy",
                                                },
                                            },
                                        },
                                        1,
                                    ],
                                },
                                100,
                            ],
                        },
                        1,
                    ],
                },
                reading: {
                    $round: [
                        {
                            $multiply: [
                                {
                                    $divide: [
                                        {
                                            $avg: {
                                                $map: {
                                                    input: {
                                                        $filter: {
                                                            input: "$parts",
                                                            as: "p",
                                                            cond: {
                                                                $regexMatch: {
                                                                    input: "$$p.part_name",
                                                                    regex: /^Part [5-7]/,
                                                                },
                                                            },
                                                        },
                                                    },
                                                    as: "r",
                                                    in: "$$r.accuracy",
                                                },
                                            },
                                        },
                                        1,
                                    ],
                                },
                                100,
                            ],
                        },
                        1,
                    ],
                },
                submit_at: 1,
            },
        },

        // 📅 Sắp xếp theo ngày nộp bài
        { $sort: { submit_at: sort === "asc" ? 1 : -1 } },
    ];

    const data = await UserTest.aggregate(pipeline);

    return {
        year: year ?? null,
        month: month ?? "all",
        totalRecords: data.length,
        data,
    };
};

// 🎯 Lấy tổng quan progress của 4 kỹ năng (Listening, Reading, Vocabulary, Speaking)
export const getSkillsOverview = async (userId: string) => {
    const objectId = new mongoose.Types.ObjectId(userId);

    // 🎧 Listening: Trung bình accuracy từ dictation_attempt
    const listeningResult = await DictationAttempt.aggregate([
        {
            $match: {
                user_id: objectId,
                finished_at: { $exists: true }
            }
        },
        {
            $group: {
                _id: null,
                avgAccuracy: { $avg: "$accuracy" }
            }
        }
    ]);

    // 📖 Reading: Trung bình accuracy từ user_test (mini_test)
    const readingResult = await UserTest.aggregate([
        {
            $match: {
                user_id: objectId,
                completedPart: "mini_test",
                submit_at: { $exists: true }
            }
        },
        {
            $unwind: "$parts"
        },
        {
            $group: {
                _id: null,
                avgAccuracy: { $avg: "$parts.accuracy" }
            }
        }
    ]);

    // 📚 Vocabulary: Trung bình accuracy từ flashcard_attempt
    const vocabularyResult = await FlashCardAttempt.aggregate([
        {
            $match: {
                user_id: objectId,
                finished_at: { $exists: true }
            }
        },
        {
            $group: {
                _id: null,
                avgAccuracy: { $avg: "$accuracy" }
            }
        }
    ]);

    // 🗣️ Speaking: Trung bình accuracy_score từ shadowing_attempt
    const speakingResult = await ShadowingAttempt.aggregate([
        {
            $match: {
                user_id: objectId,
                finished_at: { $exists: true },
                accuracy_score: { $exists: true }
            }
        },
        {
            $group: {
                _id: null,
                avgAccuracy: { $avg: "$accuracy_score" }
            }
        }
    ]);

    return {
        listening: Math.round(listeningResult[0]?.avgAccuracy || 0),
        reading: Math.round(readingResult[0]?.avgAccuracy || 0),
        vocabulary: Math.round(vocabularyResult[0]?.avgAccuracy || 0),
        speaking: Math.round(speakingResult[0]?.avgAccuracy || 0)
    };
};

// 📊 Lấy độ chính xác từng Part (cho AccuracyComparisonChart)
export const getPartAccuracyStats = async (
    userId: string,
    year?: number,
    month?: number | "all"
) => {
    const objectId = new mongoose.Types.ObjectId(userId);

    // 🎯 Bộ lọc động theo năm / tháng
    const matchStage: any = {
        user_id: objectId,
        completedPart: "full_test",
        submit_at: { $exists: true },
    };

    if (year) {
        matchStage.$expr = { $eq: [{ $year: "$submit_at" }, year] };
    }

    if (month && month !== "all") {
        matchStage.$expr = matchStage.$expr
            ? {
                $and: [
                    matchStage.$expr,
                    { $eq: [{ $month: "$submit_at" }, Number(month)] },
                ],
            }
            : { $eq: [{ $month: "$submit_at" }, Number(month)] };
    }

    const result = await UserTest.aggregate([
        { $match: matchStage },
        { $unwind: "$parts" },
        {
            $group: {
                _id: "$parts.part_name",
                avgAccuracy: { $avg: "$parts.accuracy" }
            }
        },
        {
            $project: {
                _id: 0,
                part: "$_id",
                accuracy: { $divide: ["$avgAccuracy", 100] } // Convert % sang decimal (0-1)
            }
        },
        { $sort: { part: 1 } }
    ]);

    // Phân loại Listening (Part 1-4) và Reading (Part 5-7)
    const listeningData = result.filter(r => /^Part [1-4]/.test(r.part));
    const readingData = result.filter(r => /^Part [5-7]/.test(r.part));

    return {
        listeningData,
        readingData
    };
};

// 📋 Lấy chi tiết activities của 1 skill cụ thể
export const getSkillActivities = async (
    userId: string,
    skillType: "listening" | "reading" | "vocabulary" | "speaking"
) => {
    const objectId = new mongoose.Types.ObjectId(userId);

    switch (skillType) {
        case "listening": {
            // Lấy từ dictation_attempt + populate dictation
            const activities = await DictationAttempt.aggregate([
                {
                    $match: {
                        user_id: objectId,
                        finished_at: { $exists: true }
                    }
                },
                {
                    $lookup: {
                        from: "dictations",
                        localField: "dictation_id",
                        foreignField: "_id",
                        as: "dictation"
                    }
                },
                {
                    $unwind: "$dictation"
                },
                {
                    $sort: { finished_at: -1 }
                },
                {
                    $project: {
                        _id: 0,
                        title: "$dictation.title",
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$finished_at"
                            }
                        },
                        score: { $round: ["$accuracy", 0] },
                        finished_at: 1
                    }
                }
            ]);

            // Tính progress (so với lần trước)
            return activities.map((act, idx) => {
                const prevScore = activities[idx + 1]?.score || act.score;
                const diff = act.score - prevScore;
                return {
                    ...act,
                    progress: diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "0%"
                };
            });
        }

        case "reading": {
            // Lấy từ user_test (mini_test) + populate test
            const activities = await UserTest.aggregate([
                {
                    $match: {
                        user_id: objectId,
                        completedPart: "mini_test",
                        submit_at: { $exists: true }
                    }
                },
                {
                    $lookup: {
                        from: "tests",
                        localField: "test_id",
                        foreignField: "_id",
                        as: "test"
                    }
                },
                {
                    $unwind: "$test"
                },
                {
                    $sort: { submit_at: -1 }
                },
                {
                    $project: {
                        _id: 0,
                        title: "$test.title",
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$submit_at"
                            }
                        },
                        score: {
                            $round: [
                                {
                                    $avg: {
                                        $map: {
                                            input: "$parts",
                                            as: "p",
                                            in: "$$p.accuracy"
                                        }
                                    }
                                },
                                0
                            ]
                        },
                        submit_at: 1
                    }
                }
            ]);

            return activities.map((act, idx) => {
                const prevScore = activities[idx + 1]?.score || act.score;
                const diff = act.score - prevScore;
                return {
                    ...act,
                    progress: diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "0%"
                };
            });
        }

        case "vocabulary": {
            // Lấy từ flashcard_attempt + populate topic_vocabulary
            const activities = await FlashCardAttempt.aggregate([
                {
                    $match: {
                        user_id: objectId,
                        finished_at: { $exists: true }
                    }
                },
                {
                    $lookup: {
                        from: "topicvocabularies",
                        localField: "topic_vocabulary_id",
                        foreignField: "_id",
                        as: "topic"
                    }
                },
                {
                    $unwind: "$topic"
                },
                {
                    $sort: { finished_at: -1 }
                },
                {
                    $project: {
                        _id: 0,
                        title: "$topic.title",
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$finished_at"
                            }
                        },
                        score: { $round: ["$accuracy", 0] },
                        finished_at: 1
                    }
                }
            ]);

            return activities.map((act, idx) => {
                const prevScore = activities[idx + 1]?.score || act.score;
                const diff = act.score - prevScore;
                return {
                    ...act,
                    progress: diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "0%"
                };
            });
        }

        case "speaking": {
            // Lấy từ shadowing_attempt + populate shadowing
            const activities = await ShadowingAttempt.aggregate([
                {
                    $match: {
                        user_id: objectId,
                        finished_at: { $exists: true },
                        accuracy_score: { $exists: true }
                    }
                },
                {
                    $lookup: {
                        from: "shadowings",
                        localField: "shadowing_id",
                        foreignField: "_id",
                        as: "shadowing"
                    }
                },
                {
                    $unwind: "$shadowing"
                },
                {
                    $sort: { finished_at: -1 }
                },
                {
                    $project: {
                        _id: 0,
                        title: "$shadowing.title",
                        date: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$finished_at"
                            }
                        },
                        score: { $round: ["$accuracy_score", 0] },
                        finished_at: 1
                    }
                }
            ]);

            return activities.map((act, idx) => {
                const prevScore = activities[idx + 1]?.score || act.score;
                const diff = act.score - prevScore;
                return {
                    ...act,
                    progress: diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "0%"
                };
            });
        }

        default:
            return [];
    }
};
