import path from "path";
import dotenv from "dotenv";
import { initChroma } from "../core/initChroma";
import {
  CHAT_INTENT_COLLECTION,
  CHAT_INTENT_CATALOG_VERSION,
  CHAT_INTENT_EXAMPLES,
  getChatIntentCatalogStats,
  validateIntentCatalog,
} from "../services/chat_intent_examples.data";
import { resetChatIntentCollectionCache } from "../core/collections/chat_intent";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function metadataList(values?: string[]) {
  return (values ?? []).join(",");
}

function buildIntentProfileDocument(intent: (typeof CHAT_INTENT_EXAMPLES)[number]) {
  const triggerExamples = intent.examples.slice(0, 12).join(" | ");
  const boundaryExamples = intent.hardNegatives.slice(0, 8).join(" | ");
  return [
    `intent profile ${intent.intentId}`,
    `entity ${metadataList(intent.entities)}`,
    `actions ${metadataList(intent.actions)}`,
    `default action ${intent.defaultAction ?? ""}`,
    `context ${intent.contextType}`,
    `positive triggers ${triggerExamples}`,
    `not this intent when ${boundaryExamples}`,
  ].join("\n");
}

function baseMetadata(intent: (typeof CHAT_INTENT_EXAMPLES)[number]) {
  return {
    catalogVersion: CHAT_INTENT_CATALOG_VERSION,
    intentId: intent.intentId,
    lane: intent.lane,
    engine: intent.engine,
    availability: intent.availability,
    contextType: intent.contextType,
    priority: intent.priority,
    entities: metadataList(intent.entities),
    actions: metadataList(intent.actions),
    defaultAction: intent.defaultAction ?? "",
    forbiddenActions: metadataList(intent.forbiddenActions),
    source: `intent_catalog_v${CHAT_INTENT_CATALOG_VERSION}`,
  };
}

function buildIntentRows() {
  const catalog = validateIntentCatalog();
  return catalog
    .filter(
      (intent) =>
        intent.semanticSearchEnabled && intent.availability !== "DISABLED"
    )
    .flatMap((intent) => [
      {
        id: `${intent.id}_profile`,
        document: buildIntentProfileDocument(intent),
        metadata: {
          ...baseMetadata(intent),
          exampleType: "intent_profile",
          polarity: "profile",
          sourceIntent: intent.intentId,
          type: "intent_profile",
        },
      },
      ...intent.examples.map((example, index) => ({
        id: `${intent.id}_positive_${index + 1}`,
        document: example,
        metadata: {
          ...baseMetadata(intent),
          exampleType: "positive_example",
          polarity: "positive",
          sourceIntent: intent.intentId,
          type: "positive_example",
        },
      })),
      ...intent.hardNegatives.map((example, index) => ({
        id: `${intent.id}_negative_${index + 1}`,
        document: example,
        metadata: {
          ...baseMetadata(intent),
          exampleType: "boundary_negative",
          polarity: "negative",
          sourceIntent: intent.intentId,
          type: "boundary_negative",
        },
      })),
    ]);
}

async function run() {
  validateIntentCatalog(CHAT_INTENT_EXAMPLES);
  const rows = buildIntentRows();
  const stats = getChatIntentCatalogStats();
  const { chromaClient, embedder } = await initChroma();

  try {
    await chromaClient.deleteCollection({ name: CHAT_INTENT_COLLECTION });
    console.log(`Deleted existing collection: ${CHAT_INTENT_COLLECTION}`);
  } catch (err: any) {
    console.warn(
      `Could not delete ${CHAT_INTENT_COLLECTION}; continuing:`,
      err?.message ?? err
    );
  }

  await resetChatIntentCollectionCache();

  const collection = await chromaClient.getOrCreateCollection({
    name: CHAT_INTENT_COLLECTION,
    embeddingFunction: embedder,
  });

  const batchSize = 32;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await collection.upsert({
      ids: batch.map((row) => row.id),
      documents: batch.map((row) => row.document),
      metadatas: batch.map((row) => row.metadata),
    });
    console.log(`Upserted chat intent batch ${i / batchSize + 1}`);
  }

  const count = await collection.count();
  console.log(
    JSON.stringify(
      {
        collection: CHAT_INTENT_COLLECTION,
        catalogVersion: stats.catalogVersion,
        collectionVersion: stats.catalogVersion,
        seededAt: new Date().toISOString(),
        seedDocumentCount: count,
        searchableIntentCount: stats.searchableIntentCount,
        searchableExampleCount: stats.searchableExampleCount,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default run;
