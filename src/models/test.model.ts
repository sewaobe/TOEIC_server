import mongoose, { Schema, Document, Types } from "mongoose";
import { TestStatus } from "./enums/TestStatus";
import { TestType } from "./enums/TestType";
import { IGroup } from "./group.model";

export interface ITest extends Document {
  _id: Types.ObjectId;
  title: string;
  audioListen: Types.ObjectId[];    // ✅ camelCase
  groups: Types.ObjectId[] | IGroup[];
  type: TestType;
  status: TestStatus;
  topic: string;
  countComment: number;             // ✅ camelCase
  countSubmit: number;              // ✅ camelCase
  created_at: Date;                 // vẫn snake_case
  created_by: Types.ObjectId;       // vẫn snake_case
  updated_at: Date;                 // vẫn snake_case
}

const TestSchema = new Schema<ITest>({
  title: { type: String, required: true },
  audioListen: [{ type: Schema.Types.ObjectId, ref: "Media" }], // ✅
  groups: [{ type: Schema.Types.ObjectId, ref: "Group" }],
  type: {
    type: String,
    enum: Object.values(TestType),
    default: TestType.FULL_TEST,
  },
  status: {
    type: String,
    enum: Object.values(TestStatus),
    default: TestStatus.DRAFT,
  },
  topic: { type: String, default: "" },
  countComment: { type: Number, default: 0 }, // ✅
  countSubmit: { type: Number, default: 0 },  // ✅
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
  updated_at: Date,
});

export const Test = mongoose.model<ITest>("Test", TestSchema);
