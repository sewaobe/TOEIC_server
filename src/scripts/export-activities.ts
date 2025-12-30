import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import path from "path";
import fs from "fs/promises";

// Import models to register them with mongoose
import "../models";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB || "mongodb://localhost:27017/toeic-db";

function isObjectId(v: any) {
  return (
    v && typeof v === "object" && (v._bsontype === "ObjectID" || (typeof v.toHexString === "function"))
  );
}

function convertObjectIds(obj: any): any {
  if (Array.isArray(obj)) return obj.map(convertObjectIds);
  if (!obj || typeof obj !== "object") return obj;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (isObjectId(v)) {
      out[k] = v.toString();
    } else if (Array.isArray(v)) {
      out[k] = v.map(convertObjectIds);
    } else if (v && typeof v === "object") {
      out[k] = convertObjectIds(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function exportCollections() {
  console.log("Connecting to:", MONGO_URI);
  await mongoose.connect(MONGO_URI, { dbName: undefined });

  const collectionsToExport = [
    "LessonManager",
    "Lesson",
    "LessonSection",
    "LessonPlan",
    "UserActivity",
    "UserProgress",

    // Dictation
    "Dictation",
    "DictationAttempt",
    "DictationPlan",

    // Flashcard (model names use capital C)
    "FlashCardPlan",
    "FlashCardAttempt",
    "FlashCardProgress",

    // Shadowing
    "Shadowing",
    "ShadowingAttempt",
    "ShadowingPlan",

    // Quiz
    "Quiz",
    "QuizAttempt",
    "QuizPlan",

    // Questions, media and vocabularies
    "Question",
    "Media",
    "MediaFolder",
    "PracticeTopicVocabulary",
    "TopicVocabulary",
    "Vocabulary",
    "VocabularyWord",
  ];

  const output: Record<string, any[]> = {};

  for (const name of collectionsToExport) {
    try {
      const Model = mongoose.model(name);
      const docs = await Model.find().lean();
      output[name] = docs.map(convertObjectIds);
      console.log(`Exported ${output[name].length} docs from ${name}`);
    } catch (err) {
      console.warn(`Skipping ${name}:`, (err as Error).message);
      output[name] = [];
    }
  }

  // Write to sibling folder of TOEIC_server (../toeic_server_export)
  const outDir = path.resolve(process.cwd(), "..", "toeic_server_export");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "toeic_activities_export.json");
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log("Wrote", outPath);

  await mongoose.disconnect();
}

exportCollections()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
