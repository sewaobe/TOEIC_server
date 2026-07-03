import { Schema, model, Document, Types } from "mongoose";
import { PartType } from "./enums/PartType";
import { TestStatus } from "./enums/TestStatus";

export type LessonManagerUnitType =
    | "foundation"
    | "skill_drill"
    | "mixed_practice"
    | "exam_practice"
    | "remedial";

export type LessonManagerNodeRole =
    | "normal"
    | "support";

export type ActivityType =
    | "lesson"
    | "vocabulary"
    | "dictation"
    | "shadowing"
    | "quiz";

export interface RecommendedActivity {
    activity_type: ActivityType;
    activity_id: Types.ObjectId;
    estimated_minutes: number;
    is_required?: boolean;
    order?: number;
}

export interface ILessonManager extends Document {
    title: string;
    description?: string;
    thumbnail?: string;

    /**
     * 1..7 tương ứng TOEIC Part.
     * Không nên dùng part_type = 0 cho graph chính.
     */
    part_type: PartType;

    /**
     * Vùng năng lực phù hợp của unit.
     * Đây là vùng bài học phù hợp, không phải cam kết học xong sẽ đạt điểm đó.
     */
    score_band: {
        from: number;
        to: number;
    };

    /**
     * Bản chất sư phạm của node.
     */
    unit_type: LessonManagerUnitType;

    /**
     * node_role không còn dùng để đánh dấu entry/target cố định.
     * Start/target node được scheduler tính runtime theo ability, target_score, score_band, progress và graph edges.
     * support được giữ lại vì vẫn biểu diễn các unit remedial/auxiliary.
     */
    node_role: LessonManagerNodeRole;

    /**
     * Các tag/skill mà unit này nhắm tới.
     */
    target_tags: string[];

    /**
     * Độ khó tương đối 0..1.
     * Được tính từ score_band + unit_type, không lấy random cũ.
     */
    weight: number;

    /**
     * Tổng thời gian dự kiến của một lượt học LessonManager, đơn vị phút.
     * Bằng tổng recommended_activity_order.estimated_minutes.
     */
    planned_completion_time: number;

    /**
     * Main graph edges.
     */
    next_unit_ids: Types.ObjectId[];

    /**
     * Các unit bắt buộc đã hoàn thành trước.
     * MVP: phải hoàn thành tất cả prerequisite_unit_ids.
     */
    prerequisite_unit_ids: Types.ObjectId[];

    /**
     * Unit bổ trợ/recovery liên quan.
     * Có thể trỏ tới foundation / skill_drill / remedial / mixed_practice.
     */
    auxiliary_unit_ids: Types.ObjectId[];

    /**
     * Thứ tự học activity cụ thể trong unit.
     */
    recommended_activity_order: RecommendedActivity[];

    /**
     * Các activity được gom vào unit.
     */
    topic_vocabulary_ids?: Types.ObjectId[];
    lesson_ids?: Types.ObjectId[];
    dictation_ids?: Types.ObjectId[];
    shadowing_ids?: Types.ObjectId[];
    quiz_ids?: Types.ObjectId[];

    status: TestStatus;
    rating?: number;
    student_count?: number;

    created_by: Types.ObjectId;
    created_at: Date;
    updated_at?: Date;
}

const RecommendedActivitySchema = new Schema<RecommendedActivity>(
    {
        activity_type: {
            type: String,
            enum: ["lesson", "vocabulary", "dictation", "shadowing", "quiz"],
            required: true,
        },
        activity_id: {
            type: Schema.Types.ObjectId,
            required: true,
        },
        estimated_minutes: {
            type: Number,
            required: true,
            min: 1,
        },
        is_required: {
            type: Boolean,
            default: true,
        },
        order: {
            type: Number,
            default: 0,
        },
    },
    { _id: false }
);

const LessonManagerSchema = new Schema<ILessonManager>(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        description: {
            type: String,
            default: "",
        },

        thumbnail: {
            type: String,
            default: "",
        },

        part_type: {
            type: Number,
            enum: Object.values(PartType).filter((v) => typeof v === "number"),
            required: true,
            index: true,
        },

        score_band: {
            from: {
                type: Number,
                required: true,
                min: 200,
                max: 990,
            },
            to: {
                type: Number,
                required: true,
                min: 200,
                max: 990,
            },
        },

        unit_type: {
            type: String,
            enum: [
                "foundation",
                "skill_drill",
                "mixed_practice",
                "exam_practice",
                "remedial",
            ],
            required: true,
            index: true,
        },

        node_role: {
            type: String,
            enum: ["normal", "support"],
            required: true,
            default: "normal",
            index: true,
        },

        target_tags: {
            type: [String],
            default: [],
            index: true,
        },

        weight: {
            type: Number,
            required: true,
            min: 0,
            max: 1,
            default: 0.1,
        },

        planned_completion_time: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },

        next_unit_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "LessonManager",
            },
        ],

        prerequisite_unit_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "LessonManager",
            },
        ],

        auxiliary_unit_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "LessonManager",
            },
        ],

        recommended_activity_order: {
            type: [RecommendedActivitySchema],
            default: [],
        },

        topic_vocabulary_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "TopicVocabulary",
            },
        ],

        lesson_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "Lesson",
            },
        ],

        dictation_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "Dictation",
            },
        ],

        shadowing_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "Shadowing",
            },
        ],

        quiz_ids: [
            {
                type: Schema.Types.ObjectId,
                ref: "Quiz",
            },
        ],

        status: {
            type: String,
            enum: Object.values(TestStatus),
            default: TestStatus.DRAFT,
            index: true,
        },

        rating: {
            type: Number,
            default: 0,
        },

        student_count: {
            type: Number,
            default: 0,
        },

        created_by: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    }
);

LessonManagerSchema.index({ part_type: 1, "score_band.from": 1, "score_band.to": 1 });
LessonManagerSchema.index({ part_type: 1, unit_type: 1, node_role: 1 });
LessonManagerSchema.index({ part_type: 1, target_tags: 1 });

export const LessonManager = model<ILessonManager>(
    "LessonManager",
    LessonManagerSchema
);
