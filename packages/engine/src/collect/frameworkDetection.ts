/**
 * Framework detection module.
 *
 * Inspects a repository's package.json to determine the primary framework
 * and runtime. Recognized frameworks: Next.js, React, NestJS, Fastify,
 * Express, and plain Node. Falls back to "Node" if no known framework
 * dependency is found, or returns null if package.json is missing.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FrameworkInfo } from "../types/report.js";

export type { FrameworkInfo } from "../types/report.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Detect the primary framework and runtime of a repository.
 *
 * Reads the target repo's package.json and checks dependencies +
 * devDependencies for known frameworks. Priority order:
 * Next.js > NestJS > Fastify > Express > React > Node.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns Framework classification, or null if no package.json exists.
 */
export async function detectFramework(
  repoPath: string,
): Promise<FrameworkInfo | null> {
  try {
    const raw = await readFile(
      path.join(repoPath, "package.json"),
      "utf8",
    );
    const pkg = JSON.parse(raw) as PackageJson;

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

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
  } catch {
    return null;
  }
}
