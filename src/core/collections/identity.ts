import { initChroma } from "../initChroma";

let userProfileCollection: any = null;

export async function getUserProfileCollection() {
  if (userProfileCollection) return userProfileCollection;

  const { chromaClient, embedder } = await initChroma();

  userProfileCollection = await chromaClient.getOrCreateCollection({
    name: "user_profiles",
    embeddingFunction: embedder,
  });

  console.log("👤 user_profiles collection ready");

  return userProfileCollection;
}

export async function resetUserProfileCollection() {
  userProfileCollection = null;
}
