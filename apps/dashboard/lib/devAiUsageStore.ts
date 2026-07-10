/**
 * In-memory AI usage CSV cache when Supabase is not configured (local dev only).
 * Keys include userId so uploads for the same repo do not overwrite other users.
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
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(devAiUsageKey(userId, resultId), csvText);
}

export function devGetAiUsageCsv(
  userId: string,
  resultId: string,
): string | null {
  return store.get(devAiUsageKey(userId, resultId)) ?? null;
}
