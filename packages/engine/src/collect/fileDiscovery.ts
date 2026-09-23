/**
 * File discovery module.
 *
 * Recursively finds TypeScript, JavaScript, and JSX source files within a
 * repository. Common non-source directories, minified bundles, config files,
 * and compiled emit sitting next to TypeScript are excluded.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import {
  SOURCE_PATTERNS,
  IGNORE_PATTERNS,
  isAnalyzableSourcePath,
} from "../utils/constants.js";

function toRepoRelative(repoPath: string, absOrRel: string): string {
  const abs = path.isAbsolute(absOrRel)
    ? absOrRel
    : path.resolve(repoPath, absOrRel);
  return path.relative(repoPath, abs).replace(/\\/g, "/");
}

/**
 * True when this JavaScript file is compiled emit next to a TypeScript source
 * with the same stem. `foo.js` next to `foo.d.ts` is kept: that stem is `foo.d`.
 */
function isEmitSibling(
  rel: string,
  siblingExists: (siblingRel: string) => boolean,
): boolean {
  const normalized = rel.replace(/\\/g, "/");
  const ext = path.posix.extname(normalized);
  const stem = normalized.slice(0, -ext.length);
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return siblingExists(`${stem}.ts`) || siblingExists(`${stem}.tsx`);
  }
  if (ext === ".jsx") {
    return siblingExists(`${stem}.tsx`);
  }
  return false;
}

/**
 * Discover source files in a repository.
 *
 * @param repoPath - Absolute path to the repository root.
 * @param includePaths - Optional repo-relative allow-list (PR changed files).
 * @returns Array of absolute file paths.
 */
export async function discoverSourceFiles(
  repoPath: string,
  includePaths?: string[],
) {
  if (includePaths) {
    // Inline prefix check: CodeQL's path-injection query does not follow a helper.
    const root = path.resolve(repoPath) + path.sep;
    const out: string[] = [];
    for (const rel of includePaths) {
      const normalized = rel.replace(/\\/g, "/");
      if (!isAnalyzableSourcePath(normalized)) continue;
      const abs = path.resolve(root, normalized);
      if (!abs.startsWith(root)) continue;
      if (!existsSync(abs)) continue;
      if (
        isEmitSibling(normalized, (sibling) => {
          const siblingAbs = path.resolve(root, sibling);
          if (!siblingAbs.startsWith(root)) return false;
          return existsSync(siblingAbs);
        })
      ) {
        continue;
      }
      out.push(abs);
    }
    return out;
  }

  const found = await fg(SOURCE_PATTERNS, {
    cwd: repoPath,
    absolute: true,
    ignore: IGNORE_PATTERNS,
  });
  const kept = new Set<string>();
  for (const abs of found) {
    const rel = toRepoRelative(repoPath, abs);
    if (isAnalyzableSourcePath(rel)) kept.add(rel);
  }
  const out: string[] = [];
  for (const rel of kept) {
    if (isEmitSibling(rel, (sibling) => kept.has(sibling))) continue;
    out.push(path.resolve(repoPath, rel));
  }
  return out;
}
