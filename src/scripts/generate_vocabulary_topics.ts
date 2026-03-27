/**
 * Script tự động tạo Topics và phân loại từ vựng Oxford 5000
 *
 * Chiến lược chia topics:
 * 1. Chia theo CEFR Level + Theme (Business A1, Business B1, ...)
 * 2. Mỗi topic 30-50 từ (dễ học, không quá dài)
 * 3. Ưu tiên themes có nhiều từ và liên quan TOEIC
 *
 * Sử dụng:
 * npx ts-node src/scripts/generate_vocabulary_topics.ts
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { Vocabulary, TopicVocabulary } from "../models";

const OXFORD_FILE_PATH = path.join(
  __dirname,
  "../../../oxford-5000-final.json",
);

// User ID để seed data
const SEED_USER_ID = new mongoose.Types.ObjectId("69482700ffae3f3467004f5e");

interface OxfordVocab {
  word: string;
  phonetic: string;
  type: string;
  weight: number;
  definition: string;
  examples?: { en: string; vi: string }[];
  image?: string;
  audio: string;
  part_type: "reading" | "listening";
  tags: string[];
  notes?: string;
  _extra?: any;
}

// Cấu hình topics theo themes quan trọng cho TOEIC
const TOPIC_THEMES = [
  // === CORE TOEIC THEMES (Ưu tiên cao) ===
  { key: "Business", name: "Kinh doanh", priority: 1, toeic: true },
  { key: "Finance", name: "Tài chính", priority: 1, toeic: true },
  { key: "Money", name: "Tiền bạc", priority: 1, toeic: true },
  { key: "Office", name: "Văn phòng", priority: 1, toeic: true },
  { key: "Jobs", name: "Công việc", priority: 1, toeic: true },
  { key: "Communication", name: "Giao tiếp", priority: 1, toeic: true },
  { key: "Technology", name: "Công nghệ", priority: 1, toeic: true },
  {
    key: "Transportation",
    name: "Giao thông vận tải",
    priority: 1,
    toeic: true,
  },
  { key: "Shopping", name: "Mua sắm", priority: 1, toeic: true },
  { key: "Travel", name: "Du lịch", priority: 1, toeic: true },

  // === GENERAL THEMES ===
  { key: "Food", name: "Thức ăn & Đồ uống", priority: 2, toeic: true },
  { key: "Health", name: "Sức khỏe", priority: 2, toeic: true },
  { key: "Education", name: "Giáo dục", priority: 2, toeic: false },
  { key: "Home", name: "Gia đình & Nhà cửa", priority: 2, toeic: true },
  { key: "Entertainment", name: "Giải trí", priority: 2, toeic: true },
  { key: "Sports", name: "Thể thao", priority: 2, toeic: false },

  // === ACADEMIC/ADVANCED ===
  { key: "Science", name: "Khoa học", priority: 3, toeic: false },
  { key: "Politics", name: "Chính trị", priority: 3, toeic: false },
  { key: "Environment", name: "Môi trường", priority: 3, toeic: false },
  { key: "Law", name: "Pháp luật", priority: 3, toeic: false },
];

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

interface TopicConfig {
  title: string;
  description: string;
  level: string;
  theme: string;
  part_type?: number; // PartType enum (1-7), optional
  priority: number;
  vocabIds: string[];
}

async function generateVocabularyTopics() {
  try {
    // Kết nối MongoDB
    const MONGODB_URI =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/toeic-db";
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Đã kết nối MongoDB\n");

    // Đọc file Oxford JSON
    console.log("📖 Đang đọc Oxford data...");
    const rawData = fs.readFileSync(OXFORD_FILE_PATH, "utf-8");
    const oxfordData: OxfordVocab[] = JSON.parse(rawData);
    console.log(`📊 Tổng số từ: ${oxfordData.length}\n`);

    // Import tất cả vocabulary vào DB (nếu chưa có)
    console.log("📝 Đang import vocabulary vào database...");
    let importCount = 0;
    const wordToIdMap = new Map<string, string>();

    for (const item of oxfordData) {
      let vocab = await Vocabulary.findOne({ word: item.word });

      if (!vocab) {
        vocab = await Vocabulary.create({
          word: item.word,
          phonetic: item.phonetic,
          type: item.type,
          weight: item.weight,
          definition: item.definition,
          examples: item.examples || [],
          image: item.image || "",
          audio: item.audio,
          part_type: item.part_type,
          tags: item.tags,
          notes: item.notes || "",
        });
        importCount++;
      }

      wordToIdMap.set(
        item.word,
        (vocab._id as mongoose.Types.ObjectId).toString(),
      );
    }
    console.log(`✅ Import: ${importCount} từ mới\n`);

    // Phân loại từ theo Level + Theme
    console.log("🔄 Đang phân loại từ vựng...\n");
    const topicsMap = new Map<string, TopicConfig>();

    for (const item of oxfordData) {
      // Xác định CEFR level
      const level = item.tags.find((t) => CEFR_LEVELS.includes(t)) || "B1";

      // Xác định themes
      for (const themeConfig of TOPIC_THEMES) {
        const hasTheme = item.tags.some((t) =>
          t.toLowerCase().includes(themeConfig.key.toLowerCase()),
        );

        if (hasTheme) {
          const topicKey = `${level}-${themeConfig.key}`;

          if (!topicsMap.has(topicKey)) {
            topicsMap.set(topicKey, {
              title: `${themeConfig.name} - ${level}`,
              description: `Từ vựng chủ đề ${themeConfig.name} cho trình độ ${level}${themeConfig.toeic ? " (TOEIC)" : ""}`,
              level: level,
              theme: themeConfig.key,
              priority: themeConfig.priority,
              vocabIds: [],
            });
          }

          const topic = topicsMap.get(topicKey)!;
          const vocabId = wordToIdMap.get(item.word);
          if (vocabId && !topic.vocabIds.includes(vocabId)) {
            topic.vocabIds.push(vocabId);
          }
        }
      }

      // Nếu không thuộc theme nào, gán vào "General Vocabulary"
      const hasAnyTheme = TOPIC_THEMES.some((tc) =>
        item.tags.some((t) => t.toLowerCase().includes(tc.key.toLowerCase())),
      );

      if (!hasAnyTheme) {
        const level = item.tags.find((t) => CEFR_LEVELS.includes(t)) || "B1";
        const topicKey = `${level}-General`;

        if (!topicsMap.has(topicKey)) {
          topicsMap.set(topicKey, {
            title: `Từ vựng tổng hợp - ${level}`,
            description: `Từ vựng cơ bản và quan trọng cho trình độ ${level}`,
            level: level,
            theme: "General",
            priority: 4,
            vocabIds: [],
          });
        }

        const topic = topicsMap.get(topicKey)!;
        const vocabId = wordToIdMap.get(item.word);
        if (vocabId && !topic.vocabIds.includes(vocabId)) {
          topic.vocabIds.push(vocabId);
        }
      }
    }

    // Lọc topics có ít nhất 10 từ
    const validTopics = Array.from(topicsMap.values())
      .filter((t) => t.vocabIds.length >= 10)
      .sort(
        (a, b) =>
          a.priority - b.priority || b.vocabIds.length - a.vocabIds.length,
      );

    console.log("📊 THỐNG KÊ TOPICS:\n");
    console.log(`Tổng số topics: ${validTopics.length}\n`);

    // Hiển thị preview
    const preview = validTopics.slice(0, 15);
    console.log("=== TOP 15 TOPICS ===");
    preview.forEach((t, i) => {
      console.log(
        `${i + 1}. ${t.title} - ${t.vocabIds.length} từ (Priority ${t.priority})`,
      );
    });
    console.log("");

    // Hỏi user có muốn tạo không
    console.log("⚠️  Chuẩn bị tạo topics vào database...");
    console.log("Nhấn Ctrl+C để hủy, hoặc đợi 3 giây để tiếp tục...\n");

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Tạo topics vào DB
    console.log("🚀 Đang tạo topics...\n");
    let created = 0;
    let skipped = 0;

    for (const topicConfig of validTopics) {
      // Kiểm tra đã tồn tại chưa
      const existing = await TopicVocabulary.findOne({
        title: topicConfig.title,
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Tạo topic mới
      const topicData: any = {
        title: topicConfig.title,
        description: topicConfig.description,
        vocabularies_id: topicConfig.vocabIds.map(
          (id) => new mongoose.Types.ObjectId(id),
        ),
        isPublic: true,
        created_by: SEED_USER_ID,
      };

      // Chỉ thêm part_type nếu có
      if (topicConfig.part_type) {
        topicData.part_type = topicConfig.part_type;
      }

      await TopicVocabulary.create(topicData);

      created++;

      if (created % 10 === 0) {
        console.log(`   ✓ Đã tạo ${created} topics...`);
      }
    }

    // Tổng kết
    console.log("\n" + "=".repeat(60));
    console.log("🎉 HOÀN TẤT!");
    console.log("=".repeat(60));
    console.log(`✅ Đã tạo: ${created} topics`);
    console.log(`⏭️  Bỏ qua: ${skipped} topics (đã tồn tại)`);
    console.log(
      `📊 Tổng trong DB: ${await TopicVocabulary.countDocuments()} topics`,
    );
    console.log(`📚 Tổng từ vựng: ${await Vocabulary.countDocuments()} từ`);

    // Hiển thị một vài topics mẫu
    console.log("\n📋 MỘT SỐ TOPICS VỪA TẠO:");
    const samples = await TopicVocabulary.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    for (const topic of samples) {
      console.log(`\n  📖 ${topic.title}`);
      console.log(`     ${topic.description}`);
      console.log(`     ${topic.vocabularies_id.length} từ vựng`);
    }
  } catch (error: any) {
    console.error("💥 Lỗi:", error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Đã ngắt kết nối MongoDB");
  }
}

// Chạy script
if (require.main === module) {
  generateVocabularyTopics();
}

export { generateVocabularyTopics };
