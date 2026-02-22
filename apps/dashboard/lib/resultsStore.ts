/**
 * In-memory store for analysis results keyed by resultId.
 * Used until proper persistence (Story 1.3).
 */

export const resultsStore = new Map<string, unknown>();
