import path from "path";
import dotenv from "dotenv";
import { connectDB } from "../configs/db";
import { Lesson, Quiz, TopicVocabulary, Test as TestModel } from "../models";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { ingestLearning } from "../ingest/ingest_learning";
import { initChroma } from "../core/initChroma";
import { resetLearningItemCollection } from "../core/collections/learning";

// load .env
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

function chunkArray<T>(arr: T[], size: number) {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

async function run() {
  await connectDB();

  // Reset Chroma collection: delete existing `learning_items` collection then clear local cache
  try {
    const { chromaClient } = await initChroma();
    const collectionName = "learning_items";
    console.log(`🗑️ Attempting to delete Chroma collection: ${collectionName}`);
    try {
      await chromaClient.deleteCollection({ name: collectionName });
      console.log(`✔ Deleted Chroma collection: ${collectionName}`);
    } catch (err: any) {
      // If the collection doesn't exist or deletion fails, log and continue
      console.warn(
        `⚠️ Could not delete collection ${collectionName}:`,
        err?.message || err
      );
    }

    // Clear cached reference so next getLearningItemCollection recreates it
    await resetLearningItemCollection();
  } catch (err) {
    console.error(
      "❌ Error initializing Chroma (will continue to attempt ingest):",
      err
    );
  }

  console.log("🔍 Loading activities for incremental ingest...");
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
    `Found: lessons=${lessons.length}, quizzes=${quizzes.length}, vocab=${topicVocs.length}, dictations=${dictations.length}, shadowings=${shadowings.length}, tests=${tests.length}`
  );

  // Configure chunk size per batch (small to avoid embedding payload too large)
  const CHUNK_SIZE = 10;

  // Helper to build grouped object for ingestLearning from a list of items for a single activity key
  const buildGroupedForChunk = (
    items: any[],
    key: "lessons" | "quizzes" | "vocab" | "dictations" | "shadowings"
  ) => {
    const grouped: Record<number, any> = {};
    for (let p = 1; p <= 7; p++)
      grouped[p] = {
        lessons: [],
        dictations: [],
        shadowings: [],
        quizzes: [],
        vocab: [],
      };
    for (const it of items) {
      const part = Number(it.part_type || it.part) || 5;
      if (!grouped[part])
        grouped[part] = {
          lessons: [],
          dictations: [],
          shadowings: [],
          quizzes: [],
          vocab: [],
        };
      if (key === "lessons") grouped[part].lessons.push(it);
      else if (key === "quizzes") grouped[part].quizzes.push(it);
      else if (key === "vocab") grouped[part].vocab.push(it);
      else if (key === "dictations") grouped[part].dictations.push(it);
      else if (key === "shadowings") grouped[part].shadowings.push(it);
    }
    return grouped;
  };

  // list of activity sets to ingest sequentially
  const activitySets: { name: string; items: any[]; key: any }[] = [
    { name: "lessons", items: lessons as any[], key: "lessons" },
    { name: "quizzes", items: quizzes as any[], key: "quizzes" },
    { name: "vocab", items: topicVocs as any[], key: "vocab" },
    { name: "dictations", items: dictations as any[], key: "dictations" },
    { name: "shadowings", items: shadowings as any[], key: "shadowings" },
    { name: "tests", items: tests as any[], key: "quizzes" }, // push tests into quizzes bucket
  ];

  for (const set of activitySets) {
    console.log(
      `\n➡️ Ingesting activity type: ${set.name} (${set.items.length} items)`
    );
    const chunks = chunkArray(set.items, CHUNK_SIZE);
    let idx = 0;
    for (const chunk of chunks) {
      idx++;
      console.log(`  - Batch ${idx}/${chunks.length} (size=${chunk.length})`);
      const grouped = buildGroupedForChunk(chunk, set.key);
      try {
        await ingestLearning(grouped);
        console.log(`    ✔ Batch ${idx} ingested`);
      } catch (err) {
        console.error(`    ❌ Batch ${idx} failed:`, err);
        // if batch fails, wait and continue with next to avoid stopping entire run
        await new Promise((r) => setTimeout(r, 2000));
      }
      // small delay between batches
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log("\n✅ Incremental ingest finished.");
  process.exit(0);
}

if (require.main === module) run();

export default run;
