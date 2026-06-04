import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
import { SessionType } from "./enums/SessionType";
import { PartType } from "./enums/PartType";

export interface ISessionItem {
  kind: SessionType;
  activity_id?: Types.ObjectId;
  status: WeekStudyStatus;
  source_lesson_manager_id?: Types.ObjectId;
  estimated_minutes?: number;
  is_required?: boolean;
  order?: number;
}

export interface ISession {
  session_no: number;
  accuracy: number;
  status: WeekStudyStatus;
  part_type?: PartType | null;
  lesson_manager_id?: Types.ObjectId;
  lesson_manager_title?: string;
  planned_minutes?: number;
  actual_minutes?: number;
  scheduler_reason?: string;
  items: ISessionItem[];
}

export interface IDayStudy extends Document {
  week_id: Types.ObjectId;
  dayOfWeek: number;
  status: WeekStudyStatus;
  accuracy_overall: number;
  sessions: ISession[];
  created_at: Date;
  updated_at?: Date;
}

const SessionItemSchema = new Schema<ISessionItem>(
  {
    kind: { type: String, enum: Object.values(SessionType), required: true },
    activity_id: { type: Schema.Types.ObjectId, required: false },
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      default: WeekStudyStatus.LOCK,
    },
    source_lesson_manager_id: {
      type: Schema.Types.ObjectId,
      ref: "LessonManager",
      required: false,
    },
    estimated_minutes: { type: Number, default: 0 },
    is_required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const SessionSchema = new Schema<ISession>(
  {
    session_no: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      default: WeekStudyStatus.LOCK,
    },
    part_type: {
      type: Number,
      enum: Object.values(PartType).filter((v) => typeof v === "number"),
      required: false,
    },
    lesson_manager_id: {
      type: Schema.Types.ObjectId,
      ref: "LessonManager",
      required: false,
    },
    lesson_manager_title: { type: String, default: "" },
    planned_minutes: { type: Number, default: 0 },
    actual_minutes: { type: Number, default: 0 },
    scheduler_reason: { type: String, default: "" },
    items: { type: [SessionItemSchema], default: [] },
  },
  { _id: false }
);

const DayStudySchema = new Schema<IDayStudy>(
  {
    week_id: { type: Schema.Types.ObjectId, ref: "WeekStudy", required: true },
    dayOfWeek: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(WeekStudyStatus),
      default: WeekStudyStatus.LOCK,
    },
    accuracy_overall: { type: Number, default: 0 },
    sessions: { type: [SessionSchema], default: [] },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export const DayStudy = model<IDayStudy>("DayStudy", DayStudySchema);
