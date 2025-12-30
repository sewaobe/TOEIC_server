import { connectDB } from "../configs/db";
import { Lesson, Quiz, TopicVocabulary, Test } from "../models";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { Test as TestModel } from "../models/test.model";
import { ingestLearning } from "../ingest/ingest_learning";
import { ingestTests } from "../ingest/ingest_test";
import { initChroma } from "../core/initChroma";
import { resetLearningItemCollection } from "../core/collections/learning";
import { resetTestItemCollection } from "../core/collections/test";
import path from "path";
import dotenv from "dotenv";

// Load .env from project root if present (helps when running scripts via ts-node)
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });
if (process.env.MONGO_URI) {
  // eslint-disable-next-line no-console
  console.log(`Loaded MONGO_URI from ${envPath}`);
}

// Allow passing MONGO_URI as first CLI arg when running the script (overrides .env)
if (!process.env.MONGO_URI && process.argv[2]) {
  process.env.MONGO_URI = process.argv[2];
  console.log("Using MONGO_URI from CLI argument");
}

async function runIngestAllLessons() {
  await connectDB();

  console.log("🔍 Fetching all activities from MongoDB...");

  const [lessons, quizzes, topicVocs, dictations, shadowings, tests] =
    await Promise.all([
      Lesson.find({}).lean(),
      Quiz.find({}).populate("question_ids").lean(),
      TopicVocabulary.find({}).populate("vocabularies_id").lean(),
      Dictation.find({}).lean(),
      Shadowing.find({}).lean(),
      TestModel.find({}).populate("groups").lean(),
    ]);

  console.log(
    `Found ${lessons.length} lessons, ${quizzes.length} quizzes, ${topicVocs.length} vocab topics, ${dictations.length} dictations, ${shadowings.length} shadowings, ${tests.length} tests`
  );

  // Prepare structure expected by ingestLearning: grouped by part 1..7
  const grouped: Record<number, any> = {};
  for (let p = 1; p <= 7; p++) {
    grouped[p] = {
      lessons: [],
      dictations: [],
      shadowings: [],
      quizzes: [],
      vocab: [],
    };
  }

  // Helper to normalize part and push
  const pushToGroup = (partRaw: any, key: string, item: any) => {
    const part = Number(partRaw) || 5;
    if (!grouped[part])
      grouped[part] = {
        lessons: [],
        dictations: [],
        shadowings: [],
        quizzes: [],
        vocab: [],
      };
    grouped[part][key].push(item);
  };

  // Enrich and push lessons
  for (const l of lessons as any[]) {
    const li: any = l;
    // ensure defaults
    if (li.weight === undefined) li.weight = 0.5;
    if (!li.summary) li.summary = li.description || li.summary || "";
    pushToGroup(li.part_type, "lessons", li);
  }

  // Enrich and push quizzes (include first few question texts into summary)
  for (const q of quizzes as any[]) {
    const qi: any = q;
    if (qi.weight === undefined) qi.weight = 0.5;
    const questionTexts = (qi.question_ids || [])
      .slice(0, 5)
      .map((qq: any) => qq.textQuestion || qq.name || "")
      .filter(Boolean);
    qi.summary = `${qi.summary || qi.description || ""}\nQuestions(${
      (qi.question_ids || []).length
    }): ${questionTexts.join(" | ")}`;
    pushToGroup(qi.part_type || qi.part || 5, "quizzes", qi);
  }

  // Topic vocabularies: include first words into summary
  for (const tv of topicVocs as any[]) {
    const tvi: any = tv;
    if (tvi.weight === undefined) tvi.weight = 0.5;
    const words = (tvi.vocabularies_id || [])
      .slice(0, 20)
      .map((v: any) => v.word || v.term || "")
      .filter(Boolean);
    tvi.summary = `${tvi.summary || tvi.description || ""}\nWords(${
      (tvi.vocabularies_id || []).length
    }): ${words.join(", ")}`;
    pushToGroup(tvi.part_type || tvi.part || 5, "vocab", tvi);
  }

  // Dictations
  for (const d of dictations as any[]) {
    const di: any = d;
    if (di.weight === undefined) di.weight = 0.5;
    if (!di.summary && di.transcript)
      di.summary = di.transcript.substring(0, 1000);
    pushToGroup(di.part_type || di.part || 5, "dictations", di);
  }

  // Shadowings
  for (const s of shadowings as any[]) {
    const si: any = s;
    if (si.weight === undefined) si.weight = 0.5;
    if (!si.summary && si.transcript)
      si.summary = si.transcript.substring(0, 1000);
    pushToGroup(si.part_type || si.part || 5, "shadowings", si);
  }

  // Tests: include groups summary
  for (const t of tests as any[]) {
    const ti: any = t;
    if (ti.weight === undefined) ti.weight = 0.5;
    const groupsSummary = (ti.groups || [])
      .slice(0, 10)
      .map((g: any) => g.title || g.name || JSON.stringify(g))
      .join(" | ");
    ti.summary = `${ti.summary || ti.description || ""}\nGroups(${
      (ti.groups || []).length
    }): ${groupsSummary}`;
  }

  console.log("📥 Starting ingest to ChromaDB (batches)...");

  // Ingest learning items (lessons, quizzes, vocab, dictations, shadowings)
  try {
    await ingestLearning(grouped);
    console.log("✅ Learning items ingest complete");
  } catch (err) {
    console.error("❌ Learning items ingest failed:", err);
  }

  // Ingest tests separately to test_items collection
  try {
    await ingestTests(tests);
    console.log("✅ Tests ingest complete");
  } catch (err) {
    console.error("❌ Tests ingest failed:", err);
  }

  process.exit(0);
}

if (require.main === module) {
  runIngestAllLessons();
}

export default runIngestAllLessons;

export async function clearLearningCollection() {
  try {
    const { chromaClient } = await initChroma();

    // Clear learning_items collection
    const learningCollectionName = "learning_items";
    console.log(
      `🗑️ Attempting to delete Chroma collection: ${learningCollectionName}`
    );
    try {
      await chromaClient.deleteCollection({ name: learningCollectionName });
      console.log(`✔ Deleted Chroma collection: ${learningCollectionName}`);
    } catch (err: any) {
      console.warn(
        `⚠️ Could not delete collection ${learningCollectionName}:`,
        err?.message || err
      );
    }

    // Clear test_items collection
    const testCollectionName = "test_items";
    console.log(
      `🗑️ Attempting to delete Chroma collection: ${testCollectionName}`
    );
    try {
      await chromaClient.deleteCollection({ name: testCollectionName });
      console.log(`✔ Deleted Chroma collection: ${testCollectionName}`);
    } catch (err: any) {
      console.warn(
        `⚠️ Could not delete collection ${testCollectionName}:`,
        err?.message || err
      );
    }

    // Clear cached references
    await resetLearningItemCollection();
    await resetTestItemCollection();
    console.log("✅ All collections cleared (cache reset)");
  } catch (err) {
    console.error("❌ Failed to clear collections:", err);
    throw err;
  }
}

// clearLearningCollection();
