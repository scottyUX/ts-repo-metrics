/**
 * Detect Python web frameworks we do not analyze (web2py, Django).
 * A match skips the whole repository, including JavaScript and TypeScript.
 * Detection is repo-root only: backend/manage.py, Pipfile, setup.py, and
 * setup.cfg are not checked. A pyproject.toml comment containing "django"
 * does trigger the skip.
 *
 * Path checks are inline. CodeQL's path-injection query does not follow a helper.
 */

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface UnsupportedFrameworkInfo {
  id: "web2py" | "django";
  message: string;
}

const UNSUPPORTED_MESSAGES = {
  web2py:
    "This repository uses web2py. Static code analysis is not supported for web2py projects yet.",
  django:
    "This repository uses Django. Static code analysis is not supported for Django projects yet.",
} as const;

async function pathExists(repoPath: string, rel: string): Promise<boolean> {
  const root = path.resolve(repoPath) + path.sep;
  const target = path.resolve(root, rel);
  if (!target.startsWith(root)) return false;
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function fileContainsDjango(repoPath: string, rel: string): Promise<boolean> {
  const root = path.resolve(repoPath) + path.sep;
  const target = path.resolve(root, rel);
  if (!target.startsWith(root)) return false;
  try {
    const content = await readFile(target, "utf8");
    return /\bdjango\b/i.test(content);
  } catch {
    return false;
  }
}

async function djangoDependencyRels(repoPath: string): Promise<string[]> {
  const rels = ["requirements.txt", "pyproject.toml"];
  const root = path.resolve(repoPath) + path.sep;
  const requirementsDir = path.resolve(root, "requirements");
  if (!requirementsDir.startsWith(root)) return rels;
  try {
    const entries = await readdir(requirementsDir);
    for (const name of entries) {
      if (name.includes("/") || name.includes("\\") || name.includes("..")) continue;
      if (!name.endsWith(".txt")) continue;
      const filePath = path.resolve(requirementsDir, name);
      if (!filePath.startsWith(root)) continue;
      rels.push(path.relative(path.resolve(repoPath), filePath).replace(/\\/g, "/"));
    }
  } catch {
    // requirements/ is optional
  }
  return rels;
}

async function detectWeb2py(repoPath: string): Promise<boolean> {
  return (
    (await pathExists(repoPath, "web2py/gluon")) ||
    (await pathExists(repoPath, "web2py/applications")) ||
    (await pathExists(repoPath, "web2py.py"))
  );
}

async function detectDjango(repoPath: string): Promise<boolean> {
  if (!(await pathExists(repoPath, "manage.py"))) {
    return false;
  }
  for (const rel of await djangoDependencyRels(repoPath)) {
    if (await fileContainsDjango(repoPath, rel)) {
      return true;
    }
  }
  return false;
}

export async function detectUnsupportedPythonFramework(
  repoPath: string,
): Promise<UnsupportedFrameworkInfo | null> {
  if (await detectWeb2py(repoPath)) {
    return { id: "web2py", message: UNSUPPORTED_MESSAGES.web2py };
  }
  if (await detectDjango(repoPath)) {
    return { id: "django", message: UNSUPPORTED_MESSAGES.django };
  }
  return null;
}
