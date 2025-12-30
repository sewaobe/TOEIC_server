import path from "path";
import dotenv from "dotenv";
import { connectDB } from "../configs/db";
import { Lesson, Quiz, TopicVocabulary, Test as TestModel } from "../models";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";
import { ingestLearning } from "../ingest/ingest_learning";
import { ingestTests } from "../ingest/ingest_test";
import { initChroma } from "../core/initChroma";
import { resetLearningItemCollection } from "../core/collections/learning";
import { resetTestItemCollection } from "../core/collections/test";

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

  // Reset Chroma collections: delete existing collections then clear local cache
  try {
    const { chromaClient } = await initChroma();

    // Delete learning_items collection
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
    await resetLearningItemCollection();

    // Delete test_items collection
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
    await resetTestItemCollection();
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

  // list of activity sets to ingest sequentially (KHÔNG bao gồm tests)
  const activitySets: { name: string; items: any[]; key: any }[] = [
    { name: "lessons", items: lessons as any[], key: "lessons" },
    { name: "quizzes", items: quizzes as any[], key: "quizzes" },
    { name: "vocab", items: topicVocs as any[], key: "vocab" },
    { name: "dictations", items: dictations as any[], key: "dictations" },
    { name: "shadowings", items: shadowings as any[], key: "shadowings" },
  ];

  // Ingest learning items vào learning_items collection
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

  // Ingest tests riêng vào test_items collection
  console.log(
    `\n➡️ Ingesting tests into test_items collection (${tests.length} items)`
  );
  const testChunks = chunkArray(tests as any[], CHUNK_SIZE);
  let testIdx = 0;
  for (const chunk of testChunks) {
    testIdx++;
    console.log(
      `  - Test Batch ${testIdx}/${testChunks.length} (size=${chunk.length})`
    );
    try {
      await ingestTests(chunk);
      console.log(`    ✔ Test Batch ${testIdx} ingested`);
    } catch (err) {
      console.error(`    ❌ Test Batch ${testIdx} failed:`, err);
      await new Promise((r) => setTimeout(r, 2000));
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n✅ Incremental ingest finished.");
  process.exit(0);
}

if (require.main === module) run();

export default run;
