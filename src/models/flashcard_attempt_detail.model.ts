import { Schema, model, Document, Types } from "mongoose";

// =============================
// Log chi tiết từng lần attempt
// =============================
export type EvalType = "easy" | "medium" | "hard" | "skip";

export interface IFlashCardAttemptDetail extends Document {
  attempt_id: Types.ObjectId; // tham chiếu đến session
  vocab_id: Types.ObjectId;
  eval_type: EvalType;
  response_time: number; // ms
  attempted_at: Date;
}

const FlashCardAttemptDetailSchema = new Schema<IFlashCardAttemptDetail>(
  {
    attempt_id: {
      type: Schema.Types.ObjectId,
      ref: "FlashCardAttempt",
      required: true,
    },
    vocab_id: { type: Schema.Types.ObjectId, ref: "Vocabulary", required: true },
    eval_type: {
      type: String,
      enum: ["easy", "medium", "hard", "skip"],
      required: true,
    },
    response_time: { type: Number, required: true },
    attempted_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const FlashCardAttemptDetail = model<IFlashCardAttemptDetail>(
  "FlashCardAttemptDetail",
  FlashCardAttemptDetailSchema
);