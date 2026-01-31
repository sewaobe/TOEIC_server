import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGODB_URI found in .env');
    process.exit(1);
  }
  await mongoose.connect(uri);
  
  const Dictation = mongoose.model('Dictation', new mongoose.Schema({}, { strict: false }), 'dictations');
  const Shadowing = mongoose.model('Shadowing', new mongoose.Schema({}, { strict: false }), 'shadowings');
  const Lesson = mongoose.model('Lesson', new mongoose.Schema({}, { strict: false }), 'lessons');
  const Quiz = mongoose.model('Quiz', new mongoose.Schema({}, { strict: false }), 'quizzes');
  const TopicVocab = mongoose.model('TopicVocabulary', new mongoose.Schema({}, { strict: false }), 'topicvocabularies');

  console.log('=== CHECKING DATA FOR PART 2, 3 (MEDIUM PARTS) ===\n');
  
  // Part 2
  const dict2 = await Dictation.find({ part_type: 2 }).select('level weight').lean();
  console.log('Dictation Part 2:', dict2.length, 'items');
  console.log('  Levels:', [...new Set(dict2.map((d: any) => d.level))]);
  console.log('  Weights:', [...new Set(dict2.map((d: any) => d.weight))].sort());
  
  const shad2 = await Shadowing.find({ part_type: 2 }).select('level weight').lean();
  console.log('Shadowing Part 2:', shad2.length, 'items');
  console.log('  Levels:', [...new Set(shad2.map((d: any) => d.level))]);
  console.log('  Weights:', [...new Set(shad2.map((d: any) => d.weight))].sort());
  
  const quiz2 = await Quiz.find({ part_type: 2 }).select('level weight').lean();
  console.log('Quiz Part 2:', quiz2.length, 'items');
  console.log('  Levels:', [...new Set(quiz2.map((d: any) => d.level))]);
  console.log('  Weights:', [...new Set(quiz2.map((d: any) => d.weight))].sort());

  // Part 3
  console.log('\n--- Part 3 ---');
  const dict3 = await Dictation.find({ part_type: 3 }).select('level weight').lean();
  console.log('Dictation Part 3:', dict3.length, 'items');
  console.log('  Levels:', [...new Set(dict3.map((d: any) => d.level))]);
  console.log('  Weights:', [...new Set(dict3.map((d: any) => d.weight))].sort());
  
  const shad3 = await Shadowing.find({ part_type: 3 }).select('level weight').lean();
  console.log('Shadowing Part 3:', shad3.length, 'items');
  console.log('  Levels:', [...new Set(shad3.map((d: any) => d.level))]);
  console.log('  Weights:', [...new Set(shad3.map((d: any) => d.weight))].sort());
  
  const lesson3 = await Lesson.find({ part_type: 3 }).select('level weight').lean();
  console.log('Lesson Part 3:', lesson3.length, 'items');
  console.log('  Levels:', [...new Set(lesson3.map((d: any) => d.level))]);
  console.log('  Weights:', [...new Set(lesson3.map((d: any) => d.weight))].sort());
  
  const quiz3 = await Quiz.find({ part_type: 3 }).select('level weight').lean();
  console.log('Quiz Part 3:', quiz3.length, 'items');
  console.log('  Levels:', [...new Set(quiz3.map((d: any) => d.level))]);
  console.log('  Weights:', [...new Set(quiz3.map((d: any) => d.weight))].sort());

  // Query exactly like the code for Part 2 (theta=1.85 -> B2/C1/C2, weight 0.5-1.0)
  console.log('\n=== EXACT QUERY FOR PART 2 (level B2/C1/C2, weight 0.5-1.0) ===');
  const matchDict2 = await Dictation.find({
    part_type: 2,
    level: { $in: ['B2', 'C1', 'C2'] },
    weight: { $gte: 0.5, $lte: 1.0 }
  }).lean();
  console.log('Dictation Part 2 match:', matchDict2.length);
  
  const matchShad2 = await Shadowing.find({
    part_type: 2,
    level: { $in: ['B2', 'C1', 'C2'] },
    weight: { $gte: 0.5, $lte: 1.0 }
  }).lean();
  console.log('Shadowing Part 2 match:', matchShad2.length);

  const matchQuiz2 = await Quiz.find({
    part_type: 2,
    level: { $in: ['B2', 'C1', 'C2'] },
    weight: { $gte: 0.5, $lte: 1.0 }
  }).lean();
  console.log('Quiz Part 2 match:', matchQuiz2.length);

  // Query exactly like the code for Part 3 (theta=0.59 -> B1/B2/C1, weight 0.5-1.0)
  console.log('\n=== EXACT QUERY FOR PART 3 (level B1/B2/C1, weight 0.5-1.0) ===');
  const matchDict3 = await Dictation.find({
    part_type: 3,
    level: { $in: ['B1', 'B2', 'C1'] },
    weight: { $gte: 0.5, $lte: 1.0 }
  }).lean();
  console.log('Dictation Part 3 match:', matchDict3.length);
  
  const matchShad3 = await Shadowing.find({
    part_type: 3,
    level: { $in: ['B1', 'B2', 'C1'] },
    weight: { $gte: 0.5, $lte: 1.0 }
  }).lean();
  console.log('Shadowing Part 3 match:', matchShad3.length);
  
  const matchLesson3 = await Lesson.find({
    part_type: 3,
    level: { $in: ['B1', 'B2', 'C1'] },
    weight: { $gte: 0.5, $lte: 1.0 }
  }).lean();
  console.log('Lesson Part 3 match:', matchLesson3.length);

  const matchQuiz3 = await Quiz.find({
    part_type: 3,
    level: { $in: ['B1', 'B2', 'C1'] },
    weight: { $gte: 0.5, $lte: 1.0 }
  }).lean();
  console.log('Quiz Part 3 match:', matchQuiz3.length);

  // Check total items for ALL Parts
  console.log('\n=== TOTAL ITEMS PER PART (ALL LEVELS) ===');
  for (let part = 1; part <= 7; part++) {
    const dictCount = await Dictation.countDocuments({ part_type: part });
    const shadCount = await Shadowing.countDocuments({ part_type: part });
    const lessonCount = await Lesson.countDocuments({ part_type: part });
    const quizCount = await Quiz.countDocuments({ part_type: part });
    const vocabCount = await TopicVocab.countDocuments({ part_type: part });
    console.log(`Part ${part}: Dict=${dictCount}, Shad=${shadCount}, Lesson=${lessonCount}, Quiz=${quizCount}, Vocab=${vocabCount}`);
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

check().catch(console.error);
