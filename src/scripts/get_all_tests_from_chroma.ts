import path from "path";
import dotenv from "dotenv";
import { getTestItemCollection } from "../core/collections/test";

// Load .env
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

async function getAllTestsFromChroma() {
  console.log("🔍 Lấy tất cả Tests từ ChromaDB collection 'test_items'...\n");

  try {
    const collection = await getTestItemCollection();

    // Lấy tất cả tests
    const result = await collection.get({
      limit: 10000,
      include: ["metadatas", "documents"],
    });

    const ids = result.ids || [];
    const metadatas = result.metadatas || [];
    const documents = result.documents || [];

    console.log(`📊 Tổng số Tests trong ChromaDB: ${ids.length}\n`);

    if (ids.length === 0) {
      console.log("⚠️ Không tìm thấy Test nào trong ChromaDB.");
      process.exit(0);
    }

    // Hiển thị chi tiết từng test
    console.log("📋 Danh sách Tests:\n");
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const meta = metadatas[i] as any;
      const doc = documents[i];

      console.log(`${i + 1}. Test ID (Chroma): ${id}`);
      console.log(`   MongoDB ID: ${meta?.item_id || "N/A"}`);
      console.log(`   Title: ${meta?.title || "N/A"}`);
      console.log(`   Level: ${meta?.level || "N/A"}`);
      console.log(`   Total Questions: ${meta?.total_questions || 0}`);
      console.log(`   Duration: ${meta?.duration || 0} minutes`);
      console.log(`   Status: ${meta?.status || "N/A"}`);

      if (doc) {
        const preview = doc.length > 150 ? doc.substring(0, 150) + "..." : doc;
        console.log(`   Content preview: ${preview}`);
      }
      console.log("   ---");
    }

    // Thống kê theo Level
    const byLevel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (let i = 0; i < metadatas.length; i++) {
      const meta = metadatas[i] as any;
      const level = meta?.level || "unknown";
      const status = meta?.status || "unknown";

      byLevel[level] = (byLevel[level] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    console.log("\n📈 Thống kê Tests theo Level:");
    for (const [level, count] of Object.entries(byLevel)) {
      console.log(`  - ${level}: ${count} tests`);
    }

    console.log("\n📈 Thống kê Tests theo Status:");
    for (const [status, count] of Object.entries(byStatus)) {
      console.log(`  - ${status}: ${count} tests`);
    }

    console.log("\n✅ Hoàn thành!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi khi lấy Tests từ ChromaDB:", error);
    process.exit(1);
  }
}

// Chạy script
getAllTestsFromChroma();
