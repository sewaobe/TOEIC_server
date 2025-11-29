import { initChroma } from "../initChroma";

let learningCollection: any = null;

export async function getLearningItemCollection() {
    if (learningCollection) return learningCollection;

    const { chromaClient, embedder } = await initChroma();

    learningCollection = await chromaClient.getOrCreateCollection({
        name: "learning_items",
        embeddingFunction: embedder
    });

    console.log("📚 learning_items collection ready");

    return learningCollection;
}
