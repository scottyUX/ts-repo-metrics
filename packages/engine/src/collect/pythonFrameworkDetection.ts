/**
 * Detect Python web frameworks we do not analyze (web2py, Django).
 *
 * Used to skip static analysis early and return user-facing feedback.
 * Flask/FastAPI-style repos are not flagged.
 */

import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { UnsupportedFrameworkInfo } from "../types/report.js";

export type { UnsupportedFrameworkInfo } from "../types/report.js";

const UNSUPPORTED_MESSAGES = {
  web2py:
    "This repository uses web2py. Static code analysis is not supported for web2py projects yet.",
  django:
    "This repository uses Django. Static code analysis is not supported for Django projects yet.",
} as const;

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function fileContainsDjango(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf8");
    return /\bdjango\b/i.test(content);
  } catch {
    return false;
  }
}

async function djangoDependencyFiles(repoPath: string): Promise<string[]> {
  const files = [
    path.join(repoPath, "requirements.txt"),
    path.join(repoPath, "pyproject.toml"),
  ];
  const requirementsDir = path.join(repoPath, "requirements");
  if (await pathExists(requirementsDir)) {
    const entries = await readdir(requirementsDir);
    for (const name of entries) {
      if (name.endsWith(".txt")) {
        files.push(path.join(requirementsDir, name));
      }
    }
  }
  return files;
}

async function detectWeb2py(repoPath: string): Promise<boolean> {
  return (
    (await pathExists(path.join(repoPath, "web2py", "gluon"))) ||
    (await pathExists(path.join(repoPath, "web2py", "applications"))) ||
    (await pathExists(path.join(repoPath, "web2py.py")))
  );
}

async function detectDjango(repoPath: string): Promise<boolean> {
  if (!(await pathExists(path.join(repoPath, "manage.py")))) {
    return false;
  }
  for (const filePath of await djangoDependencyFiles(repoPath)) {
    if (await fileContainsDjango(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Return unsupported-framework info when the repo layout matches web2py or Django.
 * web2py is checked first when both could match.
 */
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
