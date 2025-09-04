import mongoose, { Schema, Document, Types } from 'mongoose';
import { TestStatus } from './enums/TestStatus';
import { TestType } from './enums/TestType';

export interface IGroup {
  audioUrl?: Types.ObjectId;
  imagesUrl?: Types.ObjectId[];
  transcriptEnglish: string;
  transcriptTranslation: string;
  questions: Types.ObjectId[];
}

export interface IPart {
  groups: IGroup[];
}

export interface ITest extends Document {
  title: string;
  audioListen: Types.ObjectId[];
  questions: Map<string, IPart>;  // key là tên part, ví dụ "Part 1"
  type: TestType;
  status: TestStatus;
  topic: string;
  countComment: number;  // 👈 thêm
  countSubmit: number;   // 👈 thêm
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    audioUrl: { type: Schema.Types.ObjectId, ref: 'Media' },
    imagesUrl: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    transcriptEnglish: { type: String, required: true },
    transcriptTranslation: { type: String, required: true },
    questions: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
  },
  { _id: false },
);

const PartSchema = new Schema<IPart>(
  {
    groups: [GroupSchema],
  },
  { _id: false },
);

// Sử dụng Map để key là tên part
const TestSchema = new Schema<ITest>(
  {
    title: { type: String, required: true },
    audioListen: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    questions: {
      type: Map,
      of: PartSchema,
      default: {},
    },
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
    topic: {
      type: String,
      default: ""
    },
    countComment: { type: Number, default: 0 }, // 👈 thêm
    countSubmit: { type: Number, default: 0 },  // 👈 thêm
    created_at: { type: Date, default: Date.now },
    created_by: { type: Schema.Types.ObjectId, ref: 'User' },
    updated_at: Date,
  },
  { strict: false } // Cho phép key dynamic
);

export const Test = mongoose.model<ITest>('Test', TestSchema);
