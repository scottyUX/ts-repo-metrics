import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYSIS_ROW_MAX_RETRIES,
  ANALYSIS_ROW_RETRY_DELAY_MS,
  MIN_PARTIAL_RESULT_ID_LENGTH,
  resolveAnalysisRow,
} from "../lib/resolveAnalysisRow";

function makeSupabaseMock(handlers: {
  exact?: { data: { result_id: string } | null; error?: unknown };
  prefix?: { data: { result_id: string } | null; error?: unknown };
}) {
  const eq = vi.fn(() => ({
    maybeSingle: vi.fn(async () => handlers.exact ?? { data: null, error: null }),
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
  return { from, eq, like, select };
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
      exact: { data: { result_id: "owner-repo-abc123456789" } },
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

  it("falls back to prefix match when exact match fails", async () => {
    const prefixId = "owner-repo-abc123456789";
    const shortPrefix = prefixId.slice(0, MIN_PARTIAL_RESULT_ID_LENGTH);

    const sb = makeSupabaseMock({
      exact: { data: null, error: null },
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
      exact: { data: null, error: null },
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
      exact: { data: null, error: null },
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
