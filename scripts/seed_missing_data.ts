/**
 * SEED MISSING DATA SCRIPT
 * 
 * Script này sẽ bổ sung dữ liệu còn thiếu cho các Part 2, 3, 4, 6, 7
 * bằng cách clone từ records mẫu hiện có và thay đổi level/weight/part_type
 * 
 * CÁC LEVEL: A1, A2, B1, B2, C1, C2
 * CÁC WEIGHT: 0.1, 0.3, 0.5, 0.7, 0.9
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const WEIGHTS = [0.1, 0.3, 0.5, 0.7, 0.9];

// Parts cần bổ sung dữ liệu
const PARTS_TO_SEED = {
  dictation: [2, 3, 4, 6, 7], // Part 1 đã có nhiều, còn lại thiếu
  shadowing: [1, 2, 3, 4, 6, 7], // Part 5 có 10, còn lại thiếu
  lesson: [2, 3, 4, 6, 7], // Part 5 có nhiều, còn lại thiếu
  quiz: [1, 2, 3, 4, 6, 7], // Part 5 có nhiều, còn lại thiếu
};

// Số lượng documents muốn tạo cho mỗi Part x Level x Weight
const DOCS_PER_COMBO = 2;

async function seedMissingData() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGO_URI found');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB\n');

  const Dictation = mongoose.model('Dictation', new mongoose.Schema({}, { strict: false }), 'dictations');
  const Shadowing = mongoose.model('Shadowing', new mongoose.Schema({}, { strict: false }), 'shadowings');
  const Lesson = mongoose.model('Lesson', new mongoose.Schema({}, { strict: false }), 'lessons');
  const Quiz = mongoose.model('Quiz', new mongoose.Schema({}, { strict: false }), 'quizzes');

  let totalCreated = 0;

  // ==================== SEED DICTATION ====================
  console.log('📝 Seeding DICTATION...');
  const dictTemplate = await Dictation.findOne({ part_type: 1 }).lean();
  if (dictTemplate) {
    for (const partType of PARTS_TO_SEED.dictation) {
      for (const level of LEVELS) {
        for (const weight of WEIGHTS) {
          const existing = await Dictation.countDocuments({ 
            part_type: partType, 
            level, 
            weight: { $gte: weight - 0.05, $lte: weight + 0.05 } 
          });
          
          if (existing < DOCS_PER_COMBO) {
            const toCreate = DOCS_PER_COMBO - existing;
            for (let i = 0; i < toCreate; i++) {
              const newDoc = {
                ...dictTemplate,
                _id: new mongoose.Types.ObjectId(),
                part_type: partType,
                level,
                weight,
                title: `[SEED] Dictation Part ${partType} - ${level} - W${weight} #${i + 1}`,
                created_at: new Date(),
                updated_at: new Date(),
              };
              await Dictation.create(newDoc);
              totalCreated++;
            }
            console.log(`  ✓ Part ${partType}, ${level}, weight=${weight}: created ${toCreate}`);
          }
        }
      }
    }
  } else {
    console.log('  ⚠️ No dictation template found');
  }

  // ==================== SEED SHADOWING ====================
  console.log('\n📝 Seeding SHADOWING...');
  const shadTemplate = await Shadowing.findOne({ part_type: 5 }).lean();
  if (shadTemplate) {
    for (const partType of PARTS_TO_SEED.shadowing) {
      for (const level of LEVELS) {
        for (const weight of WEIGHTS) {
          const existing = await Shadowing.countDocuments({ 
            part_type: partType, 
            level, 
            weight: { $gte: weight - 0.05, $lte: weight + 0.05 } 
          });
          
          if (existing < DOCS_PER_COMBO) {
            const toCreate = DOCS_PER_COMBO - existing;
            for (let i = 0; i < toCreate; i++) {
              const newDoc = {
                ...shadTemplate,
                _id: new mongoose.Types.ObjectId(),
                part_type: partType,
                level,
                weight,
                title: `[SEED] Shadowing Part ${partType} - ${level} - W${weight} #${i + 1}`,
                created_at: new Date(),
                updated_at: new Date(),
              };
              await Shadowing.create(newDoc);
              totalCreated++;
            }
            console.log(`  ✓ Part ${partType}, ${level}, weight=${weight}: created ${toCreate}`);
          }
        }
      }
    }
  } else {
    console.log('  ⚠️ No shadowing template found');
  }

  // ==================== SEED LESSON ====================
  console.log('\n📝 Seeding LESSON...');
  const lessonTemplate = await Lesson.findOne({ part_type: 5 }).lean();
  if (lessonTemplate) {
    for (const partType of PARTS_TO_SEED.lesson) {
      for (const level of LEVELS) {
        for (const weight of WEIGHTS) {
          const existing = await Lesson.countDocuments({ 
            part_type: partType, 
            level, 
            weight: { $gte: weight - 0.05, $lte: weight + 0.05 } 
          });
          
          if (existing < DOCS_PER_COMBO) {
            const toCreate = DOCS_PER_COMBO - existing;
            for (let i = 0; i < toCreate; i++) {
              const newDoc = {
                ...lessonTemplate,
                _id: new mongoose.Types.ObjectId(),
                part_type: partType,
                level,
                weight,
                title: `[SEED] Lesson Part ${partType} - ${level} - W${weight} #${i + 1}`,
                summary: `[SEED] Auto-generated lesson for Part ${partType}, Level ${level}`,
                created_at: new Date(),
                updated_at: new Date(),
              };
              await Lesson.create(newDoc);
              totalCreated++;
            }
            console.log(`  ✓ Part ${partType}, ${level}, weight=${weight}: created ${toCreate}`);
          }
        }
      }
    }
  } else {
    console.log('  ⚠️ No lesson template found');
  }

  // ==================== SEED QUIZ ====================
  console.log('\n📝 Seeding QUIZ...');
  const quizTemplate = await Quiz.findOne({ part_type: 5 }).lean();
  if (quizTemplate) {
    for (const partType of PARTS_TO_SEED.quiz) {
      for (const level of LEVELS) {
        for (const weight of WEIGHTS) {
          const existing = await Quiz.countDocuments({ 
            part_type: partType, 
            level, 
            weight: { $gte: weight - 0.05, $lte: weight + 0.05 } 
          });
          
          if (existing < DOCS_PER_COMBO) {
            const toCreate = DOCS_PER_COMBO - existing;
            for (let i = 0; i < toCreate; i++) {
              const newDoc = {
                ...quizTemplate,
                _id: new mongoose.Types.ObjectId(),
                part_type: partType,
                level,
                weight,
                title: `[SEED] Quiz Part ${partType} - ${level} - W${weight} #${i + 1}`,
                created_at: new Date(),
                updated_at: new Date(),
              };
              await Quiz.create(newDoc);
              totalCreated++;
            }
            console.log(`  ✓ Part ${partType}, ${level}, weight=${weight}: created ${toCreate}`);
          }
        }
      }
    }
  } else {
    console.log('  ⚠️ No quiz template found');
  }

  console.log(`\n🎉 DONE! Total documents created: ${totalCreated}`);
  
  // Verify
  console.log('\n=== VERIFICATION ===');
  for (let part = 1; part <= 7; part++) {
    const dictCount = await Dictation.countDocuments({ part_type: part });
    const shadCount = await Shadowing.countDocuments({ part_type: part });
    const lessonCount = await Lesson.countDocuments({ part_type: part });
    const quizCount = await Quiz.countDocuments({ part_type: part });
    console.log(`Part ${part}: Dict=${dictCount}, Shad=${shadCount}, Lesson=${lessonCount}, Quiz=${quizCount}`);
  }

  await mongoose.disconnect();
}

seedMissingData().catch(console.error);
