import path from "path";
import dotenv from "dotenv";
import { connectDB } from "../configs/db";
import { getLearningItemCollection } from "../core/collections/learning";
import { Lesson, Quiz, TopicVocabulary, Test } from "../models";
import { Dictation } from "../models/dictation.model";
import { Shadowing } from "../models/shadowing.model";

// load .env
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

async function run() {
  await connectDB();

  console.log("🔍 Verifying ChromaDB IDs against MongoDB...\n");

  try {
    // 1. Lấy tất cả IDs từ ChromaDB
    const collection = await getLearningItemCollection();
    const chromaResult = await collection.get({
      limit: 10000,
      include: ["metadatas"],
    });

    const chromaIds = chromaResult.ids || [];
    const metadatas = chromaResult.metadatas || [];

    console.log(`📊 Total items in ChromaDB: ${chromaIds.length}\n`);

    if (chromaIds.length === 0) {
      console.log("⚠️ ChromaDB collection is empty.");
      process.exit(0);
    }

    // 2. Lấy tất cả IDs từ MongoDB
    console.log("📥 Fetching all IDs from MongoDB...");
    const [lessons, quizzes, vocabs, dictations, shadowings, tests] =
      await Promise.all([
        Lesson.find({}).select("_id").lean(),
        Quiz.find({}).select("_id").lean(),
        TopicVocabulary.find({}).select("_id").lean(),
        Dictation.find({}).select("_id").lean(),
        Shadowing.find({}).select("_id").lean(),
        Test.find({}).select("_id").lean(),
      ]);

    // Tạo Set chứa tất cả MongoDB IDs
    const mongoIds = new Set<string>();
    lessons.forEach((l) => mongoIds.add(l._id.toString()));
    quizzes.forEach((q) => mongoIds.add(q._id.toString()));
    vocabs.forEach((v) => mongoIds.add(v._id.toString()));
    dictations.forEach((d) => mongoIds.add(d._id.toString()));
    shadowings.forEach((s) => mongoIds.add(s._id.toString()));
    tests.forEach((t) => mongoIds.add(t._id.toString()));

    console.log(`📊 Total IDs in MongoDB: ${mongoIds.size}`);
    console.log(`  - Lessons: ${lessons.length}`);
    console.log(`  - Quizzes: ${quizzes.length}`);
    console.log(`  - Vocab Topics: ${vocabs.length}`);
    console.log(`  - Dictations: ${dictations.length}`);
    console.log(`  - Shadowings: ${shadowings.length}`);
    console.log(`  - Tests: ${tests.length}\n`);

    // 3. Kiểm tra từng ID trong Chroma
    const missingIds: Array<{
      chromaId: string;
      itemType: string;
      itemId: string;
      partType: number;
    }> = [];
    const validIds: Array<string> = [];

    for (let i = 0; i < chromaIds.length; i++) {
      const chromaId = chromaIds[i];
      const metadata = metadatas[i] as any;
      const itemId = metadata?.item_id;
      const itemType = metadata?.item_type || "unknown";
      const partType = metadata?.part_type || 0;

      if (!itemId) {
        console.warn(`⚠️ Chroma ID "${chromaId}" has no item_id in metadata`);
        continue;
      }

      if (!mongoIds.has(itemId)) {
        missingIds.push({
          chromaId,
          itemType,
          itemId,
          partType,
        });
      } else {
        validIds.push(chromaId);
      }
    }

    // 4. Báo cáo kết quả
    console.log("=".repeat(60));
    console.log("📈 VERIFICATION RESULTS:");
    console.log("=".repeat(60));
    console.log(`✅ Valid IDs (exist in MongoDB): ${validIds.length}`);
    console.log(`❌ Missing IDs (NOT in MongoDB): ${missingIds.length}\n`);

    if (missingIds.length > 0) {
      console.log("❌ MISSING IDs DETAILS:");
      console.log("-".repeat(60));

      // Group by item type
      const byType: Record<string, typeof missingIds> = {};
      missingIds.forEach((item) => {
        if (!byType[item.itemType]) byType[item.itemType] = [];
        byType[item.itemType].push(item);
      });

      for (const [type, items] of Object.entries(byType)) {
        console.log(`\n📍 ${type.toUpperCase()} (${items.length} missing):`);
        items.forEach((item) => {
          console.log(
            `  - Chroma ID: ${item.chromaId} | MongoDB ID: ${item.itemId} | Part: ${item.partType}`
          );
        });
      }

      console.log("\n" + "=".repeat(60));
      console.log(
        "💡 Recommendation: Re-run ingest script to sync ChromaDB with MongoDB"
      );
      console.log(
        "   Run: npx ts-node src/scripts/ingest_incremental_to_chroma.ts"
      );
    } else {
      console.log("✅ ALL ChromaDB IDs exist in MongoDB!");
      console.log("✅ Data integrity verified successfully.");
    }

    console.log("=".repeat(60));
  } catch (err) {
    console.error("❌ Verification failed:", err);
  } finally {
    process.exit(0);
  }
}

if (require.main === module) run();

export default run;
