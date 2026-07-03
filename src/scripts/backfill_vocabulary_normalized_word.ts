import mongoose from "mongoose";
import { Vocabulary } from "../models";

function normalizeVocabularyWord(word?: string) {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function main() {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/toeic-db";
  await mongoose.connect(mongoUri);

  const vocabularies = await Vocabulary.find({})
    .select("_id word type normalized_word")
    .lean();
  const duplicateBuckets = new Map<string, string[]>();

  for (const vocabulary of vocabularies as any[]) {
    const normalizedWord = normalizeVocabularyWord(vocabulary.word);
    const type = String(vocabulary.type ?? "").trim().toLowerCase() || "word";
    const key = `${normalizedWord}::${type}`;
    const entries = duplicateBuckets.get(key) ?? [];
    entries.push(String(vocabulary._id));
    duplicateBuckets.set(key, entries);

    if (vocabulary.normalized_word !== normalizedWord) {
      await Vocabulary.updateOne(
        { _id: vocabulary._id },
        { $set: { normalized_word: normalizedWord, type } }
      );
    }
  }

  const duplicates = Array.from(duplicateBuckets.entries()).filter(
    ([, ids]) => ids.length > 1
  );
  if (duplicates.length) {
    console.warn("Duplicate normalized vocabulary keys found:");
    for (const [key, ids] of duplicates.slice(0, 50)) {
      console.warn(`${key}: ${ids.join(", ")}`);
    }
    console.warn(
      `Total duplicate keys: ${duplicates.length}. Resolve these before relying on the unique index.`
    );
  } else {
    console.info("No duplicate normalized vocabulary keys found.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
