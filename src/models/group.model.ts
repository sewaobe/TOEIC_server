import mongoose, { Schema, Document, Types } from "mongoose";

export interface IGroup extends Document {
  _id: Types.ObjectId;
  test_id?: Types.ObjectId | null;
  quiz_id?: Types.ObjectId | null;
  minitest_id?: Types.ObjectId | null;
  practice_id?: Types.ObjectId | null;
  part?: number | null;
  audioUrl?: Types.ObjectId;
  imagesUrl?: Types.ObjectId[];
  transcriptEnglish?: string;
  transcriptTranslation?: string;
  questions: Types.ObjectId[];
  created_at: Date;
  updated_at: Date;
}

const GroupSchema = new Schema<IGroup>({
  test_id: { type: Schema.Types.ObjectId, ref: "Test", default: null },
  quiz_id: { type: Schema.Types.ObjectId, ref: "Quiz", default: null },
  minitest_id: { type: Schema.Types.ObjectId, ref: "MiniTest", default: null },
  practice_id: { type: Schema.Types.ObjectId, ref: "Practice", default: null },
  part: { type: Number, default: null },
  audioUrl: { type: Schema.Types.ObjectId, ref: "Media" },
  imagesUrl: [{ type: Schema.Types.ObjectId, ref: "Media" }],
  transcriptEnglish: { type: String, default: "" },
  transcriptTranslation: { type: String, default: "" },
  questions: [{ type: Schema.Types.ObjectId, ref: "Question" }],
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
});

// ✅ Indexes để tăng tốc query
GroupSchema.index({ part: 1 }); // cho filter by part
GroupSchema.index({ questions: 1 }); // cho lookup questions
GroupSchema.index({ created_at: -1 }); // cho sort
GroupSchema.index({ part: 1, created_at: -1 }); // compound index cho filter + sort

export const Group = mongoose.model<IGroup>("Group", GroupSchema);
