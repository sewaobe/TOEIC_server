import { getUserProgressCollection } from "../core/collections/progress";

/**
 * Retrieve user progress vector/documents by user id.
 * @param userId - The user's ID for filtering
 * @param queryText - The user's question text for semantic search
 * @param k - Number of results to return
 */
export async function retrieveProgress(userId: string, queryText?: string, k = 1) {
  const collection = await getUserProgressCollection();

  try {
    // If queryText provided, use semantic search with metadata filter
    if (queryText) {
      const res = await collection.query({
        queryTexts: [queryText],
        nResults: k,
        where: { user_id: userId },
        include: ["documents", "metadatas"],
      });

      const docs = res.documents?.[0] || [];
      const metadatas = res.metadatas?.[0] || [];

      return { documents: docs, metadatas: metadatas };
    }

    // Fallback: just fetch by metadata if no query text
    const res = await collection.get({
      where: { user_id: userId },
      include: ["documents", "metadatas"],
    });

    const docs = res.documents?.flat() || [];
    const metadatas = res.metadatas?.flat() || [];

    return { documents: docs.slice(0, k), metadatas: metadatas.slice(0, k) };
  } catch (err) {
    console.error("🔍 Error retrieving progress:", err);
    return { documents: [], metadatas: [] };
  }
}
