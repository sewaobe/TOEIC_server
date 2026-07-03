import { initChroma } from "../initChroma";
import {
  CHAT_INTENT_COLLECTION,
  getChatIntentCatalogStats,
} from "../../services/chat_intent_examples.data";

let chatIntentCollection: any = null;

export async function getChatIntentCollection() {
  if (chatIntentCollection) return chatIntentCollection;

  const { chromaClient, embedder } = await initChroma();
  chatIntentCollection = await chromaClient.getOrCreateCollection({
    name: CHAT_INTENT_COLLECTION,
    embeddingFunction: embedder,
  });

  try {
    const count = await chatIntentCollection.count();
    const stats = getChatIntentCatalogStats();
    console.log("Chat intent collection ready", {
      catalogVersion: stats.catalogVersion,
      collectionVersion: stats.catalogVersion,
      searchableIntentCount: stats.searchableIntentCount,
      searchableExampleCount: stats.searchableExampleCount,
      collectionCount: count,
    });
  } catch (err) {
    console.warn("Chat intent collection ready but count failed:", err);
  }
  return chatIntentCollection;
}

export async function resetChatIntentCollectionCache() {
  chatIntentCollection = null;
}
