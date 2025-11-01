import mongoose, { Schema, Document, Types } from "mongoose";
import { ReportType } from "./enums/ReportType";
import { ReportStatus } from "./enums/ReportStatus";

export interface IReport extends Document {
  user_id: Types.ObjectId;
  type: ReportType;
  title: string;
  description: string;
  image_url?: string;
  status: ReportStatus;
  admin_note?: string;
  handled_by?: Types.ObjectId | null;
  handled_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: Object.values(ReportType),
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    image_url: { type: String },
    status: {
      type: String,
      enum: Object.values(ReportStatus),
      default: ReportStatus.PENDING,
    },
    admin_note: { type: String, default: "" },
    handled_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    handled_at: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

ReportSchema.index({ user_id: 1, created_at: -1 });
ReportSchema.index({ status: 1, type: 1, created_at: -1 });

export const Report = mongoose.model<IReport>("Report", ReportSchema);
