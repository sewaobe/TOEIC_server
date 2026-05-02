import mongoose, { Schema, Document, Types } from "mongoose";

export type VocabularyMemoryStatus =
    | "learning"
    | "reviewing"
    | "mastered";

export interface IUserVocabularyMemoryV2 extends Document {
    user_id: Types.ObjectId;
    vocabulary_id: Types.ObjectId;

    // DHP state
    difficulty: number; // 1..18
    half_life_days: number;

    // Scheduling
    last_reviewed_at: Date | null;
    due_at: Date | null;
    status: VocabularyMemoryStatus;

    // Session/review stats
    review_count: number;
    session_count: number;

    // Last review diagnostics
    last_p_recall?: number;
    last_interval_days?: number;
    last_seen_count?: number;
    last_hard_count?: number;
    last_medium_count?: number;
    last_easy_count?: number;
    last_skip_count?: number;
    last_learning_effort?: number;
    last_response_time_avg?: number;
    last_recall_failure_score?: number;
    last_dhp_recall_result?: "remembered" | "forgot";

    created_at: Date;
    updated_at: Date;
}

const UserVocabularyMemoryV2Schema =
    new Schema<IUserVocabularyMemoryV2>(
        {
            user_id: {
                type: Schema.Types.ObjectId,
                ref: "User",
                required: true,
                index: true,
            },
            vocabulary_id: {
                type: Schema.Types.ObjectId,
                ref: "Vocabulary",
                required: true,
                index: true,
            },
            difficulty: {
                type: Number,
                required: true,
                min: 1,
                max: 18,
            },
            half_life_days: {
                type: Number,
                required: true,
                min: 0,
            },

            last_reviewed_at: {
                type: Date,
                default: null,
            },
            due_at: {
                type: Date,
                default: null,
                index: true,
            },
            status: {
                type: String,
                enum: ["learning", "reviewing", "mastered"],
                default: "reviewing",
                index: true,
            },

            review_count: {
                type: Number,
                default: 0,
                min: 0,
            },
            session_count: {
                type: Number,
                default: 0,
                min: 0,
            },

            last_p_recall: {
                type: Number,
                min: 0,
                max: 1,
            },
            last_interval_days: {
                type: Number,
                min: 0,
            },
            last_seen_count: {
                type: Number,
                min: 0,
            },
            last_hard_count: {
                type: Number,
                min: 0,
            },
            last_medium_count: {
                type: Number,
                min: 0,
            },
            last_easy_count: {
                type: Number,
                min: 0,
            },
            last_skip_count: {
                type: Number,
                min: 0,
            },
            last_response_time_avg: {
                type: Number,
                min: 0,
            },
            last_learning_effort: {
                type: Number,
                min: 0,
            },
            last_recall_failure_score: {
                type: Number,
                min: 0,
            },

            last_dhp_recall_result: {
                type: String,
                enum: ["remembered", "forgot"],
            },
        },
        {
            timestamps: {
                createdAt: "created_at",
                updatedAt: "updated_at",
            },
        }
    );

UserVocabularyMemoryV2Schema.index(
    { user_id: 1, vocabulary_id: 1 },
    { unique: true }
);

UserVocabularyMemoryV2Schema.index({
    user_id: 1,
    status: 1,
    due_at: 1,
});

export const UserVocabularyMemoryV2 =
    mongoose.model<IUserVocabularyMemoryV2>(
        "UserVocabularyMemoryV2",
        UserVocabularyMemoryV2Schema
    );