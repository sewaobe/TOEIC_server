import {
  getChatIntentCollection,
  resetChatIntentCollectionCache,
} from "../core/collections/chat_intent";
import {
  ChatIntent,
  ChatClientContext,
  ChatRouteContext,
  IntentCandidate,
  IntentLane,
} from "../types/chat.types";
import {
  getIntentCatalogEntry,
  IntentCatalogEntry,
} from "./chat_intent_examples.data";
import { extractIntentSignal } from "./chat_intent_signal.service";

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

function parseMetadataList(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function metadataExampleType(metadata: Record<string, unknown>) {
  return String(metadata.exampleType ?? metadata.type ?? "positive_example");
}

function sourceIntentFromMetadata(metadata: Record<string, unknown>) {
  return String(metadata.sourceIntent ?? metadata.intentId ?? "") as ChatIntent;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

  if (process.env.CHAT_INTENT_FORCE_CHROMA_ERROR === "1") {
    return {
      retrievalHits: [],
      candidates: [],
      source: "fallback",
      queryCount: 1,
      semanticDegraded: true,
      degradedReason: "QUERY_ERROR",
      errorCode: "FORCED_CHROMA_ERROR",
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

    type EvidenceHit = {
      document: string;
      distance: number;
      score: number;
      exampleType: string;
    };
    const byIntent = new Map<
      string,
      {
        entry: IntentCatalogEntry;
        positiveHits: EvidenceHit[];
        profileHits: EvidenceHit[];
        negativeHits: EvidenceHit[];
      }
    >();

    function ensureIntentEvidence(entry: IntentCatalogEntry) {
      const current = byIntent.get(entry.intentId);
      if (current) return current;
      const next = {
        entry,
        positiveHits: [] as EvidenceHit[],
        profileHits: [] as EvidenceHit[],
        negativeHits: [] as EvidenceHit[],
      };
      byIntent.set(entry.intentId, next);
      return next;
    }

    for (let index = 0; index < documents.length; index += 1) {
      const metadata = (metadatas[index] ?? {}) as Record<string, unknown>;
      const exampleType = metadataExampleType(metadata);
      const sourceIntent = sourceIntentFromMetadata(metadata);
      const entry =
        exampleType === "boundary_negative"
          ? getIntentCatalogEntry(sourceIntent)
          : resolveCatalogEntry(metadata);
      if (!entry) continue;

      const distance = Number(distances[index] ?? Number.POSITIVE_INFINITY);
      if (!Number.isFinite(distance)) continue;
      const hit = {
        document: String(documents[index] ?? ""),
        distance,
        score: distanceToScore(distance),
        exampleType,
      };
      const evidence = ensureIntentEvidence(entry);
      if (exampleType === "boundary_negative") {
        evidence.negativeHits.push(hit);
      } else if (exampleType === "intent_profile") {
        evidence.profileHits.push(hit);
      } else {
        evidence.positiveHits.push(hit);
      }
    }

    const signal = extractIntentSignal(userText, params.routeContext);
    if (signal.intentHint) {
      const hintedEntry = getIntentCatalogEntry(signal.intentHint);
      if (
        hintedEntry &&
        hintedEntry.availability !== "DISABLED" &&
        hintedEntry.semanticSearchEnabled
      ) {
        ensureIntentEvidence(hintedEntry).profileHits.push({
          document: `signal hint ${signal.intentHint} entity ${signal.entity ?? ""} action ${signal.action}`,
          distance: 0.18,
          score: 0.96,
          exampleType: "signal_hint",
        });
      }
    }

    const ranked = Array.from(byIntent.values())
      .map((item) => {
        const positiveHits = [...item.positiveHits].sort((a, b) => b.score - a.score);
        const profileHits = [...item.profileHits].sort((a, b) => b.score - a.score);
        const negativeHits = [...item.negativeHits].sort((a, b) => b.score - a.score);
        const positiveScores = positiveHits.map((hit) => hit.score);
        const profileScores = profileHits.map((hit) => hit.score);
        const negativeScores = negativeHits.map((hit) => hit.score);
        const bestPositive = positiveScores[0] ?? 0;
        const avgTop3Positive = average(positiveScores.slice(0, 3));
        const bestProfile = profileScores[0] ?? 0;
        const hasSignalHint = profileHits.some((hit) => hit.exampleType === "signal_hint");
        const negativeEvidenceScore = Math.min(
          negativeScores.slice(0, 3).reduce((sum, score) => sum + score, 0) * 0.55,
          1.25
        );
        const supportScore = Math.min(positiveHits.length, 5) * 0.035;
        const priorityScore = item.entry.priority / 2000;
        const profileScore = bestProfile * 0.45;
        const positiveScore = bestPositive * 1.45 + avgTop3Positive * 0.75;
        const signalHintScore = hasSignalHint ? 2.4 : 0;
        const score =
          positiveScore +
          profileScore +
          supportScore +
          priorityScore -
          negativeEvidenceScore +
          signalHintScore;
        const bestDistance = positiveHits[0]?.distance ?? profileHits[0]?.distance;
        return {
          ...item,
          score,
          bestDistance,
          evidenceBreakdown: {
            positiveScore,
            profileScore,
            negativeEvidenceScore,
            signalHintScore,
            supportScore,
            priorityScore,
            finalScore: score,
            bestPositiveDistance: positiveHits[0]?.distance,
            bestProfileDistance: profileHits[0]?.distance,
          },
          positiveHits,
          profileHits,
          negativeHits,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    const candidates = ranked.map<IntentCandidate>((item, index) => {
      const nextScore = ranked[index + 1]?.score ?? 0;
      return {
        intentId: item.entry.intentId,
        lane: item.entry.lane as IntentLane,
        confidence:
          item.score > 0 ? item.score / (item.score + Math.max(nextScore, 0.001)) : 0,
        score: item.score,
        distance: item.bestDistance,
        matchedExamples: item.positiveHits.slice(0, 3).map((hit) => hit.document),
        matchedProfileExamples: item.profileHits.slice(0, 2).map((hit) => hit.document),
        negativeMatchedExamples: item.negativeHits.slice(0, 3).map((hit) => hit.document),
        supportCount: item.positiveHits.length,
        entities: item.entry.entities,
        actions: item.entry.actions,
        defaultAction: item.entry.defaultAction,
        forbiddenActions: item.entry.forbiddenActions,
        evidenceBreakdown: item.evidenceBreakdown,
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
