import { Schema, model, Document, Types } from "mongoose";
import { WeekStudyStatus } from "./enums/WeekStudyStatus";

export interface IWeekStudy extends Document {
  _id: Types.ObjectId;
  name: number; // tuần thứ mấy
  description: string;
  status: WeekStudyStatus;
  started_at?: Date;
  ended_at?: Date;
  accuracy_overall: number;

  additional_lessons: {
    lesson_id: Types.ObjectId;   // bài học bổ sung
    completed: boolean;          // đã học xong hay chưa
  }[];

  additional_tests: {
    test_id: Types.ObjectId;     // mini-test hoặc full-test
    accuracy: number;            // % đúng
    completed_at?: Date;         // ngày hoàn thành test
  }[];

  days: Types.ObjectId[];        // liên kết tới DayStudy
  created_at: Date;
  updated_at?: Date;
}

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

    additional_lessons: [
      {
        lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
        completed: { type: Boolean, default: false },
      },
    ],

    additional_tests: [
      {
        test_id: { type: Schema.Types.ObjectId, ref: "Test", required: true },
        accuracy: { type: Number, default: 0 },
        completed_at: { type: Date },
      },
    ],

    days: [{ type: Schema.Types.ObjectId, ref: "DayStudy" }],
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export const WeekStudy = model<IWeekStudy>("WeekStudy", WeekStudySchema);
