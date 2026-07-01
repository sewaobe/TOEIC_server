import mongoose, { Schema, Document, Types } from "mongoose";

export enum CERFLevel {
  A1 = "A1",
  A2 = "A2",
  B1 = "B1",
  B2 = "B2",
  C1 = "C1",
  C2 = "C2",
}

import { PartType } from "./enums/PartType";

export type TOEICPart = PartType; // alias for clarity in this file

export interface ITopicVocabulary extends Document {
  topic: Types.ObjectId[];
  title: string;
  description: string;
  tags: string[];
  level: CERFLevel;
  part_type?: TOEICPart; // TOEIC Part: Part 1..7 (numeric enum)
  iconName: string;
  bgColor: string;
  gradient: string;
  vocabularies_id: Types.ObjectId[];
  isCollaborator: boolean;
  isPublic: boolean;
  generation_request_id?: string;
  created_at: Date;
  created_by: Types.ObjectId;
  updated_at: Date;
}

const TopicVocabularySchema = new Schema<ITopicVocabulary>({
  topic: [{ type: Schema.Types.ObjectId, ref: "LessonManager" }],
  title: String,
  description: String,
  tags: [{ type: String }],
  iconName: { type: String },
  bgColor: { type: String, default: "ffffff" },
  gradient: { type: String },
  level: {
    type: String,
    enum: Object.values(CERFLevel),
    default: CERFLevel.A1,
  },
  part_type: {
    type: Number,
    enum: Object.values(PartType).filter((v) => typeof v === "number"),
  }, // TOEIC Part numeric enum (1..7)
  vocabularies_id: [{ type: Schema.Types.ObjectId, ref: "Vocabulary" }],
  isCollaborator: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false },
  generation_request_id: { type: String, trim: true },
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User" },
  updated_at: Date,
});

TopicVocabularySchema.index(
  { created_by: 1, generation_request_id: 1 },
  { unique: true, sparse: true }
);

export const TopicVocabulary = mongoose.model<ITopicVocabulary>(
  "TopicVocabulary",
  TopicVocabularySchema
);
