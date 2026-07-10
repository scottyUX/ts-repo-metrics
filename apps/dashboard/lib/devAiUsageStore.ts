/**
 * In-memory AI usage CSV cache when Supabase is not configured (local dev only).
 * Keeps every uploaded version per resultId, mirroring the Supabase
 * ai_usage_csvs table; reads return the most recent upload.
 */

const MAX_ENTRIES = 50;
const store = new Map<string, string[]>();

export function devStoreAiUsageCsv(resultId: string, csvText: string): void {
  const key = resultId.trim();
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  const versions = store.get(key) ?? [];
  versions.push(csvText);
  store.set(key, versions);
}

export function devGetAiUsageCsv(resultId: string): string | null {
  const versions = store.get(resultId.trim());
  return versions?.length ? versions[versions.length - 1] : null;
}
