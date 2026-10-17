export type SubmissionStatus = "submitted" | "grading" | "graded" | "released" | "grading_failed";
export type StaffCourse = { id: string; slug: string; title: string; term: string; assignment_count: number; role: "instructor" | "ta" };

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  submitted: "Queued for grading",
  grading: "Grading",
  graded: "Ready for review",
  grading_failed: "Grading failed",
  released: "Released",
};

/** Fetches JSON, throwing the API's error message (with the HTTP status) on failure. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(body.error ?? `Request failed (${response.status}).`), { status: response.status });
  return body;
}

export function formatPoints(value: number | null | undefined, max?: number): string {
  if (value === null || value === undefined) return "—";
  const text = String(Number(value.toFixed(2)));
  return max === undefined ? text : `${text} / ${max}`;
}
