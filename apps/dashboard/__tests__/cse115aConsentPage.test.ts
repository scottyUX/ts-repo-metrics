// The research consent page (/cse115a/consent), the approved wording, the return after sign-in, and
// the staff totals. Routes run against an in-memory fake; nothing reaches GitHub or Supabase.
// Emails, ids and course codes here are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_APPROVED, CONSENT_CHANGE_LINE, CONSENT_NO, CONSENT_TEXT, CONSENT_VERSION, CONSENT_YES, countsAsConsent, currentConsent, splitEmails,
  type StoredConsent,
} from "@/lib/cse115a/consent";
import { saveConsentAnswer } from "@/lib/cse115a/consentClient";
import { CSE115A_CONSENT_PATH, CSE115A_DASHBOARD_PATH, signInReturnPath } from "@/lib/cse115a/signInReturn";
import { consentAnswerLine, ResearchConsentQuestion } from "@/components/cse115a/ResearchConsentQuestion";
import { ConsentPageView, consentPageState, type ConsentPageState } from "@/components/cse115a/ConsentPage";
import { consentTotalsLine } from "@/components/cse115a/instructor/BenchmarkPanel";

vi.mock("server-only", () => ({}));
// The real button checks Supabase in the browser; here it only shows where it would return to.
vi.mock("@/components/cse115a/UcscGoogleButton", async () => {
  const { createElement: h } = await import("react");
  return { UcscGoogleButton: ({ returnTo }: { returnTo?: string }) => h("button", { type: "button", "data-return-to": returnTo ?? "" }, "Continue with UCSC Google") };
});

// ---- An in-memory Supabase for the consent, /me and totals routes ----

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>>, identity: null as null | { userId: string; email: string; githubLogin: null } }));

function fakeQuery(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let range: [number, number] | null = null;
  const rows = () => {
    const matched = (db.tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
    return range ? matched.slice(range[0], range[1] + 1) : matched;
  };
  const query = {
    select: () => query,
    order: () => query,
    not: () => query,
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return query; },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return query; },
    is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return query; },
    range: (from: number, to: number) => { range = [from, to]; return query; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    upsert: async (row: Row, options: { onConflict: string }) => {
      const keys = options.onConflict.split(",");
      const list = db.tables[table] ??= [];
      const index = list.findIndex((existing) => keys.every((key) => existing[key] === row[key]));
      if (index >= 0) list[index] = { ...list[index], ...row }; else list.push(row);
      return { error: null };
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => ({ from: fakeQuery }) }));
vi.mock("@/lib/cse115a/server", () => ({
  ASSIGNMENT_SUBMISSION_COLUMNS: "id,course_id,assignment_number,attempt,status,submitted_at",
  TASK_SUBMISSION_COLUMNS: "id",
  getCourseIdentity: async () => db.identity,
  getEnrolledCourse: async (userId: string, slug: string) => {
    const course = (db.tables.cse_courses ?? []).find((row) => row.slug === slug && row.active);
    if (!course) return null;
    return (db.tables.cse_course_memberships ?? []).some((row) => row.course_id === course.id && row.user_id === userId) ? course : null;
  },
}));
vi.mock("@/lib/cse115a/instructorApi", () => ({
  guardCourse: async (slug: string) => {
    const course = (db.tables.cse_courses ?? []).find((row) => row.slug === slug);
    return course ? { identity: { userId: "staff-1", email: "ta@example.edu", githubLogin: null }, course } : { response: new Response(null, { status: 403 }) };
  },
}));

const COURSE = { id: "course-1", slug: "CSE115A-Test", title: "CSE 115A", term: "Fall 2026", assignment_count: 5, active: true };
const STUDENT = { userId: "user-a", email: "student-a@example.edu", githubLogin: null };
const answer = (consented: boolean, version = CONSENT_VERSION, updated_at = "2026-11-20T12:00:00Z"): StoredConsent =>
  ({ course_id: COURSE.id, consented, consent_version: version, updated_at });

const render = (state: ConsentPageState, extra: Partial<Parameters<typeof ConsentPageView>[0]> = {}) =>
  renderToStaticMarkup(createElement(ConsentPageView, { state, ...extra }));
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ---- 0. The approved wording ----

describe("the approved consent wording", () => {
  it("is the new version, approved, with the title and both choices word for word", () => {
    expect(CONSENT_VERSION).toBe("2026-11-20");
    expect(CONSENT_APPROVED).toBe(true);
    expect(CONSENT_TEXT.title).toBe("Hecate Benchmark: research participation");
    expect(CONSENT_YES).toBe("I agree to let the Hecate Lab use my CSE 115A code as described above.");
    expect(CONSENT_NO).toBe("I do not agree.");
    expect(CONSENT_TEXT.sections.map((section) => section.label)).toEqual([
      "What we would collect.", "How we would use it.", "It's voluntary.", "You can change your mind.", "Risks and benefits.", "Questions.",
    ]);
  });

  it("keeps the two typing slips corrected", () => {
    const all = [CONSENT_TEXT.opening, ...CONSENT_TEXT.sections.map((section) => section.text)].join(" ");
    expect(all).toContain("You can withdraw at any time before the course ends by emailing okdogulu@ucsc.edu.");
    expect(all).not.toContain("ends. by");
    expect(all).not.toContain("[");
    expect(all).toContain("Administration at orca@ucsc.edu.");
  });

  it("renders a title, labelled paragraphs, both addresses as mailto: links, and the change line", () => {
    const html = renderToStaticMarkup(createElement(ResearchConsentQuestion, { headingId: "h", consent: null, saving: false, onAnswer: () => {} }));
    expect(html).toContain(`<h2 id="h" class="font-semibold">${CONSENT_TEXT.title}</h2>`);
    expect(html).toContain('<a href="mailto:okdogulu@ucsc.edu"');
    expect(html).toContain('<a href="mailto:orca@ucsc.edu"');
    expect((html.match(/mailto:okdogulu@ucsc\.edu/g) ?? []).length).toBe(2);
    for (const section of CONSENT_TEXT.sections) expect(text(html)).toContain(`${section.label} ${text(section.text)}`);
    expect(text(html)).toContain(CONSENT_YES);
    expect(text(html)).toContain(CONSENT_NO);
    expect(text(html)).toContain(CONSENT_CHANGE_LINE);
    expect(html).not.toContain("Yes, include my tasks");
    expect(html).not.toContain("No, keep them out");
  });

  it("splits text on email addresses without eating the full stop after one", () => {
    expect(splitEmails("Contact okdogulu@ucsc.edu. Then")).toEqual([
      { text: "Contact ", email: false }, { text: "okdogulu@ucsc.edu", email: true }, { text: ". Then", email: false },
    ]);
  });

  it("an answer to an older version does not count", () => {
    expect(currentConsent([answer(true, "placeholder")], COURSE.id)).toBeNull();
    expect(countsAsConsent(answer(true, "placeholder"))).toBe(false);
    expect(countsAsConsent(answer(true))).toBe(true);
    expect(currentConsent([answer(false)], COURSE.id)?.consented).toBe(false);
    expect(currentConsent([answer(true)], "another-course")).toBeNull();
  });
});

// ---- 1. The page's states ----

describe("/cse115a/consent states", () => {
  const enrolled = (consent: StoredConsent[]) => consentPageState(200, { courses: [COURSE], consent });

  it("enrolled with no answer: the question, 'You have not answered yet.', both buttons, a link back", () => {
    const html = render(enrolled([]));
    expect(text(html)).toContain("You have not answered yet.");
    expect(text(html)).toContain(CONSENT_YES);
    expect(text(html)).toContain(CONSENT_NO);
    expect(text(html)).toContain("CSE 115A · Fall 2026");
    expect(html).toContain('href="/cse115a/dashboard"');
    expect(text(html)).toContain("Whether you take part has no effect on your grade");
    expect(text(html)).toContain(CONSENT_CHANGE_LINE);
  });

  it("answered yes and no: 'You said yes on <date>' / 'You said no on <date>'", () => {
    expect(text(render(enrolled([answer(true)])))).toContain("You said yes on November 20, 2026.");
    expect(text(render(enrolled([answer(false)])))).toContain("You said no on November 20, 2026.");
    expect(consentAnswerLine(answer(true))).toBe("You said yes on November 20, 2026.");
  });

  it("an answer to the old version shows as not answered", () => {
    const html = text(render(enrolled([answer(true, "placeholder")])));
    expect(html).toContain("You have not answered yet.");
    expect(html).not.toContain("You said yes");
  });

  it("after saving: a plain confirmation and the change line", () => {
    const html = text(render(enrolled([answer(true)]), { saved: { [COURSE.id]: true } }));
    expect(html).toContain("Your answer is saved.");
    expect(html).toContain("You can change your answer at any time on this page.");
  });

  it("signed in, not enrolled: says so with the link to join, and no buttons", () => {
    const state = consentPageState(200, { courses: [], consent: [] });
    expect(state.kind).toBe("not-enrolled");
    const html = render(state);
    expect(text(html)).toContain("You are not in a course yet");
    expect(html).toContain('href="/cse115a/dashboard"');
    expect(html).not.toContain(CONSENT_YES);
    expect(html).not.toContain("<button");
  });

  it("signed out: the UCSC sign-in that returns to this page, and no question", () => {
    const state = consentPageState(401, { error: "Sign in with a verified UCSC Google account." });
    expect(state.kind).toBe("signed-out");
    const html = render(state);
    expect(html).toContain('data-return-to="/cse115a/consent"');
    expect(text(html)).toContain("Continue with UCSC Google");
    expect(html).not.toContain(CONSENT_YES);
  });

  it("other failures show the error", () => {
    expect(consentPageState(503, { error: "Course storage is not configured." })).toEqual({ kind: "error", message: "Course storage is not configured." });
    expect(consentPageState(500, null)).toEqual({ kind: "error", message: "Could not load your courses." });
  });

  it("adds no sentence that pushes toward yes", () => {
    const html = text(render(enrolled([]))).toLowerCase();
    for (const nudge of ["please", "we hope", "encourage", "help us", "recommended"]) expect(html).not.toContain(nudge);
  });
});

// ---- Saving from the page, then the course page ----

describe("saving from the page uses the existing API, and the course page sees the same answer", () => {
  beforeEach(() => {
    db.identity = STUDENT;
    db.tables = {
      cse_courses: [COURSE],
      cse_course_memberships: [{ course_id: COURSE.id, user_id: STUDENT.userId, joined_at: "2026-09-25T00:00:00Z" }],
      cse_research_consent: [{ course_id: COURSE.id, user_id: STUDENT.userId, consented: true, consent_version: "placeholder", updated_at: "2026-10-01T00:00:00Z" }],
      cse_task_submissions: [], cse_assignment_submissions: [], cse_sprints: [], cse_task_grades: [],
    };
  });

  async function routeFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
    expect(String(url)).toBe("/api/cse115a/consent");
    expect(init?.method).toBe("PUT");
    const { PUT } = await import("@/app/api/cse115a/consent/route");
    return PUT(new Request("http://localhost/api/cse115a/consent", { method: "PUT", body: init?.body as string, headers: init?.headers }));
  }

  async function me() {
    const { GET } = await import("@/app/api/cse115a/me/route");
    const response = await GET();
    return { status: response.status, body: await response.json() as { courses: typeof COURSE[]; consent: StoredConsent[] } };
  }

  it("an old-version yes shows as not answered before; a page 'no' is stored once, at the current version, and both places show it", async () => {
    const before = await me();
    expect(text(render(consentPageState(before.status, before.body)))).toContain("You have not answered yet.");
    expect(currentConsent(before.body.consent, COURSE.id)).toBeNull();

    const fetchSpy = vi.fn(routeFetch) as unknown as typeof fetch;
    const saved = await saveConsentAnswer(COURSE.slug, false, fetchSpy);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse((vi.mocked(fetchSpy).mock.calls[0]![1] as RequestInit).body as string)).toEqual({ courseSlug: COURSE.slug, consented: false });
    expect(saved).toMatchObject({ course_id: COURSE.id, consented: false, consent_version: CONSENT_VERSION });
    expect(db.tables.cse_research_consent).toHaveLength(1);

    const after = await me();
    // The consent page:
    expect(text(render(consentPageState(after.status, after.body)))).toContain(`You said no on`);
    // The course page reads the same /me answer through the same helper (CourseDashboard: currentConsent(me.consent, course.id)):
    expect(currentConsent(after.body.consent, COURSE.id)).toMatchObject({ consented: false, consent_version: CONSENT_VERSION });
  });

  it("an answer saved on the course page shows on the consent page", async () => {
    await saveConsentAnswer(COURSE.slug, true, vi.fn(routeFetch) as unknown as typeof fetch);
    const after = await me();
    expect(text(render(consentPageState(after.status, after.body)))).toContain("You said yes on");
  });

  it("a failed save throws the API's message", async () => {
    db.tables.cse_course_memberships = [];
    await expect(saveConsentAnswer(COURSE.slug, true, vi.fn(routeFetch) as unknown as typeof fetch)).rejects.toThrow("Join this course first.");
  });

  it("both places use the one component and the one save helper", () => {
    const dashboard = readFileSync(path.resolve(__dirname, "../components/cse115a/CourseDashboard.tsx"), "utf8");
    const page = readFileSync(path.resolve(__dirname, "../components/cse115a/ConsentPage.tsx"), "utf8");
    for (const source of [dashboard, page]) {
      expect(source).toContain("<ResearchConsentQuestion");
      expect(source).toContain("saveConsentAnswer(course.slug, consented)");
      expect(source).toContain("currentConsent(");
    }
    expect(dashboard).not.toContain("/api/cse115a/consent");
    // The course page keeps its conditions: the card until answered (or while changing), then the Research use line.
    expect(dashboard).toContain("{!consent || editingConsent ? (");
    expect(dashboard).toContain("{consent && !editingConsent ? (");
    expect(dashboard).toContain("Research use: {consent.consented ? \"you agreed\" : \"you did not agree\"}.");
    const bar = readFileSync(path.resolve(__dirname, "../components/cse115a/Cse115aStudentBar.tsx"), "utf8");
    expect(bar).toContain('<Link href="/cse115a/consent" className="font-medium underline">Research consent</Link>');
  });
});

// ---- The return after sign-in ----

describe("signInReturnPath: only /cse115a/consent may be returned to", () => {
  it("returns the consent page when asked for", () => {
    expect(signInReturnPath("/cse115a/consent")).toBe(CSE115A_CONSENT_PATH);
  });

  it("falls back to the dashboard for anything else", () => {
    for (const value of [
      undefined, null, "", 42, "https://evil.example/cse115a/consent", "http://evil.example", "//evil.example", "//evil.example/cse115a/consent",
      "/\\evil.example", "\\\\evil.example", "/cse115a/consent/", "/cse115a/consent?x=1", "/cse115a/consent#x", "/cse115a//consent",
      "/cse115a\\consent", "/cse115a/consent/../instructor", "/cse115a/instructor", "/repos", " /cse115a/consent", "/CSE115A/consent",
      "%2Fcse115a%2Fconsent", "@evil.example", "javascript:alert(1)",
    ]) {
      expect(signInReturnPath(value)).toBe(CSE115A_DASHBOARD_PATH);
    }
  });

  it("the Google button stores only the checked path; every other caller keeps the dashboard", () => {
    const button = readFileSync(path.resolve(__dirname, "../components/cse115a/UcscGoogleButton.tsx"), "utf8");
    expect(button).toContain("stashOAuthNextPath(signInReturnPath(returnTo));");
    expect(button.match(/stashOAuthNextPath\(/g)).toHaveLength(1);
    for (const file of ["../app/cse115a/page.tsx", "../app/cse115a/signin/page.tsx"]) {
      expect(readFileSync(path.resolve(__dirname, file), "utf8")).not.toContain("returnTo");
    }
  });

  it("the callback sends the student to the stored consent path", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request("http://localhost:3000/auth/callback", { headers: { cookie: `repo_metrics_oauth_next=${encodeURIComponent(signInReturnPath("/cse115a/consent"))}` } }));
    expect(response.headers.get("location")).toBe("http://localhost:3000/cse115a/consent");
  });
});

// ---- Staff totals ----

describe("staff consent totals", () => {
  beforeEach(() => {
    db.identity = null;
    db.tables = {
      cse_courses: [COURSE, { ...COURSE, id: "course-2", slug: "OTHER-Test" }],
      cse_course_memberships: ["a", "b", "c", "d", "e", "f"].map((id) => ({ course_id: COURSE.id, user_id: `user-${id}` }))
        .concat([{ course_id: "course-2", user_id: "user-z" }]),
      cse_research_consent: [
        { course_id: COURSE.id, user_id: "user-a", consented: true, consent_version: CONSENT_VERSION },
        { course_id: COURSE.id, user_id: "user-b", consented: true, consent_version: CONSENT_VERSION },
        { course_id: COURSE.id, user_id: "user-c", consented: false, consent_version: CONSENT_VERSION },
        { course_id: COURSE.id, user_id: "user-d", consented: true, consent_version: "placeholder" },
        { course_id: COURSE.id, user_id: "user-e", consented: false, consent_version: "placeholder" },
        // Not enrolled any more: not counted.
        { course_id: COURSE.id, user_id: "user-gone", consented: true, consent_version: CONSENT_VERSION },
        // Another course: not counted.
        { course_id: "course-2", user_id: "user-z", consented: true, consent_version: CONSENT_VERSION },
      ],
    };
  });

  it("counts enrolled students by their answer to the current version only", async () => {
    const { consentTotals } = await import("@/lib/cse115a/consentTotals");
    expect(consentTotals(["user-a", "user-b"], [])).toEqual({ enrolled: 2, yes: 0, no: 0, notAnswered: 2 });
    const { GET } = await import("@/app/api/cse115a/instructor/courses/[slug]/consent-totals/route");
    const response = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ slug: COURSE.slug }) });
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(JSON.parse(raw)).toEqual({ enrolled: 6, yes: 2, no: 1, notAnswered: 3 });
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(["enrolled", "no", "notAnswered", "yes"]);
    expect(raw).not.toMatch(/user-|@|example|student|name|email|id/i);
  });

  it("is refused to someone who is not on the course's staff", async () => {
    const { GET } = await import("@/app/api/cse115a/instructor/courses/[slug]/consent-totals/route");
    const response = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ slug: "NOT-A-COURSE" }) });
    expect(response.status).toBe(403);
  });

  it("the Benchmark page shows one line of counts", () => {
    expect(consentTotalsLine({ enrolled: 6, yes: 2, no: 1, notAnswered: 3 }))
      .toBe("Research consent (current wording): 6 enrolled · 2 answered yes · 1 answered no · 3 not answered");
  });
});
