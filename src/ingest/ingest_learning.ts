import { getLearningItemCollection } from "../core/collections/learning";
import { saveDebugFile } from "../services/demo.service";

function formatItemToChromaDoc(item: any, part: number, type: string) {
  const textBlocks: string[] = [];

  textBlocks.push(`LEARNING_TYPE: ${type}`);
  textBlocks.push(`TOEIC_PART: ${part}`);
  textBlocks.push(`THIS_LESSON_BELONGS_TO_TOEIC_PART_${part}`);

  if (item.title) textBlocks.push(`TITLE: ${item.title}`);
  if (item.summary) textBlocks.push(`SUMMARY: ${item.summary}`);
  if (item.transcript)
    textBlocks.push(`TRANSCRIPT: ${item.transcript.substring(0, 2000)}`);
  if (item.tags) textBlocks.push(`TAGS: ${item.tags.join(", ")}`);

  const rawDoc = textBlocks.join("\n");
  const MAX_DOC_LENGTH = 800; // truncate to avoid embedding payload too large
  const document =
    rawDoc.length > MAX_DOC_LENGTH
      ? rawDoc.slice(0, MAX_DOC_LENGTH) + "\n[TRUNCATED]"
      : rawDoc;

  return {
    id: `${type}_${part}_${item._id}`,
    document,
    metadata: {
      part_type: part,
      level: item.level,
      weight: item.weight,
      item_type: type,
      item_id: item._id.toString(),
    },
  };
}

export async function ingestLearning(filteredData: Record<number, any>) {
  const collection = await getLearningItemCollection();

  const items: {
    id: string;
    document: string;
    metadata: any;
  }[] = [];
  saveDebugFile(`ingest.json`, filteredData);
  // gom data
  for (let part = 1; part <= 7; part++) {
    const bucket = filteredData[part];
    if (!bucket) continue;

    const groups = [
      { list: bucket.lessons, type: "lesson" },
      { list: bucket.dictations, type: "dictation" },
      { list: bucket.shadowings, type: "shadowing" },
      { list: bucket.quizzes, type: "quiz" },
      { list: bucket.vocab, type: "vocab" },
    ];
    
    for (const grp of groups) {
      for (const item of grp.list || []) {
        const doc = formatItemToChromaDoc(item, part, grp.type);
        items.push(doc);
      }
    }
  }

  if (items.length === 0) {
    console.log("⚠ No items to ingest.");
    return;
  }

  console.log(`📥 Total items to upsert: ${items.length}`);

  // ---- FIX: BATCH UPLOAD ----
  // reduce batch size to avoid huge embedding payloads; add fallback splitting on failure
  const batchSize = 30;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🚀 Upserting batch ${i / batchSize + 1} (${batch.length} items)`
    );

    try {
      await collection.upsert({
        ids: batch.map((x) => x.id),
        documents: batch.map((x) => x.document),
        metadatas: batch.map((x) => x.metadata),
      });
    } catch (err: any) {
      console.warn(
        `⚠ Batch upsert failed: ${err?.message || err}. Attempting smaller sub-batches...`
      );

      const smallSize = 5;
      for (let j = 0; j < batch.length; j += smallSize) {
        const sub = batch.slice(j, j + smallSize);
        try {
          await collection.upsert({
            ids: sub.map((x) => x.id),
            documents: sub.map((x) => x.document),
            metadatas: sub.map((x) => x.metadata),
          });
          console.log(
            `  ✔ Sub-batch ${j / smallSize + 1} (${sub.length} items) upserted`
          );
        } catch (err2: any) {
          console.error(`  ❌ Sub-batch failed: ${err2?.message || err2}`);
          // wait briefly before continuing
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }

  console.log("✔ All learning items ingested successfully.");
}
