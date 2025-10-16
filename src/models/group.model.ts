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

export const Group = mongoose.model<IGroup>("Group", GroupSchema);
