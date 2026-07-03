import {
  getChatIntentCollection,
  resetChatIntentCollectionCache,
} from "../core/collections/chat_intent";
import {
  ChatClientContext,
  ChatRouteContext,
  IntentCandidate,
  IntentLane,
} from "../types/chat.types";
import {
  getIntentCatalogEntry,
  IntentCatalogEntry,
} from "./chat_intent_examples.data";

export type SemanticRankingResult = {
  retrievalHits: Array<{
    document: string;
    intentId: string;
    lane: IntentLane;
    distance: number;
    score: number;
    metadata: Record<string, unknown>;
  }>;
  candidates: IntentCandidate[];
  source: "chroma" | "fallback";
  queryCount: number;
  semanticDegraded: boolean;
  degradedReason?: "EMPTY_QUERY" | "EMPTY_COLLECTION" | "QUERY_ERROR";
  errorCode?: string;
  retrievalTopK: number;
  rerankTopK: number;
};

function distanceToScore(distance: number) {
  return 1 / (1 + Math.max(distance, 0));
}

function resolveCatalogEntry(metadata: any): IntentCatalogEntry | undefined {
  const intentId = String(metadata?.intentId ?? "") as any;
  const entry = getIntentCatalogEntry(intentId);
  if (!entry || entry.availability === "DISABLED" || !entry.semanticSearchEnabled) {
    return undefined;
  }
  return entry;
}

export async function rankIntentCandidates(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
  retrievalTopK?: number;
  rerankTopK?: number;
}): Promise<SemanticRankingResult> {
  const userText = params.userText.trim();
  if (!userText) {
    return {
      retrievalHits: [],
      candidates: [],
      source: "fallback",
      queryCount: 0,
      semanticDegraded: true,
      degradedReason: "EMPTY_QUERY",
      errorCode: "EMPTY_QUERY",
      retrievalTopK: params.retrievalTopK ?? 40,
      rerankTopK: params.rerankTopK ?? 6,
    };
  }

  try {
    let collection = await getChatIntentCollection();
    let count = 0;
    try {
      count = await collection.count();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/ChromaNotFoundError|requested resource could not be found/i.test(message)) {
        console.warn("Chat intent collection cache is stale; recreating it ერთხელ.");
        await resetChatIntentCollectionCache();
        collection = await getChatIntentCollection();
        count = await collection.count();
      } else {
        throw err;
      }
    }
    if (!count) {
      return {
        retrievalHits: [],
        candidates: [],
        source: "fallback",
        queryCount: 1,
        semanticDegraded: true,
        degradedReason: "EMPTY_COLLECTION",
        errorCode: "EMPTY_COLLECTION",
        retrievalTopK: params.retrievalTopK ?? 40,
        rerankTopK: params.rerankTopK ?? 6,
      };
    }

    const result = await collection.query({
      queryTexts: [userText],
      nResults: params.retrievalTopK ?? 40,
      include: ["documents", "metadatas", "distances"],
    });

    const documents = result.documents?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];
    const retrievalHits = documents.map((document: unknown, index: number) => {
      const metadata = (metadatas[index] ?? {}) as Record<string, unknown>;
      const intentId = String(metadata.intentId ?? "unknown");
      const lane = (metadata.lane as IntentLane) ?? "CONTEXTUAL";
      const distance = Number(distances[index] ?? Number.POSITIVE_INFINITY);
      const score = distanceToScore(distance) + Number(metadata.priority ?? 0) / 1000;
      return {
        document: String(document ?? ""),
        intentId,
        lane,
        distance,
        score,
        metadata,
      };
    });

    const byIntent = new Map<
      string,
      {
        entry: IntentCatalogEntry;
        score: number;
        bestDistance: number;
        examples: string[];
        supportCount: number;
      }
    >();

    for (let index = 0; index < documents.length; index += 1) {
      const metadata = metadatas[index] ?? {};
      const entry = resolveCatalogEntry(metadata);
      if (!entry) continue;

      const distance = Number(distances[index] ?? Number.POSITIVE_INFINITY);
      if (!Number.isFinite(distance)) continue;

      const exampleScore =
        distanceToScore(distance) +
        entry.priority / 1000;
      const current = byIntent.get(entry.intentId);
      if (!current) {
        byIntent.set(entry.intentId, {
          entry,
          score: exampleScore,
          bestDistance: distance,
          examples: [String(documents[index] ?? "")],
          supportCount: 1,
        });
        continue;
      }

      current.score += exampleScore * 0.65;
      current.bestDistance = Math.min(current.bestDistance, distance);
      current.examples.push(String(documents[index] ?? ""));
      current.supportCount += 1;
    }

    const ranked = Array.from(byIntent.values()).sort((a, b) => b.score - a.score);
    const candidates = ranked.map<IntentCandidate>((item, index) => {
      const nextScore = ranked[index + 1]?.score ?? 0;
      return {
        intentId: item.entry.intentId,
        lane: item.entry.lane as IntentLane,
        confidence:
          item.score > 0 ? item.score / (item.score + Math.max(nextScore, 0.001)) : 0,
        score: item.score,
        distance: item.bestDistance,
        matchedExamples: item.examples.slice(0, 3),
        supportCount: item.supportCount,
      };
    }).slice(0, params.rerankTopK ?? 6);

    return {
      retrievalHits,
      candidates,
      source: "chroma",
      queryCount: 1,
      semanticDegraded: false,
      retrievalTopK: params.retrievalTopK ?? 40,
      rerankTopK: params.rerankTopK ?? 6,
    };
  } catch (err) {
    console.warn("Semantic intent ranking failed:", err);
    const errorCode = err instanceof Error ? err.name || "QUERY_ERROR" : "QUERY_ERROR";
    return {
      retrievalHits: [],
      candidates: [],
      source: "fallback",
      queryCount: 1,
      semanticDegraded: true,
      degradedReason: "QUERY_ERROR",
      errorCode,
      retrievalTopK: params.retrievalTopK ?? 40,
      rerankTopK: params.rerankTopK ?? 6,
    };
  }
}

// Compatibility helper for scripts while runtime routing uses rankIntentCandidates.
export async function classifyIntentSemantic(params: {
  userText: string;
  routeContext?: ChatRouteContext;
  clientContext?: ChatClientContext;
  limit?: number;
}) {
  const result = await rankIntentCandidates({
    userText: params.userText,
    routeContext: params.routeContext,
    clientContext: params.clientContext,
    retrievalTopK: params.limit,
  });
  const winner = result.candidates[0];
  return {
    intentId: winner?.intentId ?? "unknown",
    confidence: winner?.confidence ?? 0,
    distance: winner?.distance,
    matchedExamples: winner?.matchedExamples ?? [],
    source: result.source,
  };
}
