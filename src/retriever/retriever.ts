import { HuggingfaceServerEmbeddingFunction } from "@chroma-core/huggingface-server";
import { ChromaClient } from "chromadb";
import { withChromaTimeout } from "./chroma_timeout";

/**
 * Truy vấn context liên quan đến câu hỏi
 */
export async function retrieveContext(query: string, limit = 5) {
    const client = new ChromaClient({ host: "localhost", port: 8000, ssl: false });

    const embedder = new HuggingfaceServerEmbeddingFunction({
        url: "http://localhost:8080/embed",
    });

    const collection = await withChromaTimeout(
        client.getOrCreateCollection({
            name: "toeic_questions",
            embeddingFunction: embedder,
        }),
        "toeic_questions.collection"
    );

    const result = await withChromaTimeout(
        collection.query({
            queryTexts: [query],
            nResults: limit,
        }),
        "toeic_questions.query"
    );

    const docs = result.documents?.[0] || [];
    const metadatas = result.metadatas?.[0] || [];

    console.log("🔍 Semantic search:", query);
    console.log("📄 Found docs:", docs.length);

    return {
        type: "semantic",
        context: docs.join("\n"),
        metadatas,
    };
}

export async function getContextById(questionId: string) {
    const client = new ChromaClient({ host: "localhost", port: 8000, ssl: false });
    const embedder = new HuggingfaceServerEmbeddingFunction({
        url: "http://localhost:8080/embed",
    });
    const collection = await withChromaTimeout(
        client.getOrCreateCollection({
            name: "toeic_questions",
            embeddingFunction: embedder,
        }),
        "toeic_questions.collection"
    );

    const result = await withChromaTimeout(
        collection.get({
            where: { questionId },
            include: ["documents", "metadatas"],
        }),
        "toeic_questions.get"
    );

    const docs = result.documents?.flat() || [];

    console.log(`📎 Get context by ID: ${questionId} (${docs.length} đoạn)`);
    return {
        type: "by_id",
        context: docs.join("\n"),
        metadatas: result.metadatas?.flat() || [],
    };
}
