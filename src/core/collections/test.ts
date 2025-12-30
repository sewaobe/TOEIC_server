import { initChroma } from "../initChroma";

let testCollection: any = null;

export async function getTestItemCollection() {
  if (testCollection) return testCollection;

  const { chromaClient, embedder } = await initChroma();

  testCollection = await chromaClient.getOrCreateCollection({
    name: "test_items",
    embeddingFunction: embedder,
  });

  console.log("📝 test_items collection ready");

  return testCollection;
}

export async function resetTestItemCollection() {
  testCollection = null;
}
