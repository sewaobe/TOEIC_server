import { Schema, model, Document, Types } from "mongoose";

export interface ILessonPlan extends Document {
  user_id: Types.ObjectId;
  lesson_id: Types.ObjectId;
  latest_attempt?: Types.ObjectId;
  total_attempts: number;
  accuracy_overall: number;
  created_at: Date;
  updated_at?: Date;
}

const LessonPlanSchema = new Schema<ILessonPlan>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lesson_id: { type: Schema.Types.ObjectId, ref: "Lesson", required: true },
    latest_attempt: { type: Schema.Types.ObjectId, ref: "LessonAttempt" },
    total_attempts: { type: Number, default: 0 },
    accuracy_overall: { type: Number, default: 0 }, // % đúng tổng thể
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const LessonPlan = model<ILessonPlan>(
  "LessonPlan",
  LessonPlanSchema
);
