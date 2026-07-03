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

function buildIntentRows() {
  const catalog = validateIntentCatalog();
  return catalog
    .filter(
      (intent) =>
        intent.semanticSearchEnabled && intent.availability !== "DISABLED"
    )
    .flatMap((intent) =>
    intent.examples.map((example, index) => ({
      id: `${intent.id}_${index + 1}`,
      document: example,
      metadata: {
        catalogVersion: CHAT_INTENT_CATALOG_VERSION,
        intentId: intent.intentId,
        lane: intent.lane,
        engine: intent.engine,
        availability: intent.availability,
        contextType: intent.contextType,
        priority: intent.priority,
        type: "positive_example",
        source: `intent_catalog_v${CHAT_INTENT_CATALOG_VERSION}`,
      },
    }))
  );
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
