import { initChroma } from "../initChroma";

let userProgressCollection: any = null;

export async function getUserProgressCollection() {
  if (userProgressCollection) return userProgressCollection;

  const { chromaClient, embedder } = await initChroma();

  userProgressCollection = await chromaClient.getOrCreateCollection({
    name: "user_progress_vectors",
    embeddingFunction: embedder,
  });

  console.log("📈 user_progress_vectors collection ready");

  return userProgressCollection;
}

export async function resetUserProgressCollection() {
  userProgressCollection = null;
}
