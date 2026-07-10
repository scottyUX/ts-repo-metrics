/**
 * In-memory AI usage CSV cache when Supabase is not configured (local dev only).
 * Keys include userId so uploads for the same repo do not overwrite other users.
 * Keeps every uploaded version per key, mirroring the Supabase ai_usage_csvs
 * table; reads return the most recent upload.
 */

const MAX_ENTRIES = 50;
const store = new Map<string, string[]>();

function devAiUsageKey(userId: string, resultId: string): string {
  return `${userId}:${resultId.trim()}`;
}

export function devStoreAiUsageCsv(
  userId: string,
  resultId: string,
  csvText: string,
): void {
  const key = devAiUsageKey(userId, resultId);
  if (!store.has(key) && store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  const versions = store.get(key) ?? [];
  versions.push(csvText);
  store.set(key, versions);
}

export function devGetAiUsageCsv(
  userId: string,
  resultId: string,
): string | null {
  const versions = store.get(devAiUsageKey(userId, resultId));
  return versions?.length ? versions[versions.length - 1]! : null;
}
