/**
 * Framework detection module.
 *
 * Inspects a repository's package.json files to determine the primary
 * framework and runtime. Recognized frameworks: Next.js, React, NestJS,
 * Fastify, Express, and plain Node. Falls back to "Node" if no known
 * framework dependency is found, or returns null if no package.json exists.
 *
 * Reads the root package.json and each one a single folder down
 * (`frontend/`, `web/`, `backend/`), so a monorepo whose React app lives in a
 * subfolder still reports React. Path checks are inline. CodeQL's
 * path-injection query does not follow a helper.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FrameworkInfo } from "../types/report.js";

export type { FrameworkInfo } from "../types/report.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const SKIPPED_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "vendor", "third_party"]);

/** Merged dependencies from every package.json found, or null when there is none. */
async function readAllDependencies(repoPath: string): Promise<Record<string, string> | null> {
  const root = path.resolve(repoPath) + path.sep;
  const dirs = [""];
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) continue;
      if (entry.name.includes("/") || entry.name.includes("\\") || entry.name.includes("..")) continue;
      dirs.push(entry.name);
    }
  } catch {
    // unreadable root
  }
  let found = false;
  const deps: Record<string, string> = {};
  for (const dir of dirs) {
    const target = path.resolve(root, dir, "package.json");
    if (!target.startsWith(root)) continue;
    try {
      const pkg = JSON.parse(await readFile(target, "utf8")) as PackageJson;
      Object.assign(deps, pkg.dependencies, pkg.devDependencies);
      found = true;
    } catch {
      // missing or malformed package.json
    }
  }
  return found ? deps : null;
}

/**
 * Detect the primary framework and runtime of a repository.
 *
 * Checks dependencies + devDependencies across the root and one-level-down
 * package.json files. Priority order: Next.js > NestJS > Fastify > Express >
 * React > Node.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns Framework classification, or null if no package.json exists.
 */
export async function detectFramework(
  repoPath: string,
): Promise<FrameworkInfo | null> {
  const allDeps = await readAllDependencies(repoPath);
  if (!allDeps) return null;

  const has = (name: string) => name in allDeps;

  const hasReact = has("react");
  const hasNext = has("next");
  const hasExpress = has("express");
  const hasNest = has("@nestjs/core");
  const hasFastify = has("fastify");

  const hasBackend = hasExpress || hasNest || hasFastify || hasNext;

  let type = "Node";
  if (hasNext) type = "Next";
  else if (hasNest) type = "NestJS";
  else if (hasFastify) type = "Fastify";
  else if (hasExpress) type = "Express";
  else if (hasReact) type = "React";

  return { type, hasReact, hasBackend };
}
