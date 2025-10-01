import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";
import { SessionType } from "./enums/SessionType";
import { PartType } from "./enums/PartType";

export interface ISessionItem {
  kind: SessionType; // flashcard | dictation | quiz | shadowing | lesson
  activity_id?: Types.ObjectId; // reference tới Lesson | QuizPlan | ShadowingPlan | DictationPlan | FlashCardPlan (tùy theo kind)
  status: WeekStudyStatus; // lock | in_progress | completed | deleted
}

export interface ISession {
  session_no: number; // số thứ tự trong ngày
  accuracy: number; // % đúng trong buổi học
  status: WeekStudyStatus; // lock | in_progress | completed | deleted
  part_type?: PartType | null; // part của TOEIC (có thể null nếu là review/mini-test)
  items: ISessionItem[];
}

export interface IDayStudy extends Document {
  week_id: Types.ObjectId; // reference tới WeekStudy
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  status: WeekStudyStatus;
  accuracy_overall: number; // % đúng trong ngày
  sessions: ISession[];
  created_at: Date;
  updated_at?: Date;
}

// ---- Sub-schemas ----
const SessionItemSchema = new Schema<ISessionItem>(
  {
    kind: { type: String, enum: Object.values(SessionType), required: true },
    activity_id: { type: Schema.Types.ObjectId, required: false },
    status: {type: String, enum: Object.values(WeekStudyStatus), default: WeekStudyStatus.LOCK}
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
