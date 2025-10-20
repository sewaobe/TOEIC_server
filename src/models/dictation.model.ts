import { Schema, model, Document, Types } from "mongoose";
import { PartType } from "./enums/PartType";
import { CERFLevel } from "./topic_vocabulary.model";
import { TestStatus } from "./enums/TestStatus";

interface IWord {
  word: string;
  start: number;
  end: number;
}

interface ISegment {
  text: string;
  startTime: number;
  endTime: number;
  words?: IWord[];
}

export interface IDictation extends Document {
  _id: Types.ObjectId;
  topic: Types.ObjectId[];
  title: string;
  part_type?: PartType;
  level: CERFLevel;
  status: TestStatus;
  transcript: string;
  audio_url?: string;
  duration?: number;
  timings: ISegment[];
  display_mode: "sentence" | "word";
  weight: Number;
  created_at: Date;
  updated_at?: Date;
}

const WordSchema = new Schema<IWord>(
  {
    word: String,
    start: Number,
    end: Number,
  },
  { _id: false }
);

const SegmentSchema = new Schema<ISegment>(
  {
    text: String,
    startTime: Number,
    endTime: Number,
    words: [WordSchema],
  },
  { _id: false }
);

const DictationSchema = new Schema<IDictation>(
  {
    topic: [{ type: Schema.Types.ObjectId, ref: "LessonManager" }],
    title: { type: String, required: true },
    part_type: {
      type: Number,
      enum: Object.values(PartType).filter(v => typeof v === "number"),
    },
    level: { type: String, enum: Object.values(CERFLevel), required: true },
    status: { type: String, enum: Object.values(TestStatus), default: TestStatus.DRAFT },
    transcript: { type: String, required: true },
    audio_url: String,
    duration: Number,
    timings: [SegmentSchema],
    display_mode: {
      type: String,
      enum: ["sentence", "word"],
      default: "sentence",
    },
    weight: {
      type: Number,
      default: 0
    }
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const Dictation = model<IDictation>("Dictation", DictationSchema);
