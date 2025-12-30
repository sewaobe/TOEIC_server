import { getTestItemCollection } from "../core/collections/test";

function formatTestToChromaDoc(test: any) {
  const textBlocks: string[] = [];

  textBlocks.push(`ITEM_TYPE: test`);

  if (test.title) textBlocks.push(`TITLE: ${test.title}`);
  if (test.description) textBlocks.push(`DESCRIPTION: ${test.description}`);
  if (test.summary) textBlocks.push(`SUMMARY: ${test.summary}`);
  if (test.tags && test.tags.length > 0)
    textBlocks.push(`TAGS: ${test.tags.join(", ")}`);

  // Include groups info
  if (test.groups && test.groups.length > 0) {
    const groupTitles = test.groups
      .slice(0, 10)
      .map((g: any) => g.title || g.name || "")
      .filter(Boolean)
      .join(" | ");
    textBlocks.push(`GROUPS(${test.groups.length}): ${groupTitles}`);
  }

  const rawDoc = textBlocks.join("\n");
  const MAX_DOC_LENGTH = 1000;
  const document =
    rawDoc.length > MAX_DOC_LENGTH
      ? rawDoc.slice(0, MAX_DOC_LENGTH) + "\n[TRUNCATED]"
      : rawDoc;

  return {
    id: `test_${test._id}`,
    document,
    metadata: {
      item_type: "test",
      item_id: test._id.toString(),
      title: test.title || "",
      level: test.level || "",
      weight: test.weight || 0.5,
      status: test.status || "",
      total_questions: test.totalQuestions || 0,
      duration: test.duration || 0,
    },
  };
}

export async function ingestTests(tests: any[]) {
  const collection = await getTestItemCollection();

  if (!tests || tests.length === 0) {
    console.log("⚠ No tests to ingest.");
    return;
  }

  const items = tests.map((test) => formatTestToChromaDoc(test));

  console.log(`📝 Total tests to upsert: ${items.length}`);

  // Batch upload
  const batchSize = 30;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    console.log(
      `🚀 Upserting test batch ${Math.floor(i / batchSize) + 1} (${
        batch.length
      } items)`
    );

    try {
      await collection.upsert({
        ids: batch.map((x) => x.id),
        documents: batch.map((x) => x.document),
        metadatas: batch.map((x) => x.metadata),
      });
    } catch (err: any) {
      console.warn(
        `⚠ Batch upsert failed: ${
          err?.message || err
        }. Attempting smaller sub-batches...`
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
          console.log(`  ✔ Sub-batch ${Math.floor(j / smallSize) + 1} success`);
        } catch (subErr: any) {
          console.error(`  ✖ Sub-batch failed: ${subErr?.message || subErr}`);
        }
      }
    }
  }

  console.log("✅ Test ingest complete");
}
