// `fix_coverage`: which of the lines a validated row's fix adds or modifies its proving tests
// actually execute, measured by a coverage run of the post-fix state (coverageRun.ts). This module
// is the pure part: the changed lines from the patch, which of them are code, the coverage report
// parsers, the per-file classification and how `untested_files` is derived from it. Rules are in
// docs/CSE115A_BENCHMARK_VALIDATION.md, "Fix coverage".

import { posix } from "node:path";
import ts from "typescript";
import { isCodeFile } from "@/lib/cse115a/benchmark/validation/untestedFiles";

/** What coverage says about one changed file. */
export type FileState = "run" | "not_run" | "not_measured";

export type FixCoverageFile = {
  /** Repo-relative changed code file (the set `changedFilesInPatch` + `isCodeFile` give). */
  path: string;
  state: FileState;
  /** Lines the patch adds or modifies in this file (post-fix line numbers). */
  changed_lines: number;
  /** Of those, lines the tool counts as executable; null when the file was never loaded. */
  executable: number | null;
  /** Of the executable ones, lines executed at least once; null when the file was never loaded. */
  covered: number | null;
  /** Executable changed lines never executed, as compact sorted ranges (`12-15,40`); "" when none, null when never loaded. */
  uncovered: string | null;
};

export type FixCoverage = {
  status: "measured" | "partial" | "unavailable";
  /** One line, when the status is not `measured`. */
  reason?: string;
  /** The coverage tools that produced a report, e.g. `coverage.py 7.6.1`, `vitest 4.1.12 (v8)`. */
  tools: string[];
  files: FixCoverageFile[];
  files_changed: number;
  files_run: number;
  files_not_run: number;
  files_not_measured: number;
  /** Summed over files with state `run`. */
  lines_executable: number;
  lines_covered: number;
};

/** How a result's `untested_files` was made. */
export type UntestedSource = "coverage" | "imports" | "mixed";

export type CoverageLanguage = "javascript" | "python";

/** Line → hit count, for the lines a tool counts as executable. */
export type LineCounts = Map<number, number>;

/**
 * One coverage report: one runner step of one suite (`vitest-0 in apps/api`). `ok: false` when the
 * step produced nothing usable; files of its language that no other report shows as run are then
 * `not_measured`, since that step might have run them.
 */
export type ReportCoverage =
  | {
      label: string; language: CoverageLanguage; ok: true; tool: string; files: Map<string, LineCounts>;
      /**
       * Paths the report lists that are not files of the post-fix tree: build output a test
       * imported, left unmapped because it has no source map. Never credited to a source file.
       */
      generated: string[];
    }
  | { label: string; language: CoverageLanguage; ok: false; reason: string };

/** The language a changed file belongs to, for deciding which reports can speak for it. */
export function fileLanguage(path: string): CoverageLanguage {
  return path.endsWith(".py") ? "python" : "javascript";
}

// ---------------------------------------------------------------------------------------------
// Changed lines

/**
 * The post-fix line numbers of every `+` line of the patch, per changed code file. Deleted files
 * and non-code files are left out, as `changedFilesInPatch` and `isCodeFile` do; a file the patch
 * renames without edits, or only deletes lines from, is listed with no lines.
 */
export function changedLinesInPatch(patch: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const block of patch.split(/^(?=diff --git )/m)) {
    if (!block.startsWith("diff --git ") || /^deleted file mode /m.test(block)) continue;
    let path: string | null = null;
    let renamed: string | null = null;
    const lines: number[] = [];
    let next = 0;
    let oldLeft = 0;
    let newLeft = 0;
    for (const line of block.split("\n")) {
      if (oldLeft > 0 || newLeft > 0) {
        if (line.startsWith("+")) { lines.push(next++); newLeft--; }
        else if (line.startsWith("-")) oldLeft--;
        else if (line.startsWith("\\")) continue;
        // A context line; some tools strip the leading space of an empty one.
        else { next++; oldLeft--; newLeft--; }
        continue;
      }
      const hunk = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (hunk) {
        oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
        next = Number(hunk[2]);
        newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
      } else if (line.startsWith("+++ ")) {
        const target = line.slice(4).split("\t")[0].trim();
        if (target !== "/dev/null") path = target.startsWith("b/") ? target.slice(2) : target;
      } else if (line.startsWith("rename to ")) {
        renamed = line.slice("rename to ".length).trim();
      }
    }
    const file = path ?? renamed;
    if (file && isCodeFile(file)) out.set(file, [...(out.get(file) ?? []), ...lines]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Which lines are code

/** Tokens that make no line executable on their own: brackets, separators, a type annotation's `:`, `as` / `satisfies`. */
const PUNCTUATION = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.OpenBraceToken, ts.SyntaxKind.CloseBraceToken, ts.SyntaxKind.OpenParenToken, ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.OpenBracketToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.SemicolonToken, ts.SyntaxKind.CommaToken,
  ts.SyntaxKind.ColonToken, ts.SyntaxKind.EndOfFileToken, ts.SyntaxKind.AsKeyword, ts.SyntaxKind.SatisfiesKeyword,
]);

/** Whether a node exists only for the type checker: nothing of it is left at run time. */
function typeOnly(node: ts.Node): boolean {
  if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return true;
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isIndexSignatureDeclaration(node) || ts.isTypeParameterDeclaration(node)) return true;
  if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) return true;
  if ((ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && node.isTypeOnly) return true;
  if (ts.isHeritageClause(node) && node.token === ts.SyntaxKind.ImplementsKeyword) return true;
  // Overload signatures and abstract members have no body.
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) && !node.body) return true;
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node) ?? [];
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return true;
    if (!ts.isClassDeclaration(node) && !ts.isClassExpression(node) && modifiers.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)) return true;
  }
  // Annotations, type arguments, `as T`; `class A extends B` keeps B (isTypeNode excludes it).
  return ts.isTypeNode(node);
}

/** Lines (1-based) of a JS/TS file that hold run-time code: not blank, comment, bracket-only or type-only. */
function jsCodeLines(path: string, source: string): Set<number> {
  const ext = posix.extname(path);
  const kind = ext === ".tsx" ? ts.ScriptKind.TSX : [".ts", ".mts", ".cts"].includes(ext) ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const lines = new Set<number>();
  const visit = (node: ts.Node) => {
    if (typeOnly(node)) return;
    const children = node.getChildren(file);
    if (children.length) {
      for (const child of children) visit(child);
      return;
    }
    if (PUNCTUATION.has(node.kind)) return;
    if (ts.isJsxText(node) && node.containsOnlyTriviaWhiteSpaces) return;
    // A token can span lines (a template literal, JSX text): each line it has text on counts.
    const start = node.getStart(file);
    let line = file.getLineAndCharacterOfPosition(start).line + 1;
    for (const part of source.slice(start, node.getEnd()).split("\n")) {
      if (part.trim()) lines.add(line);
      line++;
    }
  };
  visit(file);
  return lines;
}

/** Lines of a Python, Vue or Svelte file that are not blank, a comment or brackets only (a text rule). */
function textCodeLines(path: string, source: string): Set<number> {
  const comment = path.endsWith(".py") ? /^#/ : /^(\/\/|\/\*|\*|<!--)/;
  const lines = new Set<number>();
  source.split("\n").forEach((text, i) => {
    const t = text.trim();
    if (t && !comment.test(t) && !/^[{}()[\];,]+$/.test(t)) lines.add(i + 1);
  });
  return lines;
}

/**
 * The lines of a file that can count as executable. V8 coverage (c8) reports every line of a
 * loaded file, comments and closing braces included, and Node runs TypeScript with its types
 * blanked out, so interface lines read as executed; this keeps the count to real code for every tool.
 */
export function codeLines(path: string, source: string): Set<number> {
  return /\.[cm]?[jt]sx?$/.test(path) ? jsCodeLines(path, source) : textCodeLines(path, source);
}

// ---------------------------------------------------------------------------------------------
// Reports

/**
 * A path as a coverage report gives it, made repo-relative: `/work/<path>` from the container
 * (the checkout's mount point), a relative path from the step's folder (`packageDir`). Null for
 * anything outside the repository or under node_modules.
 */
export function repoPath(reported: string, packageDir: string, mount = "/work/"): string | null {
  let path = reported.replace(/\\/g, "/").replace(/^file:\/\//, "");
  if (path.startsWith(mount)) path = path.slice(mount.length);
  else if (path.startsWith("/")) return null;
  else path = posix.join(packageDir || ".", path);
  path = posix.normalize(path);
  if (path === "." || path === ".." || path.startsWith("../") || /(^|\/)node_modules\//.test(path)) return null;
  return path;
}

type Position = { line: number; column?: number | null };
type Range = { start: Position; end: Position };
/** One file of an Istanbul `coverage-final.json` (Jest, Vitest, c8). */
export type IstanbulFile = {
  path?: string;
  statementMap: Record<string, Range>;
  s: Record<string, number>;
  fnMap?: Record<string, { loc?: Range }>;
  f?: Record<string, number>;
};

/**
 * Line → count for one Istanbul file. A line is executable when a statement starts on it (the
 * count is the highest of those statements), else when a statement or function spans it (the count
 * is the innermost one's): Istanbul's own line metric credits only a statement's first line, so a
 * fix that edits the middle of a multi-line call would otherwise have nothing executable.
 */
export function istanbulLineCounts(file: IstanbulFile, wanted?: number[]): LineCounts {
  const starts = new Map<number, number>();
  const spans: Array<{ start: number; end: number; size: number; count: number }> = [];
  const add = (range: Range | undefined, count: number, isStatement: boolean) => {
    if (!range?.start?.line || !range.end?.line) return;
    if (isStatement) starts.set(range.start.line, Math.max(starts.get(range.start.line) ?? 0, count));
    spans.push({ start: range.start.line, end: range.end.line, size: range.end.line - range.start.line, count });
  };
  for (const [id, range] of Object.entries(file.statementMap ?? {})) add(range, file.s?.[id] ?? 0, true);
  for (const [id, fn] of Object.entries(file.fnMap ?? {})) add(fn.loc, file.f?.[id] ?? 0, false);
  const last = spans.reduce((max, s) => Math.max(max, s.end), 0);
  const lines = wanted ?? Array.from({ length: last }, (_v, i) => i + 1);
  const counts: LineCounts = new Map();
  for (const line of lines) {
    const started = starts.get(line);
    if (started !== undefined) {
      counts.set(line, started);
      continue;
    }
    let inner: (typeof spans)[number] | null = null;
    for (const span of spans) if (span.start <= line && line <= span.end && (!inner || span.size < inner.size)) inner = span;
    if (inner) counts.set(line, inner.count);
  }
  return counts;
}

/** Repo path → line counts from a `coverage-final.json`; `wanted` limits the work to the changed files and lines. */
export function parseIstanbulReport(json: string, packageDir: string, wanted?: Map<string, number[]>): Map<string, LineCounts> {
  const report = JSON.parse(json) as Record<string, IstanbulFile>;
  const out = new Map<string, LineCounts>();
  for (const [key, file] of Object.entries(report)) {
    const path = repoPath(file.path ?? key, packageDir);
    if (!path || (wanted && !wanted.has(path))) continue;
    out.set(path, istanbulLineCounts(file, wanted?.get(path)));
  }
  return out;
}

/** The repo paths a `coverage-final.json` has, whatever their lines. */
export function istanbulPaths(json: string, packageDir: string): string[] {
  const report = JSON.parse(json) as Record<string, IstanbulFile>;
  return Object.entries(report).map(([key, file]) => repoPath(file.path ?? key, packageDir)).filter((p): p is string => p != null);
}

type CoveragePyJson = { files?: Record<string, { executed_lines?: number[]; missing_lines?: number[] }> };

/** Repo path → line counts from `coverage json` (coverage.py): executed lines count 1, missing ones 0. */
export function parseCoveragePyReport(json: string, packageDir: string): Map<string, LineCounts> {
  const report = JSON.parse(json) as CoveragePyJson;
  if (!report.files || typeof report.files !== "object") throw new Error("no files in the coverage.py report");
  const out = new Map<string, LineCounts>();
  for (const [key, file] of Object.entries(report.files)) {
    const path = repoPath(key, packageDir);
    if (!path) continue;
    const counts: LineCounts = new Map();
    for (const line of file.missing_lines ?? []) counts.set(line, 0);
    for (const line of file.executed_lines ?? []) counts.set(line, 1);
    out.set(path, counts);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Classification

/** `[12,13,14,15,40]` → `12-15,40`. */
export function compactRanges(lines: number[]): string {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j === i ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`);
    i = j;
  }
  return parts.join(",");
}

/**
 * The source files a build-output path can come from: `apps/api/dist/auth/a.js` →
 * `apps/api/src/auth/a` and `apps/api/auth/a` (stems, extension left out), for a `dist`, `build`,
 * `out` or `lib` folder anywhere in the path.
 */
function sourceStems(generated: string): string[] {
  const stem = generated.replace(/\.[cm]?jsx?$/, "");
  const parts = stem.split("/");
  const stems: string[] = [];
  parts.forEach((part, i) => {
    if (!["dist", "build", "out", "lib"].includes(part)) return;
    stems.push([...parts.slice(0, i), "src", ...parts.slice(i + 1)].join("/"), [...parts.slice(0, i), ...parts.slice(i + 1)].join("/"));
  });
  return stems;
}

export type ClassifyInput = {
  /** Changed code file → its changed (post-fix) line numbers: `changedLinesInPatch`. */
  changed: Map<string, number[]>;
  /** Changed file → its code lines (`codeLines`); null or absent when the file could not be read (every line counts). */
  code: Map<string, Set<number> | null>;
  reports: ReportCoverage[];
};

/** The per-file states and totals; the status is set from the reports. See the doc for every rule. */
export function classifyFixCoverage(input: ClassifyInput): FixCoverage {
  const usable = input.reports.filter((r): r is Extract<ReportCoverage, { ok: true }> => r.ok);
  const failed = input.reports.filter((r): r is Extract<ReportCoverage, { ok: false }> => !r.ok);
  const files: FixCoverageFile[] = [];
  for (const path of [...input.changed.keys()].sort()) {
    const changed = input.changed.get(path) ?? [];
    const code = input.code.get(path);
    const lines = code ? changed.filter((l) => code.has(l)) : changed;
    const language = fileLanguage(path);
    const mine = usable.filter((r) => r.language === language);
    const counts: LineCounts = new Map();
    let present = false;
    for (const report of mine) {
      const fileCounts = report.files.get(path);
      if (!fileCounts) continue;
      present = true;
      for (const line of lines) {
        const count = fileCounts.get(line);
        if (count !== undefined) counts.set(line, Math.max(counts.get(line) ?? 0, count));
      }
    }
    const executable = [...counts.keys()];
    const covered = executable.filter((l) => (counts.get(l) ?? 0) > 0);
    const uncovered = compactRanges(executable.filter((l) => !((counts.get(l) ?? 0) > 0)));
    const measured = { executable: executable.length, covered: covered.length, uncovered };
    const unloaded = { executable: null, covered: null, uncovered: null };
    const record = (state: FileState, numbers: typeof measured | typeof unloaded) => files.push({ path, state, changed_lines: changed.length, ...numbers });

    if (covered.length > 0) { record("run", measured); continue; }
    const stem = path.replace(/\.[^./]+$/, "");
    const fromBuild = mine.some((r) => r.generated.some((p) => sourceStems(p).includes(stem)));
    const notMeasured =
      // Nothing the fix adds is code (a rename, deletions only, comments or types): nothing to execute.
      lines.length === 0 ||
      // Loaded, but the tool counts none of the changed lines (the middle of a multi-line Python statement).
      (present && executable.length === 0) ||
      // A report of this language is missing: that step may have run it.
      failed.some((r) => r.language === language) ||
      // Loaded as build output the tool could not map back to this file.
      (!present && fromBuild) ||
      // Vue and Svelte files: not every runner instruments them, so absence proves nothing.
      (!present && mine.length > 0 && /\.(vue|svelte)$/.test(path));
    if (notMeasured) record("not_measured", present ? measured : unloaded);
    else record("not_run", present ? measured : unloaded);
  }

  const run = files.filter((f) => f.state === "run");
  const notMeasured = files.filter((f) => f.state === "not_measured");
  const totals = {
    files_changed: files.length,
    files_run: run.length,
    files_not_run: files.filter((f) => f.state === "not_run").length,
    files_not_measured: notMeasured.length,
    lines_executable: run.reduce((n, f) => n + (f.executable ?? 0), 0),
    lines_covered: run.reduce((n, f) => n + (f.covered ?? 0), 0),
  };
  const tools = [...new Set(usable.map((r) => r.tool))];
  if (!input.reports.length) return unavailableCoverage("no proving test file to run", files.length);
  if (!usable.length) return unavailableCoverage(failed.map((r) => `${r.label}: ${r.reason}`).join("; "), files.length);
  const problems = [
    ...failed.map((r) => `${r.label}: ${r.reason}`),
    ...(notMeasured.length ? [`${notMeasured.length} file(s) not measured`] : []),
  ];
  return { status: problems.length ? "partial" : "measured", ...(problems.length ? { reason: problems.join("; ") } : {}), tools, files, ...totals };
}

/** A coverage result that measured nothing, with its one-line reason. */
export function unavailableCoverage(reason: string, filesChanged = 0): FixCoverage {
  const line = reason.split("\n").map((l) => l.trim()).find(Boolean) ?? "unknown error";
  return {
    status: "unavailable", reason: line.length > 300 ? `${line.slice(0, 299)}…` : line, tools: [], files: [],
    files_changed: filesChanged, files_run: 0, files_not_run: 0, files_not_measured: 0, lines_executable: 0, lines_covered: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// untested_files

/**
 * `untested_files` and how it was made. With coverage measured (or partial): the `not_run` files,
 * plus the `not_measured` files the import rule flags. Without coverage, or unavailable: the
 * import rule's list as is.
 */
export function deriveUntested(coverage: FixCoverage | undefined, importRule: string[]): { untested: string[]; source: UntestedSource } {
  if (!coverage || coverage.status === "unavailable") return { untested: [...importRule].sort(), source: "imports" };
  const flagged = new Set(importRule);
  const notMeasured = coverage.files.filter((f) => f.state === "not_measured");
  const untested = [
    ...coverage.files.filter((f) => f.state === "not_run").map((f) => f.path),
    ...notMeasured.filter((f) => flagged.has(f.path)).map((f) => f.path),
  ];
  return { untested: [...new Set(untested)].sort(), source: notMeasured.length ? "mixed" : "coverage" };
}

/**
 * The result with the coverage recorded and `untested_files` re-derived; nothing else changes.
 * `importRule` null (the post-fix tree could not be read): an unavailable coverage keeps the
 * result's list and source as they were.
 */
export function withFixCoverage<T extends { untested_files?: string[]; untested_files_source?: UntestedSource; fix_coverage?: FixCoverage }>(
  result: T, coverage: FixCoverage, importRule: string[] | null,
): T {
  let untested: string[];
  let source: UntestedSource;
  if (importRule) ({ untested, source } = deriveUntested(coverage, importRule));
  else if (coverage.status === "unavailable") ({ untested, source } = { untested: result.untested_files ?? [], source: result.untested_files_source ?? "imports" });
  else ({ untested, source } = deriveUntested(coverage, []));
  const next: T = { ...result, fix_coverage: coverage, untested_files_source: source };
  if (untested.length) next.untested_files = untested;
  else delete next.untested_files;
  return next;
}

/** The summary cell: `3/5 files, 41/60 lines`, `partial: …`, `unavailable`, or "" without a coverage run. */
export function coverageCell(coverage: FixCoverage | undefined): string {
  if (!coverage) return "";
  if (coverage.status === "unavailable") return "unavailable";
  const text = `${coverage.files_run}/${coverage.files_changed} files, ${coverage.lines_covered}/${coverage.lines_executable} lines`;
  return coverage.status === "partial" ? `partial: ${text}` : text;
}
