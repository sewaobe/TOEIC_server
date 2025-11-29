import { getLearningItemCollection } from "../core/collections/learning";

function formatItemToChromaDoc(item: any, part: number, type: string) {
    const textBlocks: string[] = [];

    textBlocks.push(`LEARNING_TYPE: ${type}`);
    textBlocks.push(`TOEIC_PART: ${part}`);
    textBlocks.push(`THIS_LESSON_BELONGS_TO_TOEIC_PART_${part}`);

    if (item.title) textBlocks.push(`TITLE: ${item.title}`);
    if (item.summary) textBlocks.push(`SUMMARY: ${item.summary}`);
    if (item.transcript) textBlocks.push(`TRANSCRIPT: ${item.transcript.substring(0, 2000)}`);
    if (item.tags) textBlocks.push(`TAGS: ${item.tags.join(", ")}`);

    return {
        id: `${type}_${part}_${item._id}`,
        document: textBlocks.join("\n"),
        metadata: {
            part_type: part,
            level: item.level,
            weight: item.weight,
            item_type: type,
            item_id: item._id.toString()
        }
    };
}


export async function ingestLearning(filteredData: Record<number, any>) {
    const collection = await getLearningItemCollection();

    const items: {
        id: string;
        document: string;
        metadata: any;
    }[] = [];

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
    const batchSize = 30;

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        console.log(`🚀 Upserting batch ${i / batchSize + 1} (${batch.length} items)`);

        await collection.upsert({
            ids: batch.map(x => x.id),
            documents: batch.map(x => x.document),
            metadatas: batch.map(x => x.metadata),
        });
    }

    console.log("✔ All learning items ingested successfully.");
}
