import path from "path";
import dotenv from "dotenv";
import { connectDB } from "../configs/db";
import { getTestItemCollection } from "../core/collections/test";
import { Test } from "../models/test.model";

// load .env
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

async function run() {
  await connectDB();

  // Check MongoDB tests count
  const mongoCount = await Test.countDocuments({});
  console.log(`📦 Tests in MongoDB: ${mongoCount}`);

  // Check ChromaDB test_items collection
  const collection = await getTestItemCollection();
  const chromaCount = await collection.count();
  console.log(`🔍 Tests in ChromaDB test_items: ${chromaCount}`);

  if (chromaCount > 0) {
    const items = await collection.get({ limit: 5 });
    console.log("\n📋 Sample test items:");
    items.ids.forEach((id: string, idx: number) => {
      console.log(`  ${idx + 1}. ID: ${id}`);
      console.log(`     Title: ${items.metadatas[idx]?.title || "N/A"}`);
      console.log(`     item_id: ${items.metadatas[idx]?.item_id || "N/A"}`);
    });
  } else {
    console.log("\n⚠️ ChromaDB test_items collection is EMPTY!");
    console.log(
      "👉 Run: npx ts-node src/scripts/ingest_incremental_to_chroma.ts"
    );
  }

  process.exit(0);
}

run().catch(console.error);
