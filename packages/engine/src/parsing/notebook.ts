/**
 * Jupyter notebook source extraction.
 *
 * Joins code cells into one Python source so the Python grammar and
 * extractors run unchanged. Markdown cells and outputs are dropped. IPython
 * magics (`%`, `%%`, `!`) are blanked rather than removed so line numbers
 * still map back to their cell.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface NotebookSource {
  code: string;
  /** 1-based line in `code` where each code cell starts, in cell order. */
  cellStartLines: number[];
}

interface NotebookJson {
  cells?: { cell_type?: string; source?: string | string[] }[];
}

function cellText(source: string | string[] | undefined): string {
  if (Array.isArray(source)) return source.join("");
  return typeof source === "string" ? source : "";
}

/** Blank IPython-only lines; a `%%` cell magic makes the whole cell non-Python. */
function stripMagics(lines: string[]): string[] {
  if (lines[0]?.trimStart().startsWith("%%")) return lines.map(() => "");
  return lines.map((line) => {
    const t = line.trimStart();
    return t.startsWith("%") || t.startsWith("!") ? "" : line;
  });
}

/**
 * Extract code cells from notebook JSON text.
 *
 * @throws When the text is not a notebook JSON object.
 */
export function extractNotebookSource(json: string): NotebookSource {
  const nb = JSON.parse(json) as NotebookJson;
  if (!nb || typeof nb !== "object" || !Array.isArray(nb.cells)) {
    throw new Error("not a Jupyter notebook");
  }
  const out: string[] = [];
  const cellStartLines: number[] = [];
  for (const cell of nb.cells) {
    if (cell.cell_type !== "code") continue;
    const text = cellText(cell.source).replace(/\r\n/g, "\n");
    const lines = stripMagics(text.replace(/\n$/, "").split("\n"));
    cellStartLines.push(out.length + 1);
    out.push(...lines, "");
  }
  return { code: out.join("\n"), cellStartLines };
}

/** 1-based cell index for a 1-based line in the joined code. */
export function notebookCellForLine(cellStartLines: number[], line: number): number {
  let cell = 0;
  for (let i = 0; i < cellStartLines.length; i++) {
    if ((cellStartLines[i] ?? Infinity) <= line) cell = i + 1;
    else break;
  }
  return Math.max(cell, 1);
}

export function isNotebookPath(filePath: string): boolean {
  return filePath.endsWith(".ipynb");
}

/**
 * Source text as the analyzers see it: code cells for notebooks, the raw file otherwise.
 * `filePath` must resolve inside `repoPath`; the prefix check is inline because
 * CodeQL's path-injection query does not follow a helper.
 *
 * @throws On read errors, a path outside the repo, or a malformed notebook.
 */
export async function readAnalyzableSource(
  repoPath: string,
  filePath: string,
): Promise<{
  code: string;
  cellStartLines?: number[];
}> {
  const root = path.resolve(repoPath) + path.sep;
  const target = path.resolve(root, path.relative(root, filePath));
  if (!target.startsWith(root)) throw new Error("path is outside the repository");
  const raw = await readFile(target, "utf8");
  if (!isNotebookPath(filePath)) return { code: raw };
  return extractNotebookSource(raw);
}
