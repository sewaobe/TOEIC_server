import mongoose, { Date, Document, Schema, Types } from "mongoose";

export interface IUserLearningPath extends Document {
    _id: Types.ObjectId;
    user_id: Types.ObjectId;
    learningPath_id: Types.ObjectId;
    target_score: number;
    time_per_day: number;
    days_per_week: number;
    target_completion_date: Date;
    week_study_ids: Types.ObjectId[];
    additional_week_studies?: Types.ObjectId[];
    current_week: number;
}

const UserLearningPathSchema = new Schema<IUserLearningPath>({
    user_id: { type: Schema.Types.ObjectId, ref: "User" },
    learningPath_id: { type: Schema.Types.ObjectId, ref: "LearningPath" },
    target_score: { type: Number, default: 0 },
    time_per_day: { type: Number, default: 0 },
    days_per_week: { type: Number, default: 0 },
    target_completion_date: { type: Date },
    week_study_ids: [{ type: Schema.Types.ObjectId, ref: "WeekStudy", required: true }],
    additional_week_studies: [{ type: Schema.Types.ObjectId, ref: "WeekStudy" }],
    current_week: { type: Number, default: 1 }
})

export const UserLearningPath = mongoose.model<IUserLearningPath>(
    'UserLearningPath',
    UserLearningPathSchema
)