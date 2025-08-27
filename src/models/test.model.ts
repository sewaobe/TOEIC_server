import mongoose, { Schema, Document, Types } from 'mongoose';
import { TestStatus } from './enums/TestStatus';
import { TestType } from './enums/TestType';

export interface IPart extends Document {
  groups: {
    audioUrl?: Types.ObjectId;
    imagesUrl?: Types.ObjectId;
    transcriptEnglish: string;
    transcriptTranslation: string;
    question: Types.ObjectId[];
  };
}
const PartSchema = new Schema<IPart>(
  {
    groups: {
      audioUrl: { type: Schema.Types.ObjectId, ref: 'Media' },
      imagesUrl: { type: Schema.Types.ObjectId, ref: 'Media' },
      transcriptEnglish: { type: String, required: true },
      transcriptTranslation: { type: String, required: true },
      question: [{ type: Schema.Types.ObjectId, ref: 'Question' }],
    },
  },
  { _id: false },
);

export interface ITest extends Document {
  title: string;
  audioListen: Types.ObjectId;
  questions: IPart[];
  type: TestType;
  status: TestStatus;
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const TestSchema = new Schema<ITest>({
  title: String,
  audioListen: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  questions: [PartSchema],
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
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
});

export const Test = mongoose.model<ITest>('Test', TestSchema);
