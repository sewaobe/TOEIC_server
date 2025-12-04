import path from "path";
import dotenv from "dotenv";
import { getLearningItemCollection } from "../core/collections/learning";

// load .env
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

async function run() {
  console.log(
    "🔍 Fetching all IDs from Chroma collection 'learning_items'...\n"
  );

  try {
    const collection = await getLearningItemCollection();

    // Get all items (ChromaDB get() without filters returns all)
    const result = await collection.get({
      limit: 10000, // adjust if you have more items
      include: ["metadatas", "documents"], // optionally include metadata and documents
    });

    const ids = result.ids || [];
    const metadatas = result.metadatas || [];
    const documents = result.documents || [];

    console.log(`📊 Total items in collection: ${ids.length}\n`);

    if (ids.length === 0) {
      console.log("⚠️ Collection is empty or does not exist.");
      process.exit(0);
    }

    // Group by item_type for summary
    const byType: Record<string, number> = {};
    const byPart: Record<number, number> = {};

    for (let i = 0; i < ids.length; i++) {
      const meta = metadatas[i] as any;
      const itemType = meta?.item_type || "unknown";
      const partType = meta?.part_type || 0;

      byType[itemType] = (byType[itemType] || 0) + 1;
      byPart[partType] = (byPart[partType] || 0) + 1;
    }

    console.log("📈 Breakdown by item_type:");
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  - ${type}: ${count}`);
    }

    console.log("\n📈 Breakdown by part_type:");
    for (const [part, count] of Object.entries(byPart).sort(
      ([a], [b]) => Number(a) - Number(b)
    )) {
      console.log(`  - Part ${part}: ${count}`);
    }

    // Print all lessons
    console.log("\n📚 All LESSON item IDs:");
    const lessonIds: string[] = [];
    ids.forEach((id: string, idx: number) => {
      const meta = metadatas[idx] as any;
      if (meta?.item_type === "lesson") {
        lessonIds.push(id);
      }
    });
    console.log(JSON.stringify(lessonIds, null, 2));

    // Check for specific ID
    const searchId = "69266eb93768206184118ef9";
    console.log(`\n🔍 Searching for ID: ${searchId}`);

    const foundIndex = ids.findIndex((id: string) => id.includes(searchId));
    if (foundIndex !== -1) {
      const meta = metadatas[foundIndex] as any;
      console.log(`✅ FOUND at index ${foundIndex}:`);
      console.log(`   Full ID: ${ids[foundIndex]}`);
      console.log(`   item_type: ${meta?.item_type}`);
      console.log(`   item_id: ${meta?.item_id}`);
      console.log(`   part_type: ${meta?.part_type}`);
      console.log(`   level: ${meta?.level}`);
      console.log(`   weight: ${meta?.weight}`);
    } else {
      console.log(`❌ NOT FOUND in collection`);
    }

    // Optionally print first 20 IDs as sample
    console.log("\n📋 Sample IDs (first 20):");
    ids.slice(0, 20).forEach((id: string, idx: number) => {
      const meta = metadatas[idx] as any;
      console.log(
        `  ${idx + 1}. ${id} | type: ${meta?.item_type || "?"} | part: ${
          meta?.part_type || "?"
        } | level: ${meta?.level || "?"}`
      );
    });

    if (ids.length > 20) {
      console.log(`  ... and ${ids.length - 20} more items.`);
    }

    // Optionally save full list to file
    const fs = require("fs");
    const outputPath = path.resolve(__dirname, "../../chroma_ids_list.json");
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        {
          total: ids.length,
          byType,
          byPart,
          ids: ids.map((id: string, i: number) => ({
            id,
            item_type: (metadatas[i] as any)?.item_type,
            part_type: (metadatas[i] as any)?.part_type,
            level: (metadatas[i] as any)?.level,
            weight: (metadatas[i] as any)?.weight,
            item_id: (metadatas[i] as any)?.item_id,
          })),
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log(`\n💾 Full list saved to: ${outputPath}`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error fetching from Chroma:", err);
    process.exit(1);
  }
}

if (require.main === module) run();

export default run;
