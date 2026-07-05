import { Document, model, Schema, Types } from "mongoose";

export type DictationProgressStatus = "in_progress" | "completed" | "cancelled";
export type DictationProgressDifficulty = "easy" | "medium" | "hard";

export interface IDictationProgress extends Document {
  user_id: Types.ObjectId;
  dictation_id: Types.ObjectId;
  status: DictationProgressStatus;
  difficulty: DictationProgressDifficulty;
  current_index: number;
  completed_indices: number[];
  sentence_records: Record<string, unknown>;
  attempt_logs: unknown[];
  summary?: Record<string, unknown>;
  started_at: Date;
  last_activity_at: Date;
  completed_at?: Date;
}

const DictationProgressSchema = new Schema<IDictationProgress>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dictation_id: {
      type: Schema.Types.ObjectId,
      ref: "Dictation",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "cancelled"],
      default: "in_progress",
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "hard",
    },
    current_index: { type: Number, default: 0 },
    completed_indices: { type: [Number], default: [] },
    sentence_records: { type: Schema.Types.Mixed, default: {} },
    attempt_logs: { type: [Schema.Types.Mixed], default: [] },
    summary: { type: Schema.Types.Mixed, default: {} },
    started_at: { type: Date, default: Date.now },
    last_activity_at: { type: Date, default: Date.now },
    completed_at: { type: Date },
  },
  { timestamps: true },
);

DictationProgressSchema.index({
  user_id: 1,
  dictation_id: 1,
  status: 1,
});

export const DictationProgress = model<IDictationProgress>(
  "DictationProgress",
  DictationProgressSchema,
);
