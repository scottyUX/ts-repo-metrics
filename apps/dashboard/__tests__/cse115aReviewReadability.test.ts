// #440: a readable staff review page (the task spec as formatted markdown, full-height diff boxes, Copy and Copy all)
// and the Submissions table's Team column and "no code in PR" marker. The database and the sign-in are fakes;
// nothing reaches GitHub or Supabase. Names, emails, repos, PR numbers and task ids are made up.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFrontMatter, parseInline, parseMarkdown, safeHref } from "@/lib/cse115a/markdownView";
import { copyAllText, copyText, githubProfiles, REVIEW_TEXT, teamLink, teamLinks } from "@/lib/cse115a/reviewText";
import { diffPath, loadNoCodeMarkers, NO_CODE_TASK_PATHS, noCodeFromDiff, noCodeFromFlags, planNoCode, type NoCodeDb } from "@/lib/cse115a/noCodePr";
import { buildInstance } from "@/lib/cse115a/benchmark/buildInstance";
import { SNAPSHOT_REPO_PATHS, SNAPSHOT_SLOT_PATHS } from "@/lib/cse115a/gradeReview";
import {
  markerLines, markersFrom, matchesTeam, needsCodePr, nextSort, rowTeams, sortRows, teamOptions, type SubmissionRow,
} from "@/components/cse115a/instructor/sortRows";
import { MarkdownView } from "@/components/cse115a/instructor/MarkdownView";
import { SpecBody } from "@/components/cse115a/instructor/ReviewBoxes";
import { pinTask } from "./cse115aExtraCodePrsFixture";
import type { ExtraCodePr } from "@/lib/cse115a/submissionSnapshot";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  guard: "staff" as "staff" | "forbidden" | "signed-out",
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  fail: new Set<string>(),
  calls: [] as Array<{ table: string; columns: string; filters: string[] }>,
}));

/** A query builder over `state.tables` that understands the calls these routes make; JSON paths are resolved too. */
function fakeDb() {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          const filters: Array<(row: Record<string, unknown>) => boolean> = [];
          const call = { table, columns, filters: [] as string[] };
          state.calls.push(call);
          const query = {
            eq(column: string, value: unknown) { call.filters.push(`eq ${column}`); filters.push((row) => row[column] === value); return query; },
            is(column: string, value: null) { call.filters.push(`is ${column}`); filters.push((row) => (row[column] ?? null) === value); return query; },
            in(column: string, values: unknown[]) { call.filters.push(`in ${column}`); filters.push((row) => values.includes(row[column])); return query; },
            order() { return query; },
            then(resolve: (value: { data: unknown[] | null; error: unknown }) => unknown) {
              if (state.fail.has(table)) return Promise.resolve({ data: null, error: { message: "down" } }).then(resolve);
              const rows = (state.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
              return Promise.resolve({ data: rows.map((row) => project(row, columns)), error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };
}

/** Picks `a,b,alias:snapshot->tasks->0->x->>y` from a row like PostgREST does. */
function project(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns.split(",")) {
    const [alias, path] = column.includes(":") ? column.split(":") as [string, string] : [column, column];
    const parts = path.split(/->>?/);
    let value: unknown = row[parts[0]!];
    for (const part of parts.slice(1)) {
      value = value === null || value === undefined ? undefined : (value as Record<string, unknown>)[/^\d+$/.test(part) ? Number(part) : part];
    }
    out[alias] = value ?? null;
  }
  return out;
}

vi.mock("@/lib/supabase/server", () => ({ isSupabaseConfigured: () => true, getSupabase: () => fakeDb() }));
vi.mock("@/lib/cse115a/instructorApi", async () => {
  const { NextResponse } = await import("next/server");
  return {
    guardCourse: async () => state.guard === "staff"
      ? { identity: { userId: "staff-1" }, course: { id: "course-1", slug: "CSE115A-EX", assignment_count: 5 } }
      : { response: NextResponse.json({ error: state.guard === "forbidden" ? "You are not on this course's staff." : "Sign in with UCSC Google." }, { status: state.guard === "forbidden" ? 403 : 401 }) },
  };
});

beforeEach(() => {
  state.guard = "staff";
  state.tables = {};
  state.fail = new Set();
  state.calls = [];
});

const html = (markdown: string) => renderToStaticMarkup(createElement(MarkdownView, { markdown }));
const fileDiff = (path: string, line = "x") => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+${line}\n`;

// ---- 1. The task spec as formatted markdown ----

describe("1. task spec markdown", () => {
  const SPEC = [
    "---",
    "id: US-7-T-2",
    "story: US-7",
    "sprint: 7",
    "assignee: \"student-omega\"",
    "estimate_hours: 3",
    "labels:",
    "  - ui",
    "  - timer",
    "---",
    "# US-7-T-2: Kettle alarm",
    "",
    "## Description",
    "",
    "The kettle **beeps** when the water is *hot*, see `src/kettle.ts`.",
    "Second line of the paragraph.",
    "",
    "1. Read the sensor",
    "2. Beep",
    "",
    "- one",
    "- two with [docs](https://example.com/kettle)",
    "",
    "```ts",
    "const hot = 100;",
    "```",
    "",
    "> Quoted note",
    "",
    "| Step | Owner |",
    "| :--- | ---: |",
    "| Sensor | team |",
    "",
    "### Small heading",
  ].join("\n");

  it("renders headings, paragraphs, both lists, inline code, a fenced block, bold, italic, a link, a table and a quote", () => {
    const out = html(SPEC);
    expect(out).toContain(">US-7-T-2: Kettle alarm</h3>");
    expect(out).toContain(">Description</h4>");
    expect(out).toContain(">Small heading</h5>");
    expect(out).toContain("The kettle <strong>beeps</strong> when the water is <em>hot</em>, see <code");
    expect(out).toContain(">src/kettle.ts</code>");
    expect(out).toContain(". Second line of the paragraph.</p>");
    expect(out).toMatch(/<ol[^>]*><li[^>]*><p[^>]*>Read the sensor<\/p><\/li><li[^>]*><p[^>]*>Beep<\/p><\/li><\/ol>/);
    expect(out).toMatch(/<ul[^>]*><li[^>]*><p[^>]*>one<\/p><\/li>/);
    expect(out).toContain('<a href="https://example.com/kettle" target="_blank" rel="noopener noreferrer"');
    expect(out).toMatch(/<pre[^>]*><code>const hot = 100;<\/code><\/pre>/);
    expect(out).toMatch(/<blockquote[^>]*><p[^>]*>Quoted note<\/p><\/blockquote>/);
    expect(out).toMatch(/<th style="text-align:left"[^>]*>Step<\/th><th style="text-align:right"[^>]*>Owner<\/th>/);
    expect(out).toMatch(/<td style="text-align:left"[^>]*>Sensor<\/td>/);
  });

  it("shows the front matter as a small labelled list, not a rule and a paragraph", () => {
    expect(parseMarkdown(SPEC).frontMatter).toEqual([
      { key: "id", value: "US-7-T-2" }, { key: "story", value: "US-7" }, { key: "sprint", value: "7" },
      { key: "assignee", value: "student-omega" }, { key: "estimate_hours", value: "3" }, { key: "labels", value: "ui, timer" },
    ]);
    const out = html(SPEC);
    expect(out).toMatch(/^<div[^>]*><dl[^>]*><dt[^>]*>id<\/dt><dd[^>]*>US-7-T-2<\/dd>/);
    expect(out).toContain(">estimate_hours</dt><dd");
    expect(out).not.toContain("<hr");
    expect(out).not.toContain("id: US-7-T-2");
    // A line that is not a field is kept, not hidden.
    expect(parseFrontMatter("id: X-1\nnot a field line")).toEqual([{ key: "id", value: "X-1" }, { key: "", value: "not a field line" }]);
    // Without front matter, a leading rule is a rule.
    expect(parseMarkdown("text\n\n---\n\nmore").frontMatter).toBeNull();
  });

  it("parses nested lists, setext headings, hard breaks, escapes, autolinks and an indented code block", () => {
    expect(parseMarkdown("- a\n  - b\n- c").blocks).toEqual([{ kind: "list", ordered: false, start: 1, items: [
      [{ kind: "paragraph", children: [{ kind: "text", text: "a" }] }, { kind: "list", ordered: false, start: 1, items: [[{ kind: "paragraph", children: [{ kind: "text", text: "b" }] }]] }],
      [{ kind: "paragraph", children: [{ kind: "text", text: "c" }] }],
    ] }]);
    expect(parseMarkdown("Title\n=====").blocks).toEqual([{ kind: "heading", level: 1, children: [{ kind: "text", text: "Title" }] }]);
    expect(parseInline("a  \nb")).toEqual([{ kind: "text", text: "a" }, { kind: "break" }, { kind: "text", text: "b" }]);
    expect(parseInline("\\*not em\\*")).toEqual([{ kind: "text", text: "*not em*" }]);
    expect(parseInline("snake_case_name")).toEqual([{ kind: "text", text: "snake_case_name" }]);
    expect(parseInline("<https://example.com/a>")).toEqual([{ kind: "link", href: "https://example.com/a", address: "https://example.com/a", children: [{ kind: "text", text: "https://example.com/a" }] }]);
    expect(parseMarkdown("    code line").blocks).toEqual([{ kind: "code", lang: "", text: "code line" }]);
    expect(parseMarkdown("3. third\n4. fourth").blocks[0]).toMatchObject({ kind: "list", ordered: true, start: 3 });
  });

  it("never renders raw HTML: tags, scripts, iframes and styles come out as text", () => {
    const evil = [
      "<script>alert(1)</script>",
      "",
      "<iframe src=\"https://example.com\"></iframe>",
      "",
      "<style>body { display: none }</style>",
      "",
      "Inline <b onmouseover=\"x()\">bold</b> and <img src=x onerror=alert(1)>",
      "",
      "| <script>x</script> |",
      "| --- |",
      "| <u>cell</u> |",
    ].join("\n");
    const out = html(evil);
    expect(out).not.toMatch(/<script|<iframe|<style|<b |<img|<u>/i);
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("&lt;iframe src=&quot;https://example.com&quot;&gt;&lt;/iframe&gt;");
    expect(out).toContain("&lt;style&gt;body { display: none }&lt;/style&gt;");
    expect(out).toContain("Inline &lt;b onmouseover=&quot;x()&quot;&gt;bold&lt;/b&gt;");
    expect(out).toContain("&lt;u&gt;cell&lt;/u&gt;");
    // No attribute can be injected through a link either.
    const quoted = html('[x](https://example.com/" onclick="alert(1))');
    expect(quoted).not.toMatch(/<[^>]* onclick=/);
  });

  it("hostile specs at the 64 KB import limit parse quickly and never overflow the stack", () => {
    const size = 65_536;
    const inputs = {
      asterisks: "*a ".repeat(size / 3),
      brackets: "[".repeat(size),
      backticks: Array.from({ length: size / 8 }, (_, index) => "`".repeat((index % 7) + 1) + "x").join(""),
      angles: "<".repeat(size),
      underscores: "_a ".repeat(size / 3),
      links: "[a](".repeat(size / 4),
      nestedLists: "1. ".repeat(size / 3),
      nestedQuotes: "> ".repeat(size / 2),
      nestedEmphasis: "*a ".repeat(4000) + "b" + " a*".repeat(4000),
      newlines: "a  \n".repeat(size / 4),
    };
    for (const [name, markdown] of Object.entries(inputs)) {
      const started = performance.now();
      expect(() => html(markdown), name).not.toThrow();
      expect(performance.now() - started, name).toBeLessThan(2000);
    }
    expect(html("1. ".repeat(40) + "deep")).toContain("deep");
  });

  it("only http, https and mailto links are clickable; a javascript: link is shown as text", () => {
    expect(["https://example.com", "http://example.com/a?b=1", "mailto:someone@example.com"].map(safeHref)).toEqual(["https://example.com", "http://example.com/a?b=1", "mailto:someone@example.com"]);
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "file:///etc/passwd", "/relative/path", "//example.com/x", "#anchor", "example.com"]) {
      expect(safeHref(bad), bad).toBeNull();
    }
    const out = html("[click me](javascript:alert(1)) and [mail](mailto:team@example.com)");
    expect(out).not.toContain("javascript:alert(1)\"");
    expect(out).not.toMatch(/href="javascript/i);
    expect(out).toContain("<span>click me (javascript:alert(1))</span>");
    expect(out).toContain('<a href="mailto:team@example.com" target="_blank" rel="noopener noreferrer"');
    // Every clickable link opens in a new tab with noopener noreferrer.
    for (const anchor of html("[a](https://example.com) <https://example.org> ![pic](https://example.com/p.png)").match(/<a [^>]*>/g) ?? []) {
      expect(anchor).toContain('target="_blank"');
      expect(anchor).toContain('rel="noopener noreferrer"');
    }
  });

  it("never loads an image: it shows the alt text and the address as a link", () => {
    const out = html("![Kettle diagram](https://example.com/kettle.png) and ![](javascript:alert(1))");
    expect(out).not.toContain("<img");
    expect(out).toContain(`${REVIEW_TEXT.imageNotLoaded("Kettle diagram")} <a href="https://example.com/kettle.png" target="_blank" rel="noopener noreferrer"`);
    expect(REVIEW_TEXT.imageNotLoaded("Kettle diagram")).toBe("Image not loaded: Kettle diagram");
    expect(out).toContain("Image not loaded: no description");
    expect(out).toContain(">javascript:alert(1)</span>");
    expect(out).not.toMatch(/href="javascript/i);
  });

  it("Raw shows the exact stored text in today's box; Formatted is the default and both can open to full height", () => {
    const stored = "---\nid: X-1\n---\n# T <b>x</b>\n\n  spaced  \n";
    const raw = renderToStaticMarkup(createElement(SpecBody, { markdown: stored, raw: true, full: false, boxId: "b" }));
    expect(raw).toBe(`<pre id="b" class="max-h-96 overflow-auto whitespace-pre-wrap border-t border-border p-3 text-sm">${stored.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`);
    const formatted = renderToStaticMarkup(createElement(SpecBody, { markdown: stored, raw: false, full: true, boxId: "b" }));
    expect(formatted).toMatch(/^<div id="b" class="overflow-auto border-t border-border p-3">/);
    expect(formatted).toContain("<dl");
  });

  it("the review page's spec box defaults to Formatted and has the switch, the height toggle and Copy", async () => {
    const source = await readFile(join(__dirname, "../components/cse115a/instructor/ReviewBoxes.tsx"), "utf8");
    expect(source).toContain("const [raw, setRaw] = useState(false);");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(await readFile(join(__dirname, "../components/cse115a/instructor/MarkdownView.tsx"), "utf8")).not.toContain("dangerouslySetInnerHTML");
    const review = await readFile(join(__dirname, "../components/cse115a/instructor/SubmissionReview.tsx"), "utf8");
    expect(review).toContain("<SpecBox markdown={task.specMarkdown}");
    expect([REVIEW_TEXT.formatted, REVIEW_TEXT.raw, REVIEW_TEXT.fullHeight, REVIEW_TEXT.less, REVIEW_TEXT.copy, REVIEW_TEXT.copySpecLabel])
      .toEqual(["Formatted", "Raw", "Show full height", "Show less", "Copy", "Copy the task spec's markdown"]);
  });
});

// ---- 2. Copy and Copy all ----

describe("2. copy", () => {
  const extra = (prNumber: number, diff: string): ExtraCodePr => ({
    prNumber, prUrl: `https://github.com/team-lambda/lamp/pull/${prNumber}`, title: `Lamp part ${prNumber}`, mergedAt: "2026-10-04T00:00:00Z",
    mergeCommitSha: "c".repeat(40), baseCommit: "0".repeat(40), headCommit: null, diffEnd: "head", diff, diffBytes: diff.length, diffTruncated: false,
    checks: [], addedBy: "staff@example.edu", addedAt: "2026-10-05T00:00:00Z", reason: "rest of the code",
  });

  it("Copy all copies the whole stored diff, past the 200,000-character display limit", async () => {
    const { diffSections, tabCopyAll } = await import("@/components/cse115a/instructor/SubmissionReview");
    const long = fileDiff("src/big.ts", "y".repeat(250_000)) + fileDiff("src/tail.ts", "THE-LAST-LINE");
    const task = pinTask({ diff: long + fileDiff("src/__tests__/big.test.ts", "it()") });
    const copied = tabCopyAll(diffSections(task), "patch");
    expect(copied.length).toBeGreaterThan(250_000);
    expect(copied).toBe(long);
    expect(copied.endsWith("+THE-LAST-LINE\n")).toBe(true);
    expect(tabCopyAll(diffSections(task), "test_patch")).toBe(fileDiff("src/__tests__/big.test.ts", "it()"));
  }, 20_000); // the first test to import the review page; it timed out once at 5 seconds on a busy machine (#442)

  it("with extra PRs, Copy all copies every section in the order shown, each under a one-line heading naming the PR", async () => {
    const { diffSections, tabCopyAll } = await import("@/components/cse115a/instructor/SubmissionReview");
    const task = pinTask({
      diff: fileDiff("src/lamp.ts", "main"),
      extraCodePrs: [extra(12, fileDiff("src/lamp2.ts", "twelve") + fileDiff("src/__tests__/lamp2.test.ts", "t12")), extra(14, fileDiff("src/lamp3.ts", "fourteen"))],
    });
    expect(tabCopyAll(diffSections(task), "patch")).toBe([
      "PR #3: Lamp timer (main PR)", fileDiff("src/lamp.ts", "main").trimEnd(), "",
      "PR #12: Lamp part 12 (extra PR for this task's code)", fileDiff("src/lamp2.ts", "twelve").trimEnd(), "",
      "PR #14: Lamp part 14 (extra PR for this task's code)", fileDiff("src/lamp3.ts", "fourteen").trimEnd(), "",
    ].join("\n"));
    expect(tabCopyAll(diffSections(task), "test_patch")).toBe([
      "PR #3: Lamp timer (main PR)", "No test files changed.", "",
      "PR #12: Lamp part 12 (extra PR for this task's code)", fileDiff("src/__tests__/lamp2.test.ts", "t12").trimEnd(), "",
      "PR #14: Lamp part 14 (extra PR for this task's code)", "No test files changed.", "",
    ].join("\n"));
    expect(copyAllText([{ heading: null, text: "only" }], "patch")).toBe("only");
  });

  it("a refused copy reports failure, and the page then says to copy by hand", async () => {
    expect(await copyText("x", undefined)).toBe(false);
    expect(await copyText("x", null)).toBe(false);
    expect(await copyText("x", { writeText: () => Promise.reject(new Error("NotAllowedError")) })).toBe(false);
    const written: string[] = [];
    expect(await copyText("abc", { writeText: async (text) => { written.push(text); } })).toBe(true);
    expect(written).toEqual(["abc"]);
    expect(REVIEW_TEXT.copyFailed).toBe("Could not copy. Select the text and copy it by hand.");
    expect(REVIEW_TEXT.copied).toBe("Copied");
    const boxes = await readFile(join(__dirname, "../components/cse115a/instructor/ReviewBoxes.tsx"), "utf8");
    expect(boxes).toContain('state === "failed" ? REVIEW_TEXT.copyFailed');
  });

  it("buttons are real buttons whose labels say what they copy", async () => {
    expect(REVIEW_TEXT.copyAllLabel("patch")).toBe("Copy the whole patch");
    expect(REVIEW_TEXT.copyAllLabel("test_patch")).toBe("Copy the whole test_patch");
    expect(REVIEW_TEXT.copySectionLabel("patch", 12)).toBe("Copy PR #12's patch");
    expect(REVIEW_TEXT.fullHeightLabel("the patch")).toBe("Show the patch at full height");
    const boxes = await readFile(join(__dirname, "../components/cse115a/instructor/ReviewBoxes.tsx"), "utf8");
    expect(boxes.match(/<button type="button"/g)?.length).toBe(4);
    expect(boxes).toContain('aria-live="polite"');
  });
});

// ---- 3. Team and GitHub username ----

const row = (email: string, id: string | null, teams?: string[]): SubmissionRow => ({
  userId: `u-${email}`, email,
  submission: id ? { id, attempt: 1, status: "graded", submittedAt: "2026-11-20T00:00:00Z", teams, tasks: [], agentSprint: null, sprint: null, needsReview: false, jobError: null } : null,
});

describe("3. team and GitHub username", () => {
  it("the list route reads each task's repository by JSON path and lists one repo, two repos, or none", async () => {
    const { GET } = await import("../app/api/cse115a/instructor/courses/[slug]/submissions/route");
    state.tables = {
      cse_course_memberships: [
        { course_id: "course-1", user_id: "u1", ucsc_email: "student-a@example.edu" },
        { course_id: "course-1", user_id: "u2", ucsc_email: "student-b@example.edu" },
        { course_id: "course-1", user_id: "u3", ucsc_email: "student-c@example.edu" },
      ],
      cse_assignment_submissions: [
        { id: "s1", course_id: "course-1", user_id: "u1", assignment_number: 2, attempt: 1, status: "graded", submitted_at: "2026-11-20T00:00:00Z", superseded_at: null,
          snapshot: { tasks: [{ slot: 1, repoFullName: "team-kappa/kettle", diff: "SECRET-DIFF" }, { slot: 2, repoFullName: "team-kappa/kettle", diff: "SECRET-DIFF" }] } },
        { id: "s2", course_id: "course-1", user_id: "u2", assignment_number: 2, attempt: 1, status: "graded", submitted_at: "2026-11-20T00:00:00Z", superseded_at: null,
          snapshot: { tasks: [{ slot: 1, repoFullName: "team-mu/mixer" }, { slot: 2, repoFullName: "team-kappa/kettle" }] } },
      ],
      cse_task_grades: [],
      cse_grading_jobs: [],
    };
    const response = await GET(new Request("http://localhost/x?assignment=2"), { params: Promise.resolve({ slug: "CSE115A-EX" }) });
    const body = await response.json() as { rows: SubmissionRow[] };
    expect(body.rows.map((item) => [item.email, item.submission?.teams ?? null])).toEqual([
      ["student-a@example.edu", ["team-kappa/kettle"]],
      ["student-b@example.edu", ["team-kappa/kettle", "team-mu/mixer"]],
      ["student-c@example.edu", null],
    ]);
    const select = state.calls.find((call) => call.table === "cse_assignment_submissions")!;
    expect(select.columns).toBe(`id,user_id,attempt,status,submitted_at,${SNAPSHOT_SLOT_PATHS},${SNAPSHOT_REPO_PATHS}`);
    expect(select.columns).not.toMatch(/diff|snapshot,|,snapshot$/);
    expect(JSON.stringify(body)).not.toContain("SECRET-DIFF");
  });

  it("the Team cell shows each repository's name linked, with owner/repo as its title, and — for none", async () => {
    const { TeamCell } = await import("@/components/cse115a/instructor/InstructorHome");
    const one = renderToStaticMarkup(createElement(TeamCell, { row: row("a@example.edu", "s1", ["team-kappa/kettle"]) }));
    expect(one).toBe('<span class="flex flex-col gap-0.5"><a href="https://github.com/team-kappa/kettle" target="_blank" rel="noopener noreferrer" title="team-kappa/kettle" class="text-primary underline">kettle</a></span>');
    const two = renderToStaticMarkup(createElement(TeamCell, { row: row("b@example.edu", "s2", ["team-kappa/kettle", "team-mu/mixer"]) }));
    expect(two.match(/<a /g)?.length).toBe(2);
    expect(two).toContain(">mixer</a>");
    expect(renderToStaticMarkup(createElement(TeamCell, { row: row("c@example.edu", null) }))).toBe('<span class="text-muted-foreground">—</span>');
    expect(teamLink("not a repo")).toBeNull();
    expect(teamLink("owner/repo\"><script>")).toBeNull();
  });

  it("sorting by Team keeps each team's students together, students with none last", () => {
    const rows = [
      row("a@example.edu", "s1", ["team-mu/mixer"]),
      row("b@example.edu", "s2", ["team-kappa/kettle"]),
      row("c@example.edu", null),
      row("d@example.edu", "s4", ["team-mu/mixer"]),
      row("e@example.edu", "s5", ["team-kappa/kettle"]),
      row("f@example.edu", "s6", ["other-owner/kettle"]),
    ];
    const first = nextSort(null, "team");
    expect(first).toEqual({ key: "team", direction: "asc" });
    expect(sortRows(rows, first).map((item) => item.email)).toEqual(["f@example.edu", "b@example.edu", "e@example.edu", "a@example.edu", "d@example.edu", "c@example.edu"]);
    expect(sortRows(rows, nextSort(first, "team")).map((item) => item.email)).toEqual(["a@example.edu", "d@example.edu", "b@example.edu", "e@example.edu", "f@example.edu", "c@example.edu"]);
  });

  it("the Team filter lists the assignment's teams plus All teams, and shows only that team's students", () => {
    const rows = [row("a@example.edu", "s1", ["team-mu/mixer"]), row("b@example.edu", "s2", ["team-kappa/kettle", "team-mu/mixer"]), row("c@example.edu", null)];
    expect(teamOptions(rows)).toEqual(["team-kappa/kettle", "team-mu/mixer"]);
    expect(rows.filter((item) => matchesTeam(item, "team-mu/mixer")).map((item) => item.email)).toEqual(["a@example.edu", "b@example.edu"]);
    expect(rows.filter((item) => matchesTeam(item, "team-kappa/kettle")).map((item) => item.email)).toEqual(["b@example.edu"]);
    expect(rows.filter((item) => matchesTeam(item, "all"))).toHaveLength(3);
    expect(rowTeams(row("old@example.edu", "s9"))).toEqual([]);
    expect([REVIEW_TEXT.team, REVIEW_TEXT.allTeams]).toEqual(["Team", "All teams"]);
  });

  it("the review page header says Team and GitHub, linked, and leaves out a part with no value", async () => {
    const { TeamLines } = await import("@/components/cse115a/instructor/SubmissionReview");
    const both = renderToStaticMarkup(createElement(TeamLines, { tasks: [pinTask(), pinTask({ slot: 2 })] }));
    expect(both).toBe('<p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm"><span>Team: <span><a href="https://github.com/team-lambda/lamp" target="_blank" rel="noopener noreferrer" title="team-lambda/lamp" class="text-primary underline">lamp</a></span></span><span>GitHub: <span><a href="https://github.com/student-lambda" target="_blank" rel="noopener noreferrer" class="text-primary underline">student-lambda</a></span></span></p>');
    const noAuthor = renderToStaticMarkup(createElement(TeamLines, { tasks: [pinTask({ pr: { ...pinTask().pr, author: null } })] }));
    expect(noAuthor).toContain("Team: ");
    expect(noAuthor).not.toContain("GitHub:");
    const noRepo = renderToStaticMarkup(createElement(TeamLines, { tasks: [pinTask({ repoFullName: "" })] }));
    expect(noRepo).not.toContain("Team:");
    expect(noRepo).toContain("GitHub: ");
    expect(renderToStaticMarkup(createElement(TeamLines, { tasks: [pinTask({ repoFullName: "", pr: { ...pinTask().pr, author: null } })] }))).toBe("");
    expect(teamLinks(["team-mu/mixer", "team-kappa/kettle", "team-mu/mixer"]).map((team) => team.name)).toEqual(["kettle", "mixer"]);
    expect(githubProfiles(["student-a", "Student-A", null, "bad name"]).map((item) => item.login)).toEqual(["student-a"]);
  });
});

// ---- 4. The "no code in PR" marker ----

describe("4. no code in PR", () => {
  const taskFilesOnly = fileDiff("docs/tasks/sprint-7/US-7-T-2.md", "# US-7-T-2");
  const withCode = taskFilesOnly + fileDiff("src/kettle.ts");

  it("a task-file-only PR is no code; one code file, an AI-tool file or an empty diff is not", () => {
    expect(noCodeFromDiff(taskFilesOnly)).toBe(true);
    expect(noCodeFromDiff(taskFilesOnly + fileDiff("docs/tasks/sprint-7/US-7-T-3.md"))).toBe(true);
    expect(noCodeFromDiff(withCode)).toBe(false);
    expect(noCodeFromDiff(taskFilesOnly + fileDiff(".claude/settings.json"))).toBe(false);
    expect(noCodeFromDiff("")).toBe(false);
    expect(noCodeFromDiff(null)).toBe(false);
  });

  it("the benchmark flags give the same answer as the diff, so the diff need not be read", () => {
    const diffs = [taskFilesOnly, withCode, taskFilesOnly + fileDiff("src/__tests__/k.test.ts", "it()"), taskFilesOnly + fileDiff(".cursor/rules.md"), fileDiff("src/a.ts"), ""];
    for (const diff of diffs) {
      const { flags } = buildInstance(pinTask({ diff, diffError: diff ? null : "GitHub 500" }), 7, null);
      expect(noCodeFromFlags(flags), diff.slice(0, 80)).toBe(noCodeFromDiff(diff));
    }
  });

  it("works it out per task: flags first, a staff-chosen task labelled and not marked, extra PRs not marked, the diff only when there is no source row", () => {
    const flagsNoCode = buildInstance(pinTask({ diff: taskFilesOnly }), 7, null).flags;
    const flagsCode = buildInstance(pinTask({ diff: withCode }), 7, null).flags;
    const plan = planNoCode([
      { id: "s1", slot_1: 1, chosen_1: null, extra_1: null, slot_2: 2, chosen_2: null, extra_2: null },
      { id: "s2", slot_1: 1, chosen_1: 16, extra_1: null, slot_2: 2, chosen_2: null, extra_2: 21 },
      { id: "s3", slot_1: 2, chosen_1: null, extra_1: null },
    ], [
      { assignment_submission_id: "s1", task_slot: 1, flags: flagsNoCode },
      { assignment_submission_id: "s1", task_slot: 2, flags: flagsCode },
      { assignment_submission_id: "s2", task_slot: 1, flags: flagsNoCode },
      { assignment_submission_id: "s2", task_slot: 2, flags: flagsNoCode },
    ]);
    expect(plan.noCode).toEqual([{ submissionId: "s1", position: 1, slot: 1 }]);
    expect(plan.chosen).toEqual([{ submissionId: "s2", position: 1, slot: 1 }]);
    expect(plan.needDiff).toEqual([{ submissionId: "s3", position: 1, slot: 2 }]);
    expect(plan.reads).toEqual({ tasks: 5, fromFlags: 2, fromDiffs: 0, skipped: 2 });
    expect(NO_CODE_TASK_PATHS).not.toMatch(/diff/);
    expect(diffPath(3)).toBe("diff_3:snapshot->tasks->2->>diff");
  });

  const seed = () => {
    state.tables = {
      cse_assignment_submissions: [
        { id: "s1", course_id: "course-1", assignment_number: 2, superseded_at: null, user_id: "u1",
          snapshot: { tasks: [{ slot: 1, repoFullName: "team-kappa/kettle", diff: taskFilesOnly }, { slot: 2, repoFullName: "team-kappa/kettle", diff: withCode }] } },
        { id: "s2", course_id: "course-1", assignment_number: 2, superseded_at: null, user_id: "u2",
          snapshot: { tasks: [{ slot: 1, repoFullName: "team-mu/mixer", diff: "SECRET-DIFF", workPrChoice: { prNumber: 16 } }, { slot: 2, repoFullName: "team-mu/mixer", diff: taskFilesOnly }] } },
        { id: "s-old", course_id: "course-1", assignment_number: 2, superseded_at: "2026-11-19T00:00:00Z", user_id: "u3", snapshot: { tasks: [{ slot: 1, diff: taskFilesOnly }] } },
      ],
      cse_benchmark_task_sources: [
        { assignment_submission_id: "s1", task_slot: 1, flags: buildInstance(pinTask({ diff: taskFilesOnly }), 2, null).flags },
        { assignment_submission_id: "s1", task_slot: 2, flags: buildInstance(pinTask({ diff: withCode }), 2, null).flags },
      ],
    };
  };

  it("the route answers submission ids and slot numbers only, reading s2's task 2 diff because it has no source row", async () => {
    seed();
    const { GET } = await import("../app/api/cse115a/instructor/courses/[slug]/no-code-prs/route");
    const response = await GET(new Request("http://localhost/x?assignment=2"), { params: Promise.resolve({ slug: "CSE115A-EX" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ assignmentNumber: 2, noCode: [{ submissionId: "s1", slots: [1] }, { submissionId: "s2", slots: [2] }], chosenByStaff: [{ submissionId: "s2", slots: [1] }] });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/@|team-|kettle|mixer|diff --git|SECRET-DIFF|docs\/tasks/);
    // Reads: the small paths of every active submission, the source flags, and one diff path for s2 only.
    expect(state.calls.map((call) => [call.table, call.columns, call.filters])).toEqual([
      ["cse_assignment_submissions", `id,${NO_CODE_TASK_PATHS}`, ["eq course_id", "eq assignment_number", "is superseded_at"]],
      ["cse_benchmark_task_sources", "assignment_submission_id,task_slot,flags", ["in assignment_submission_id"]],
      ["cse_assignment_submissions", "id,diff_2:snapshot->tasks->1->>diff", ["in id"]],
    ]);
  });

  it("is staff-only: signed out is 401 and a non-staff account is 403, with nothing read", async () => {
    seed();
    const { GET } = await import("../app/api/cse115a/instructor/courses/[slug]/no-code-prs/route");
    state.guard = "signed-out";
    expect((await GET(new Request("http://localhost/x?assignment=2"), { params: Promise.resolve({ slug: "CSE115A-EX" }) })).status).toBe(401);
    state.guard = "forbidden";
    expect((await GET(new Request("http://localhost/x?assignment=2"), { params: Promise.resolve({ slug: "CSE115A-EX" }) })).status).toBe(403);
    expect(state.calls).toEqual([]);
    state.guard = "staff";
    expect((await GET(new Request("http://localhost/x?assignment=9"), { params: Promise.resolve({ slug: "CSE115A-EX" }) })).status).toBe(400);
  });

  it("writes nothing", async () => {
    const source = await readFile(join(__dirname, "../lib/cse115a/noCodePr.ts"), "utf8") + await readFile(join(__dirname, "../app/api/cse115a/instructor/courses/[slug]/no-code-prs/route.ts"), "utf8");
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });

  it("a failing lookup is a 500 the table survives: no marker, the filter is empty, and the page says so", async () => {
    seed();
    state.fail.add("cse_benchmark_task_sources");
    const { GET } = await import("../app/api/cse115a/instructor/courses/[slug]/no-code-prs/route");
    const response = await GET(new Request("http://localhost/x?assignment=2"), { params: Promise.resolve({ slug: "CSE115A-EX" }) });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not work out which PRs hold no code." });
    // The table: no markers loaded means no lines and no row in "Needs a code PR".
    const listed = row("a@example.edu", "s1", ["team-kappa/kettle"]);
    expect(markerLines(listed, null)).toEqual([]);
    expect(needsCodePr(listed, null)).toBe(false);
    const home = await readFile(join(__dirname, "../components/cse115a/instructor/InstructorHome.tsx"), "utf8");
    expect(home).toContain(".catch(() => setMarked({ key: markersUrl, markers: null, failed: true }));");
    expect(home).toContain("{markersFailed ? <p role=\"status\"");
    expect(REVIEW_TEXT.noCodeFailed).toBe("The \"no code in PR\" marker could not be loaded. The rest of the table is up to date.");
  });

  it("the table marks per task, labels a staff-chosen task, and the filter keeps rows with a marked task", () => {
    const markers = markersFrom({ noCode: [{ submissionId: "s1", slots: [1] }, { submissionId: "s3", slots: [2] }], chosenByStaff: [{ submissionId: "s2", slots: [1] }, { submissionId: "s3", slots: [2] }] });
    const a = row("a@example.edu", "s1");
    const b = row("b@example.edu", "s2");
    const c = row("c@example.edu", "s3");
    expect(markerLines(a, markers)).toEqual([{ slot: 1, text: "Task 1: no code in PR", noCode: true }]);
    expect(markerLines(b, markers)).toEqual([{ slot: 1, text: "Task 1: code PR chosen by staff", noCode: false }]);
    // A chosen task is never also marked as no code.
    expect(markerLines(c, markers)).toEqual([{ slot: 2, text: "Task 2: code PR chosen by staff", noCode: false }]);
    expect([a, b, c, row("d@example.edu", null)].filter((item) => needsCodePr(item, markers)).map((item) => item.email)).toEqual(["a@example.edu"]);
    expect(REVIEW_TEXT.needsCodePr).toBe("Needs a code PR");
  });

  it("for a 60-student assignment it reads small paths and flags, and no diff when every task has a source row", async () => {
    const flagsNoCode = buildInstance(pinTask({ diff: taskFilesOnly }), 2, null).flags;
    const flagsCode = buildInstance(pinTask({ diff: withCode }), 2, null).flags;
    const big = fileDiff("src/big.ts", "z".repeat(200_000));
    state.tables = { cse_assignment_submissions: [], cse_benchmark_task_sources: [] };
    for (let index = 0; index < 60; index++) {
      const id = `s${index}`;
      state.tables.cse_assignment_submissions!.push({ id, course_id: "course-1", assignment_number: 2, superseded_at: null,
        snapshot: { tasks: [{ slot: 1, diff: index % 10 === 0 ? taskFilesOnly : big }, { slot: 2, diff: big }] } });
      state.tables.cse_benchmark_task_sources!.push(
        { assignment_submission_id: id, task_slot: 1, flags: index % 10 === 0 ? flagsNoCode : flagsCode },
        { assignment_submission_id: id, task_slot: 2, flags: flagsCode },
      );
    }
    const started = performance.now();
    const result = await loadNoCodeMarkers(fakeDb() as unknown as NoCodeDb, "course-1", 2);
    const took = performance.now() - started;
    expect(result.ok && result.reads).toEqual({ tasks: 120, fromFlags: 120, fromDiffs: 0, skipped: 0 });
    expect(result.ok && result.markers.noCode.length).toBe(6);
    expect(state.calls.some((call) => /diff/.test(call.columns))).toBe(false);
    // What came back from the "database": no diff text at all.
    const listed = await fakeDb().from("cse_assignment_submissions").select(`id,${NO_CODE_TASK_PATHS}`);
    const sources = await fakeDb().from("cse_benchmark_task_sources").select("assignment_submission_id,task_slot,flags");
    const bytes = JSON.stringify(listed.data).length + JSON.stringify(sources.data).length;
    expect(bytes).toBeLessThan(60_000);
    process.stdout.write(`[#440] no-code markers for 60 students: ${bytes} bytes of JSON read, ${took.toFixed(1)} ms\n`);
  });
});

// ---- 5. Students see none of it ----

describe("5. student pages show nothing new", () => {
  it("no student route, page or component reads the no-code route or shows team, GitHub username or the marker", async () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    await walk(join(root, "app"));
    await walk(join(root, "components"));
    const student = files.filter((path) => !/instructor/.test(relative(root, path)));
    expect(student.length).toBeGreaterThan(10);
    for (const path of student) {
      const text = await readFile(path, "utf8");
      expect(text, relative(root, path)).not.toMatch(/no-code-prs|cse115a\/noCodePr|cse115a\/reviewText|REVIEW_TEXT|cse115a\/markdownView|instructor\/MarkdownView|ReviewBoxes|TeamLines|TeamCell|no code in PR|Needs a code PR|code PR chosen by staff|All teams|SNAPSHOT_REPO_PATHS/);
    }
  });
});
