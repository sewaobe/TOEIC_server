import mongoose, { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
import { SessionType } from "./enums/SessionType";

export interface ISessionItem {
    kind: SessionType;
    lesson_id?: Types.ObjectId;
    question_id?: Types.ObjectId;
    planned_time: number; // phút
}

export interface ISession {
    session_no: number;
    status: WeekStudyStatus;
    items: ISessionItem[];
}

export interface IWeekStudy extends Document {
    _id: Types.ObjectId;
    name: number;                 // tuần thứ mấy: 1,2,3...
    description: string;
    status: WeekStudyStatus;      // lock | in_progress | completed
    started_at?: Date;
    ended_at?: Date;
    accuracy_overall: number;     // tuỳ bạn dùng 0..1 hay 0..100
    additional_lessons: {
        lesson_id: Types.ObjectId;  // lesson.type == 'micro'
        accuracy: number;
    }[];
    sessions: ISession[];
    created_at: Date;
}

// ---- Sub-schemas ----
const SessionItemSchema = new Schema<ISessionItem>(
    {
        kind: {
            type: String,
            enum: Object.values(SessionType),
            required: true,
        },
        lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson" },
        question_id: { type: Schema.Types.ObjectId, ref: "Question" },
        planned_time: { type: Number, required: true, min: 1, max: 180 },
    },
    { _id: false }
);

const SessionSchema = new Schema<ISession>(
    {
        session_no: { type: Number, required: true, min: 1 },
        status: {
            type: String,
            enum: Object.values(WeekStudyStatus),
            required: true,
        },
        items: { type: [SessionItemSchema], default: [] },
    },
    { _id: false }
);

// ---- WeekStudy schema ----
const WeekStudySchema = new Schema<IWeekStudy>(
    {
        name: { type: Number, required: true, index: true },
        description: { type: String, default: "" },
        status: {
            type: String,
            enum: Object.values(WeekStudyStatus),
            required: true,
            index: true,
        },
        started_at: { type: Date },
        ended_at: { type: Date },
        accuracy_overall: { type: Number, default: 0 },
        additional_lessons: {
            type: [
                new Schema(
                    {
                        lesson_id: {
                            type: Schema.Types.ObjectId,
                            ref: "Lesson",
                            required: true,
                        },
                        accuracy: { type: Number, default: 0 },
                    },
                    { _id: false }
                ),
            ],
            default: [],
        },
        sessions: { type: [SessionSchema], default: [] },
    },
    {
        // tạo created_at / updated_at
        timestamps: { createdAt: "created_at", },
    }
);

export const WeekStudy = mongoose.model<IWeekStudy>("WeekStudy", WeekStudySchema);
