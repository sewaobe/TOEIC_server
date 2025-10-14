import { Schema, model, Document } from "mongoose";
import { PartType } from "./enums/PartType";
import { CERFLevel } from "./topic_vocabulary.model";

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
  topic: string;
  part_type?: PartType;
  level: CERFLevel;
  transcript: string;
  audio_url?: string;
  duration?: number;
  timings: ISegment[];
  display_mode: "sentence" | "word";
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
    topic: { type: String, required: true },
    part_type: {
      type: Number,
      enum: Object.values(PartType).filter(v => typeof v === "number"),
    },
    level: { type: String, enum: Object.values(CERFLevel), required: true },
    transcript: { type: String, required: true },
    audio_url: String,
    duration: Number,
    timings: [SegmentSchema],
    display_mode: {
      type: String,
      enum: ["sentence", "word"],
      default: "sentence",
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const Dictation = model<IDictation>("Dictation", DictationSchema);
