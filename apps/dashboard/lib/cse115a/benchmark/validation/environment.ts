// Decides how to install and test a student repository from its package.json and lockfile.
// First batch: Vitest with npm or the npm-compatible lockfiles. Anything else is reported as
// `env_unsupported` with the reason, so the batch lists it instead of guessing. Pure: takes
// file contents, touches nothing. Rules are in docs/CSE115A_BENCHMARK_VALIDATION.md, "Environment".

export type Environment = {
  supported: true;
  runner: "vitest";
  packageManager: "npm" | "pnpm" | "yarn";
  installCommand: string;
  /** Writes a Vitest JSON report to $REPORT (set by the container script). */
  testCommand: string;
  /** Dockerfile text that reproduces the environment, stored on the row as `image` provenance. */
  dockerfile: string;
  image: string;
};

export type Unsupported = { supported: false; reason: "env_unsupported"; detail: string };

export type RepoFiles = {
  packageJson: string | null;
  /** Which lockfiles exist at the repo root. */
  lockfiles: Array<"package-lock.json" | "pnpm-lock.yaml" | "yarn.lock" | "bun.lockb" | "bun.lock">;
};

const IMAGE = "node:22-bookworm";

function hasDependency(pkg: Record<string, unknown>, name: string): boolean {
  for (const key of ["dependencies", "devDependencies"]) {
    const deps = pkg[key];
    if (deps && typeof deps === "object" && name in (deps as Record<string, unknown>)) return true;
  }
  return false;
}

/** Install command and the Dockerfile line that puts the package manager in the image. */
function packageManagerFor(files: RepoFiles): { packageManager: Environment["packageManager"]; installCommand: string; enable: string } | Unsupported {
  if (files.lockfiles.includes("bun.lockb") || files.lockfiles.includes("bun.lock")) {
    return { supported: false, reason: "env_unsupported", detail: "bun lockfile; bun is not installed in the image" };
  }
  if (files.lockfiles.includes("pnpm-lock.yaml")) return { packageManager: "pnpm", installCommand: "corepack enable && pnpm install --frozen-lockfile", enable: "RUN corepack enable" };
  if (files.lockfiles.includes("yarn.lock")) return { packageManager: "yarn", installCommand: "corepack enable && yarn install --immutable", enable: "RUN corepack enable" };
  if (files.lockfiles.includes("package-lock.json")) return { packageManager: "npm", installCommand: "npm ci", enable: "" };
  return { packageManager: "npm", installCommand: "npm install", enable: "" };
}

/**
 * Reads package.json and the lockfile list and returns the commands, or why the repo can't be
 * validated yet. Vitest is detected from devDependencies/dependencies, not from the test script,
 * because students often leave the default `"test": "echo ..."` script in place.
 */
export function detectEnvironment(files: RepoFiles): Environment | Unsupported {
  if (!files.packageJson) return { supported: false, reason: "env_unsupported", detail: "no package.json at the repository root" };
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(files.packageJson) as Record<string, unknown>;
  } catch {
    return { supported: false, reason: "env_unsupported", detail: "package.json is not valid JSON" };
  }
  if (!hasDependency(pkg, "vitest")) {
    const detail = hasDependency(pkg, "jest") ? "jest; only vitest is supported in the first batch" : "no vitest dependency";
    return { supported: false, reason: "env_unsupported", detail };
  }
  const pm = packageManagerFor(files);
  if ("supported" in pm) return pm;
  const testCommand = "npx vitest run --reporter=json --outputFile=$REPORT --passWithNoTests";
  const dockerfile = [`FROM ${IMAGE}`, pm.enable, "WORKDIR /work", `# ${pm.installCommand}`, `# ${testCommand}`].filter(Boolean).join("\n") + "\n";
  return { supported: true, runner: "vitest", packageManager: pm.packageManager, installCommand: pm.installCommand, testCommand, dockerfile, image: IMAGE };
}
