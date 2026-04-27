import { Schema, model, Document, Types } from "mongoose";
import { PartType } from "./enums/PartType";
import { CERFLevel } from "./topic_vocabulary.model";
import { TestStatus } from "./enums/TestStatus";

interface ISegment {
  text: string;
  ipa: string;
  startTime: number;
  endTime: number;
  translationVi: string;
}

export interface IShadowing extends Document {
  topic: Types.ObjectId[];
  title: string;
  thumbnailUrl: string;
  tags: string[];
  part_type: PartType;
  media_type: string;
  level: CERFLevel;
  status: TestStatus;
  transcript: string;
  audio_url?: string;
  duration?: number; // Vừa là thời gian của video, vừa là thời gian dự kiến hoành thành.
  timings: ISegment[];
  display_mode: "sentence" | "word";
  weight: Number;
  created_at: Date;
  updated_at?: Date;
}

const ShadowingSchema = new Schema<IShadowing>(
  {
    topic: [{ type: Schema.Types.ObjectId, ref: "LessonManager" }],
    title: { type: String, required: true },
    thumbnailUrl: String,
    media_type: String,
    tags: [{ type: String }],
    part_type: { type: Number, enum: Object.values(PartType).filter(v => typeof v === "number"), required: true },
    level: { type: String, enum: Object.values(CERFLevel), required: true },
    status: { type: String, enum: Object.values(TestStatus), default: TestStatus.DRAFT },
    transcript: { type: String, required: true },
    audio_url: String,
    duration: Number,
    timings: [
      {
        text: String,
        ipa: String,
        startTime: Number,
        endTime: Number,
        translationVi: String
      },
    ],
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
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export const Shadowing = model<IShadowing>("Shadowing", ShadowingSchema);
