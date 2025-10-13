import { Schema, model, Document } from "mongoose";
import { TopicLevel } from "./topic.model";
import { PartType } from "./enums/PartType";

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

export interface IShadowing extends Document {
  topic: string;
  part_type?: PartType;
  level: TopicLevel;
  transcript: string;
  audio_url?: string;
  duration?: number;
  timings: ISegment[];
  display_mode: "sentence" | "word";
  created_at: Date;
  updated_at?: Date;
}

const ShadowingSchema = new Schema<IShadowing>(
  {
    topic: { type: String, required: true },
    part_type: { type: Number, enum: Object.values(PartType) },
    level: { type: String, enum: Object.values(TopicLevel), required: true },
    transcript: { type: String, required: true },
    audio_url: String,
    duration: Number,
    timings: [
      {
        text: String,
        startTime: Number,
        endTime: Number,
        words: [{ word: String, start: Number, end: Number }],
      },
    ],
    display_mode: {
      type: String,
      enum: ["sentence", "word"],
      default: "sentence",
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

export const Shadowing = model<IShadowing>("Shadowing", ShadowingSchema);
