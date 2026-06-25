import { initChroma } from "../initChroma";
import { CHAT_INTENT_COLLECTION } from "../../services/chat_intent_examples.data";

let chatIntentCollection: any = null;

export async function getChatIntentCollection() {
  if (chatIntentCollection) return chatIntentCollection;

  const { chromaClient, embedder } = await initChroma();
  chatIntentCollection = await chromaClient.getOrCreateCollection({
    name: CHAT_INTENT_COLLECTION,
    embeddingFunction: embedder,
  });

  console.log("Chat intent collection ready");
  return chatIntentCollection;
}

export async function resetChatIntentCollectionCache() {
  chatIntentCollection = null;
}
