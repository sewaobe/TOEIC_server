import * as fs from "fs";
import * as path from "path";

type DebugPayload = Record<string, unknown>;

const LOG_SERVICE = "learning_path_v2";
const DEFAULT_LOG_PATH = path.join("logs", "learning_path_v2_debug.log");
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;

const isDebugEnabled = (): boolean =>
  process.env.LEARNING_PATH_V2_DEBUG_LOG === "true";

const getLogPath = (): string => {
  const configuredPath = process.env.LEARNING_PATH_V2_DEBUG_LOG_PATH;
  return configuredPath && configuredPath.trim()
    ? configuredPath
    : path.join(process.cwd(), DEFAULT_LOG_PATH);
};

const looksLikeObjectId = (value: unknown): boolean =>
  Boolean(
    value &&
      typeof value === "object" &&
      ("_bsontype" in value || value.constructor?.name === "ObjectId")
  );

const normalizeLogValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (looksLikeObjectId(value)) return String(value);
  if (depth >= MAX_DEPTH) return "[MaxDepth]";

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => normalizeLogValue(item, depth + 1));

    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[Truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
    }

    return items;
  }

  if (typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalizedItem = normalizeLogValue(item, depth + 1);
      if (normalizedItem !== undefined) normalized[key] = normalizedItem;
    }
    return normalized;
  }

  return String(value);
};

const normalizeContextId = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const normalized = normalizeLogValue(value);
  return normalized === undefined ? undefined : String(normalized);
};

export const logLearningPathV2Debug = async (
  event: string,
  payload: DebugPayload = {}
): Promise<void> => {
  if (!isDebugEnabled()) return;

  try {
    const {
      stage,
      user_id,
      learning_path_id,
      trigger_type,
      ...payloadData
    } = payload;

    const logRecord = {
      ts: new Date().toISOString(),
      service: LOG_SERVICE,
      event,
      stage: stage ? String(stage) : undefined,
      user_id: normalizeContextId(user_id),
      learning_path_id: normalizeContextId(learning_path_id),
      trigger_type: trigger_type ? String(trigger_type) : undefined,
      payload: normalizeLogValue(payloadData),
    };

    const logPath = getLogPath();
    await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
    await fs.promises.appendFile(
      logPath,
      `${JSON.stringify(logRecord)}\n`,
      "utf8"
    );
  } catch {
    // Debug logging must never affect the LearningPath v2 execution flow.
  }
};

export const logLearningPathV2DebugSafe = (
  event: string,
  payload: DebugPayload = {}
): void => {
  void logLearningPathV2Debug(event, payload);
};
