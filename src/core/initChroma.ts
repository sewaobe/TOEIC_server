import { ChromaClient } from "chromadb";
import { HuggingfaceServerEmbeddingFunction } from "@chroma-core/huggingface-server";

let chromaClient: ChromaClient | null = null;
let embedder: any = null;

export async function initChroma() {
    if (chromaClient && embedder) return { chromaClient, embedder };

    chromaClient = new ChromaClient({
        path: process.env.CHROMA_URL || "http://localhost:8000"
    });

    embedder = new HuggingfaceServerEmbeddingFunction({
        url: process.env.HF_EMBED_URL || "http://localhost:8080/embed"
    });

    console.log("🔥 Chroma client initialized");

    return { chromaClient, embedder };
}
