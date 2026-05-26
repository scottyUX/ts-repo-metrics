/** Docs-folder path prefixes (case-insensitive). */
export const DOCS_POOL_PREFIXES = [
  "documentation/",
] as const;

export const MAX_DOC_FILES = 40;
export const MAX_PATH_DEPTH = 8;
export const MAX_SINGLE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
]);

export function isDocsPoolPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return DOCS_POOL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function pathDepth(path: string): number {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).length;
}

export function isDocExtension(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

/** Image types sometimes used for release plans / code standards (not reviewable yet). */
export function isSkippedImageExtension(path: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(path);
}
