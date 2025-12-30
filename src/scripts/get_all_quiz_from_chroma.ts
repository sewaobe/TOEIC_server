import path from "path";
import dotenv from "dotenv";
import { getLearningItemCollection } from "../core/collections/learning";

// Load .env
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

async function getAllQuizFromChroma() {
  console.log(
    "🔍 Lấy tất cả Quiz từ ChromaDB collection 'learning_items'...\n"
  );

  try {
    const collection = await getLearningItemCollection();

    // Lấy tất cả items với metadata filter cho quiz
    const result = await collection.get({
      where: { item_type: "quiz" }, // Chỉ lấy quiz
      limit: 10000, // Điều chỉnh nếu có nhiều hơn
      include: ["metadatas", "documents"], // Bao gồm metadata và documents (nội dung text)
    });

    const ids = result.ids || [];
    const metadatas = result.metadatas || [];
    const documents = result.documents || [];

    console.log(`📊 Tổng số Quiz trong ChromaDB: ${ids.length}\n`);

    if (ids.length === 0) {
      console.log("⚠️ Không tìm thấy Quiz nào trong ChromaDB.");
      process.exit(0);
    }

    // Hiển thị chi tiết từng quiz
    console.log("📋 Danh sách Quiz:\n");
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const meta = metadatas[i] as any;
      const doc = documents[i];

      console.log(`${i + 1}. Quiz ID (Chroma): ${id}`);
      console.log(`   MongoDB ID: ${meta?.item_id || "N/A"}`);
      console.log(`   Part Type: ${meta?.part_type || "N/A"}`);
      console.log(`   Title: ${meta?.title || "N/A"}`);
      console.log(`   Level: ${meta?.level || "N/A"}`);
      console.log(`   Tags: ${meta?.tags || "N/A"}`);

      // Document chứa nội dung text đã được embed
      if (doc) {
        const preview = doc.length > 150 ? doc.substring(0, 150) + "..." : doc;
        console.log(`   Content preview: ${preview}`);
      }
      console.log("   ---");
    }

    // Thống kê theo Part
    const byPart: Record<number, number> = {};
    const byLevel: Record<string, number> = {};

    for (let i = 0; i < metadatas.length; i++) {
      const meta = metadatas[i] as any;
      const partType = meta?.part_type || 0;
      const level = meta?.level || "unknown";

      byPart[partType] = (byPart[partType] || 0) + 1;
      byLevel[level] = (byLevel[level] || 0) + 1;
    }

    console.log("\n📈 Thống kê Quiz theo Part:");
    for (const [part, count] of Object.entries(byPart).sort(
      ([a], [b]) => Number(a) - Number(b)
    )) {
      console.log(`  - Part ${part}: ${count} quiz`);
    }

    console.log("\n📈 Thống kê Quiz theo Level:");
    for (const [level, count] of Object.entries(byLevel)) {
      console.log(`  - ${level}: ${count} quiz`);
    }

    console.log("\n✅ Hoàn thành!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi khi lấy Quiz từ ChromaDB:", error);
    process.exit(1);
  }
}

// Chạy script
getAllQuizFromChroma();
