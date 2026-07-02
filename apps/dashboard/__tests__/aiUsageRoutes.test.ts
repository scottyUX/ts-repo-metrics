import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const resolveAnalysisRow = vi.fn();

// Table-aware Supabase mock — each call to from() returns a chainable object
// whose terminal promise resolves to whatever tableResults[table] holds.
const tableResults: Record<
  string,
  { data: unknown; error: unknown } | { error: unknown }
> = {};

function makeChain(table: string) {
  const terminal = () => Promise.resolve(tableResults[table] ?? { data: null, error: null });
  const eq = vi.fn(() => ({ maybeSingle: terminal, eq: vi.fn(() => ({ maybeSingle: terminal })) }));
  const select = vi.fn(() => ({ eq, maybeSingle: terminal }));
  const upsert = vi.fn(() => Promise.resolve(tableResults[table] ?? { error: null }));
  return { select, upsert, eq };
}

const fromFn = vi.fn((table: string) => makeChain(table));

vi.mock("@/lib/supabase/server", () => ({
  getSupabase: vi.fn(),
  isDevReportMemoryFallback: vi.fn(() => false),
  isSupabaseConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/server-user", () => ({
  createUserSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
    from: fromFn,
  })),
  isUserSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/analyzeConstants", () => ({
  ANALYZE_SIGN_IN_REQUIRED_MESSAGE: "Please sign in.",
}));

vi.mock("@/lib/resolveAnalysisRow", () => ({
  resolveAnalysisRow: (...args: unknown[]) => resolveAnalysisRow(...args),
}));

const CANONICAL_ID = "owner-repo-abc123456789";
const CSV =
  "timestamp,event_type,session_id,tool_name\n2026-05-20T10:00:00.000Z,user_prompt,s1,\n";

describe("ai usage routes — dev fallback mode", () => {
  beforeEach(async () => {
    vi.resetModules();
    getUser.mockReset();
    fromFn.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    const { isDevReportMemoryFallback, isSupabaseConfigured } = await import(
      "@/lib/supabase/server"
    );
    vi.mocked(isDevReportMemoryFallback).mockReturnValue(true);
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
  });

  it("stores and retrieves CSV via in-memory store", async () => {
    const { POST } = await import("../app/api/ai-usage/route");
    const { GET } = await import("../app/api/results/[id]/ai-usage/route");

    const postRes = await POST(
      new NextRequest("http://localhost/api/ai-usage", {
        method: "POST",
        body: JSON.stringify({ resultId: "owner-repo-abc", csvText: CSV }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(postRes.status).toBe(200);
    await expect(postRes.json()).resolves.toEqual({
      resultId: "owner-repo-abc",
      csvText: CSV,
    });

    const getRes = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: "owner-repo-abc" }) },
    );
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toEqual({
      resultId: "owner-repo-abc",
      csvText: CSV,
    });
  });

  it("rejects empty uploads", async () => {
    const { POST } = await import("../app/api/ai-usage/route");

    const res = await POST(
      new NextRequest("http://localhost/api/ai-usage", {
        method: "POST",
        body: JSON.stringify({ resultId: "owner-repo-abc", csvText: "   " }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("Missing csvText"),
    });
  });
});

describe("ai usage routes — Supabase mode", () => {
  beforeEach(async () => {
    vi.resetModules();
    getUser.mockReset();
    fromFn.mockClear();
    resolveAnalysisRow.mockReset();
    Object.keys(tableResults).forEach((k) => delete tableResults[k]);

    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    resolveAnalysisRow.mockResolvedValue({
      ok: true,
      resultId: CANONICAL_ID,
    });

    const { isDevReportMemoryFallback, isSupabaseConfigured } = await import(
      "@/lib/supabase/server"
    );
    vi.mocked(isDevReportMemoryFallback).mockReturnValue(false);
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  });

  it("upserts into ai_usage_csvs and returns canonical resultId", async () => {
    tableResults["ai_usage_csvs"] = { error: null };

    const { POST } = await import("../app/api/ai-usage/route");

    const res = await POST(
      new NextRequest("http://localhost/api/ai-usage", {
        method: "POST",
        body: JSON.stringify({
          resultId: "owner-repo-abc12345",
          csvText: CSV,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      resultId: CANONICAL_ID,
    });

    const tables = fromFn.mock.calls.map(([table]: [string]) => table);
    expect(tables).toContain("ai_usage_csvs");
    expect(resolveAnalysisRow).toHaveBeenCalled();
  });

  it("returns 404 when analysis does not exist", async () => {
    resolveAnalysisRow.mockResolvedValue({ ok: false, code: "not_found" });

    const { POST } = await import("../app/api/ai-usage/route");

    const res = await POST(
      new NextRequest("http://localhost/api/ai-usage", {
        method: "POST",
        body: JSON.stringify({ resultId: "no-such-id", csvText: CSV }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: "Analysis not found for this result.",
      code: "not_found",
    });
  });

  it("GET returns 404 when analysis cannot be resolved", async () => {
    resolveAnalysisRow.mockResolvedValue({ ok: false, code: "not_found" });

    const { GET } = await import("../app/api/results/[id]/ai-usage/route");

    const res = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: "owner-repo-abc" }) },
    );
    expect(res.status).toBe(404);
  });

  it("GET returns 404 when no row for this user in ai_usage_csvs", async () => {
    tableResults["ai_usage_csvs"] = { data: null, error: null };

    const { GET } = await import("../app/api/results/[id]/ai-usage/route");

    const res = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: "owner-repo-abc" }) },
    );
    expect(res.status).toBe(404);
  });

  it("GET returns csv_text from ai_usage_csvs for the authenticated user", async () => {
    tableResults["ai_usage_csvs"] = { data: { csv_text: CSV }, error: null };

    const { GET } = await import("../app/api/results/[id]/ai-usage/route");

    const res = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: "owner-repo-abc" }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      resultId: CANONICAL_ID,
      csvText: CSV,
    });
  });

  it("GET returns 401 when user is not authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const { GET } = await import("../app/api/results/[id]/ai-usage/route");

    const res = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: "owner-repo-abc" }) },
    );
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when user is not authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("../app/api/ai-usage/route");

    const res = await POST(
      new NextRequest("http://localhost/api/ai-usage", {
        method: "POST",
        body: JSON.stringify({ resultId: "owner-repo-abc", csvText: CSV }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
