import { ChromaClient } from "chromadb";
import { HuggingfaceServerEmbeddingFunction } from "@chroma-core/huggingface-server";
import { chunkText } from "./chunker";
import { Question } from "../models";

/**
 * Ingest dữ liệu câu hỏi TOEIC vào Chroma với batching & concurrency
 */
export async function ingestQuestion() {
    const client = new ChromaClient({
        host: "localhost",
        port: 8000,
        ssl: false,
    });

    const embedder = new HuggingfaceServerEmbeddingFunction({
        url: "http://localhost:8080/embed",
    });

    const collection = await client.getOrCreateCollection({
        name: "toeic_questions",
        embeddingFunction: embedder,
    });

    const questions = await Question.find({});
    console.log(`📘 Tổng số câu hỏi cần ingest: ${questions.length}`);

    let totalChunks = 0;
    const BATCH_SIZE = 32; // số chunk mỗi batch
    const CONCURRENCY = 4; // số batch chạy song song (tùy CPU bạn)

    // Tạo mảng chứa tất cả các chunk trước khi gửi
    const allChunks: {
        ids: string[];
        docs: string[];
        metas: any[];
    }[] = [];

    for (const q of questions) {
        const baseText = `
            Tên: ${q.name}
            Câu hỏi: ${q.textQuestion}
            Lựa chọn: ${JSON.stringify(Object.fromEntries(q.choices))}
            Đáp án đúng: ${q.correctAnswer}
            Giải thích: ${q.explanation}
            Tags: ${q.tags.join(", ")}
        `;

        const chunks = chunkText(baseText);
        totalChunks += chunks.length;

        const ids = chunks.map((_, i) => `${q._id}_${i}`);
        const docs = chunks;
        const metas = chunks.map(() => ({
            questionId: q._id.toString(),
            tags: q.tags.join(", "),
        }));

        allChunks.push({ ids, docs, metas });
    }

    console.log(`🧩 Tổng số đoạn text sẽ ingest: ${totalChunks}`);

    // Flatten toàn bộ chunk thành 1 mảng lớn
    const flatIds: string[] = [];
    const flatDocs: string[] = [];
    const flatMetas: any[] = [];

    allChunks.forEach((group) => {
        flatIds.push(...group.ids);
        flatDocs.push(...group.docs);
        flatMetas.push(...group.metas);
    });

    // Hàm chia batch
    const splitIntoBatches = <T>(arr: T[], size: number): T[][] => {
        const batches: T[][] = [];
        for (let i = 0; i < arr.length; i += size) {
            batches.push(arr.slice(i, i + size));
        }
        return batches;
    };

    // Chia batch
    const idBatches = splitIntoBatches(flatIds, BATCH_SIZE);
    const docBatches = splitIntoBatches(flatDocs, BATCH_SIZE);
    const metaBatches = splitIntoBatches(flatMetas, BATCH_SIZE);

    console.log(`⚙️ Tổng số batch cần ingest: ${idBatches.length}`);

    // Chạy batch song song theo giới hạn CONCURRENCY
    const runWithConcurrency = async () => {
        let completed = 0;
        const running: Promise<any>[] = [];

        for (let i = 0; i < idBatches.length; i++) {
            const promise = collection
                .add({
                    ids: idBatches[i],
                    documents: docBatches[i],
                    metadatas: metaBatches[i],
                })
                .then(() => {
                    completed++;
                    console.log(`✅ Batch ${completed}/${idBatches.length} hoàn tất`);
                })
                .catch((err) => {
                    console.error(`❌ Lỗi ở batch ${i + 1}:`, err.message);
                });

            running.push(promise);

            // Giới hạn concurrency
            if (running.length >= CONCURRENCY) {
                await Promise.race(running);
                running.splice(0, running.length - CONCURRENCY + 1);
            }
        }

        // Chờ toàn bộ batch còn lại hoàn tất
        await Promise.all(running);
    };

    const start = Date.now();
    await runWithConcurrency();
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    console.log(`🎯 Hoàn tất ingest ${totalChunks} đoạn trong ${elapsed}s.`);
}
