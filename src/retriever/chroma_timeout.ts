const DEFAULT_CHROMA_TIMEOUT_MS = Number(process.env.CHROMA_TIMEOUT_MS ?? 1500);

export function withChromaTimeout<T>(
  operation: Promise<T>,
  label: string,
  timeoutMs = DEFAULT_CHROMA_TIMEOUT_MS
): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
        reject(new Error(`CHROMA_TIMEOUT:${label}`));
    }, timeoutMs);
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}
