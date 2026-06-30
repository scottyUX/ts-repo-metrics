import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Monorepo root (directory that contains `packages/engine`), regardless of whether
 * `next dev` was started from `apps/dashboard` or the repo root.
 */
function resolveMonorepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "packages", "engine", "package.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(process.cwd(), "..", "..");
}

const outputFileTracingRoot = resolveMonorepoRoot();

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
  serverExternalPackages: [
    "adm-zip",
    "tree-sitter",
    "tree-sitter-typescript",
    "tree-sitter-javascript",
    "tree-sitter-python",
  ],
};

export default nextConfig;
