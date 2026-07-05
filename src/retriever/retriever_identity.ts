import { getUserProfileCollection } from "../core/collections/identity";
import { withChromaTimeout } from "./chroma_timeout";

/**
 * Retrieve user profile summary from Chroma by user id.
 * Returns documents and metadatas for the user profile.
 * @param userId - The user's ID for filtering
 * @param queryText - The user's question text for semantic search
 * @param k - Number of results to return
 */
export async function retrieveIdentity(userId: string, queryText?: string, k = 1) {
  try {
    const collection = await withChromaTimeout(
      getUserProfileCollection(),
      "user_profiles.collection"
    );

    // If queryText provided, use semantic search with metadata filter
    if (queryText) {
      const res = await withChromaTimeout<any>(
        collection.query({
          queryTexts: [queryText],
          nResults: k,
          where: { user_id: userId },
          include: ["documents", "metadatas"],
        }),
        "user_profiles.query"
      );

      const docs = res.documents?.[0] || [];
      const metadatas = res.metadatas?.[0] || [];

      return { documents: docs, metadatas: metadatas };
    }
    
    // Fallback: just fetch by metadata if no query text
    const res = await withChromaTimeout<any>(
      collection.get({
        where: { user_id: userId },
        include: ["documents", "metadatas"],
      }),
      "user_profiles.get"
    );

    const docs = res.documents?.flat() || [];
    const metadatas = res.metadatas?.flat() || [];

    return {
      documents: docs.slice(0, k),
      metadatas: metadatas.slice(0, k),
    };
  } catch (err) {
    console.error("🔍 Error retrieving identity:", err);
    return { documents: [], metadatas: [] };
  }
}
