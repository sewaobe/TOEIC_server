import mongoose, { Schema, Document, Types } from "mongoose";

export type GroupType = "TEST" | "QUIZ";

export interface IGroup extends Document {
  _id: Types.ObjectId;
  test_id?: Types.ObjectId | null;
  part?: number | null;
  type: GroupType;
  audioUrl?: Types.ObjectId;                 // ✅ camelCase
  imagesUrl?: Types.ObjectId[];              // ✅ camelCase
  transcriptEnglish?: string;                // ✅ camelCase
  transcriptTranslation?: string;            // ✅ camelCase
  questions: Types.ObjectId[];
  created_at: Date;                          // vẫn snake_case
  updated_at: Date;                          // vẫn snake_case
}

const GroupSchema = new Schema<IGroup>({
  test_id: { type: Schema.Types.ObjectId, ref: "Test", default: null },
  part: { type: Number, default: null },
  type: { type: String, enum: ["TEST", "QUIZ"], required: true },
  audioUrl: { type: Schema.Types.ObjectId, ref: "Media" },             // ✅
  imagesUrl: [{ type: Schema.Types.ObjectId, ref: "Media" }],          // ✅
  transcriptEnglish: { type: String, default: "" },                    // ✅
  transcriptTranslation: { type: String, default: "" },                // ✅
  questions: [{ type: Schema.Types.ObjectId, ref: "Question" }],
  created_at: { type: Date, default: Date.now },
  updated_at: Date,
});

export const Group = mongoose.model<IGroup>("Group", GroupSchema);
