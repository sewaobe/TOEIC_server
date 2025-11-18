import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUserActivity extends Document {
  user_id: Types.ObjectId;
  type:
    | "LOGIN"
    | "LESSON"
    | "TEST"
    | "COMMENT"
    | "OTHER"
    | "DAY_STUDY_COMPLETED"
    | "WEEK_STUDY_COMPLETED";
  title: string;
  description?: string;
  related_id?: Types.ObjectId;
  timestamp: Date;
  duration?: number;
  metadata?: Record<string, any>;
}

const UserActivitySchema = new Schema<IUserActivity>({
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: {
    type: String,
    enum: [
      "LOGIN",
      "LESSON",
      "TEST",
      "COMMENT",
      "OTHER",
      "DAY_STUDY_COMPLETED",
      "WEEK_STUDY_COMPLETED",
    ],
    required: true,
  },
  title: String,
  description: String,
  related_id: Schema.Types.ObjectId,
  timestamp: { type: Date, default: Date.now },
  duration: Number,
  metadata: Object,
});

export const UserActivity = mongoose.model<IUserActivity>(
  "UserActivity",
  UserActivitySchema
);
