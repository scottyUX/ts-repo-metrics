import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_ROW_MAX_RETRIES,
  ANALYSIS_ROW_RETRY_DELAY_MS,
  MIN_PARTIAL_RESULT_ID_LENGTH,
  resolveAnalysisRow,
} from "../lib/resolveAnalysisRow";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeSupabaseMock(handlers: {
  exact?: Record<string, { data: { result_id: string } | null; error?: unknown }>;
  prefix?: { data: { result_id: string } | null; error?: unknown };
  userId?: string | null;
}) {
  const eq = vi.fn((column: string, value: string) => ({
    maybeSingle: vi.fn(async () => {
      if (column !== "result_id") {
        return { data: null, error: null };
      }
      return handlers.exact?.[value] ?? { data: null, error: null };
    }),
  }));
  const like = vi.fn(() => ({
    order: vi.fn(() => ({
      limit: vi.fn(() => ({
        maybeSingle: vi.fn(
          async () => handlers.prefix ?? { data: null, error: null },
        ),
      })),
    })),
  }));
  const select = vi.fn(() => ({ eq, like }));
  const from = vi.fn(() => ({ select }));
  const auth = {
    getUser: vi.fn(async () => ({
      data: {
        user: handlers.userId ? { id: handlers.userId } : null,
      },
    })),
  };
  return { from, eq, like, select, auth };
}

describe("resolveAnalysisRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns exact match on first attempt", async () => {
    const sb = makeSupabaseMock({
      exact: {
        "owner-repo-abc123456789": {
          data: { result_id: "owner-repo-abc123456789" },
        },
      },
    });

    const result = await resolveAnalysisRow(
      "owner-repo-abc123456789",
      sb as never,
    );

    expect(result).toEqual({
      ok: true,
      resultId: "owner-repo-abc123456789",
    });
    expect(sb.eq).toHaveBeenCalledWith("result_id", "owner-repo-abc123456789");
    expect(sb.like).not.toHaveBeenCalled();
  });

  it("falls back to user-scoped id for legacy urls", async () => {
    const legacyId = "owner-repo-abc123456789";
    const scopedId = `${USER_ID}-${legacyId}`;
    const sb = makeSupabaseMock({
      userId: USER_ID,
      exact: {
        [legacyId]: { data: null, error: null },
        [scopedId]: { data: { result_id: scopedId } },
      },
    });

    const result = await resolveAnalysisRow(legacyId, sb as never);

    expect(result).toEqual({ ok: true, resultId: scopedId });
    expect(sb.eq).toHaveBeenCalledWith("result_id", legacyId);
    expect(sb.eq).toHaveBeenCalledWith("result_id", scopedId);
  });

  it("prefers user-scoped id when both legacy and scoped rows exist", async () => {
    const legacyId = "owner-repo-abc123456789";
    const scopedId = `${USER_ID}-${legacyId}`;
    const sb = makeSupabaseMock({
      userId: USER_ID,
      exact: {
        [scopedId]: { data: { result_id: scopedId } },
        [legacyId]: { data: { result_id: legacyId } },
      },
    });

    const result = await resolveAnalysisRow(legacyId, sb as never, {
      preferUserScope: true,
    });

    expect(result).toEqual({ ok: true, resultId: scopedId });
    expect(sb.eq).toHaveBeenCalledWith("result_id", scopedId);
    expect(sb.eq).not.toHaveBeenCalledWith("result_id", legacyId);
  });

  it("falls back to prefix match when exact match fails", async () => {
    const prefixId = "owner-repo-abc123456789";
    const shortPrefix = prefixId.slice(0, MIN_PARTIAL_RESULT_ID_LENGTH);

    const sb = makeSupabaseMock({
      exact: {
        [prefixId]: { data: null, error: null },
        [`${USER_ID}-${prefixId}`]: { data: null, error: null },
      },
      prefix: { data: { result_id: prefixId } },
    });

    const promise = resolveAnalysisRow(shortPrefix, sb as never);

    for (let i = 0; i < ANALYSIS_ROW_MAX_RETRIES - 1; i++) {
      await vi.advanceTimersByTimeAsync(ANALYSIS_ROW_RETRY_DELAY_MS * (i + 1));
    }
    const result = await promise;

    expect(result).toEqual({ ok: true, resultId: prefixId });
    expect(sb.like).toHaveBeenCalledWith("result_id", `${shortPrefix}%`);
  });

  it("skips prefix match for short ids", async () => {
    const sb = makeSupabaseMock({
      exact: {
        "short-id": { data: null, error: null },
        [`${USER_ID}-short-id`]: { data: null, error: null },
      },
    });

    const promise = resolveAnalysisRow("short-id", sb as never);
    for (let i = 0; i < ANALYSIS_ROW_MAX_RETRIES; i++) {
      await vi.advanceTimersByTimeAsync(ANALYSIS_ROW_RETRY_DELAY_MS * (i + 1));
    }
    const result = await promise;

    expect(result).toEqual({ ok: false, code: "not_found" });
    expect(sb.like).not.toHaveBeenCalled();
  });

  it("returns not_found when no row matches", async () => {
    const sb = makeSupabaseMock({
      exact: {
        "owner-repo-abc123456789": { data: null, error: null },
        [`${USER_ID}-owner-repo-abc123456789`]: { data: null, error: null },
      },
      prefix: { data: null, error: null },
    });

    const longId = "owner-repo-abc123456789";
    const promise = resolveAnalysisRow(longId, sb as never);
    for (let i = 0; i < ANALYSIS_ROW_MAX_RETRIES; i++) {
      await vi.advanceTimersByTimeAsync(ANALYSIS_ROW_RETRY_DELAY_MS * (i + 1));
    }
    const result = await promise;

    expect(result).toEqual({ ok: false, code: "not_found" });
  });

  it("returns not_found for empty id", async () => {
    const sb = makeSupabaseMock({});
    const result = await resolveAnalysisRow("  ", sb as never);
    expect(result).toEqual({ ok: false, code: "not_found" });
    expect(sb.from).not.toHaveBeenCalled();
  });
});
