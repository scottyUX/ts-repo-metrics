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
const LEGACY_ID = "owner-repo-abc";
const USER_A = "user-a";
const USER_B = "user-b";
const CSV =
  "timestamp,event_type,session_id,tool_name\n2026-05-20T10:00:00.000Z,user_prompt,s1,\n";
const CSV_B =
  "timestamp,event_type,session_id,tool_name\n2026-05-21T10:00:00.000Z,user_prompt,s2,\n";

describe("ai usage routes — dev fallback mode", () => {
  beforeEach(async () => {
    vi.resetModules();
    getUser.mockReset();
    fromFn.mockClear();
    getUser.mockResolvedValue({ data: { user: { id: USER_A } } });

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
        body: JSON.stringify({ resultId: LEGACY_ID, csvText: CSV }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(postRes.status).toBe(200);
    await expect(postRes.json()).resolves.toEqual({
      resultId: `${USER_A}-${LEGACY_ID}`,
      csvText: CSV,
    });

    const getRes = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: LEGACY_ID }) },
    );
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toEqual({
      resultId: `${USER_A}-${LEGACY_ID}`,
      csvText: CSV,
    });
  });

  it("does not overwrite another user's CSV for the same repo", async () => {
    const { POST } = await import("../app/api/ai-usage/route");
    const { GET } = await import("../app/api/results/[id]/ai-usage/route");

    getUser.mockResolvedValueOnce({ data: { user: { id: USER_A } } });
    await POST(
      new NextRequest("http://localhost/api/ai-usage", {
        method: "POST",
        body: JSON.stringify({ resultId: LEGACY_ID, csvText: CSV }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    getUser.mockResolvedValueOnce({ data: { user: { id: USER_B } } });
    await POST(
      new NextRequest("http://localhost/api/ai-usage", {
        method: "POST",
        body: JSON.stringify({ resultId: LEGACY_ID, csvText: CSV_B }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    getUser.mockResolvedValueOnce({ data: { user: { id: USER_A } } });
    const getA = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: LEGACY_ID }) },
    );
    expect(getA.status).toBe(200);
    await expect(getA.json()).resolves.toMatchObject({ csvText: CSV });

    getUser.mockResolvedValueOnce({ data: { user: { id: USER_B } } });
    const getB = await GET(
      new NextRequest("http://localhost/api/results/owner-repo-abc/ai-usage"),
      { params: Promise.resolve({ id: LEGACY_ID }) },
    );
    expect(getB.status).toBe(200);
    await expect(getB.json()).resolves.toMatchObject({ csvText: CSV_B });
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

    getUser.mockResolvedValue({ data: { user: { id: USER_A } } });
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
    expect(resolveAnalysisRow).toHaveBeenCalledWith(
      "owner-repo-abc12345",
      expect.anything(),
      { preferUserScope: true },
    );
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
