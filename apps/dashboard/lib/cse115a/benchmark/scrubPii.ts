import type { TaskSnapshot } from "@/lib/cse115a/submissionSnapshot";

// Removes personal information before a task is stored as a benchmark row.
// Text fields are rewritten; code patches are only checked, because editing
// them could stop them applying to base_commit.

export type PersonalIdentifiers = { names: string[]; logins: string[]; emails: string[] };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MENTION = /(^|[^\w@/.])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\b/g;
const MIN_NAME_PART = 3;

// Repo Metrics reports carry per-author activity (keyed by email), GitHub
// logins, and submission metadata. Benchmark rows keep repository-level metrics only.
const PERSONAL_KEYS = new Set([
  "contributors", "_submission", "authorEmail", "authorName", "displayName", "email",
  "login", "github_login", "githubLogin", "avatarUrl", "htmlUrl", "team_name", "user_id", "userId",
]);

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** People known to be connected to a task: the spec's assignee, PR and comment authors, and the submitting student. */
export function identifiersFor(task: TaskSnapshot, studentEmail: string | null): PersonalIdentifiers {
  const emails = [studentEmail].filter((value): value is string => Boolean(value));
  const logins = [task.pr.author, ...task.comments.map((comment) => comment.author)]
    .filter((value): value is string => Boolean(value && value.length >= MIN_NAME_PART));
  const assignee = task.spec.assignee?.trim();
  const names = assignee ? [assignee, ...assignee.split(/[\s,]+/).map((part) => part.replace(/\.$/, ""))] : [];
  // The email's local part is often the student's login or name.
  for (const email of emails) logins.push(email.split("@")[0]!);
  return {
    names: [...new Set(names.filter((name) => name.length >= MIN_NAME_PART))].sort((a, b) => b.length - a.length),
    logins: [...new Set(logins.map((login) => login.toLowerCase()))].sort((a, b) => b.length - a.length),
    emails: [...new Set(emails.map((email) => email.toLowerCase()))],
  };
}

/** Replaces emails, @mentions, known logins, and known names in free text. */
export function scrubText(text: string, ids: PersonalIdentifiers): string {
  let out = text.replace(EMAIL, "[email]").replace(MENTION, "$1@[user]");
  for (const pattern of knownPatterns(ids)) out = out.replace(pattern, pattern.flags.includes("i") ? "[user]" : "[student]");
  return out;
}

/** The task spec with its assignee field blanked, then scrubbed like other text. */
export function scrubSpec(markdown: string, ids: PersonalIdentifiers): string {
  const blanked = markdown.replace(/^(---\s*\n[\s\S]*?^assignee:)[^\n]*$/m, "$1 [student]");
  return scrubText(blanked, ids);
}

function knownPatterns(ids: PersonalIdentifiers): RegExp[] {
  return [
    ...ids.logins.map((login) => new RegExp(`(?<![\\w-])${escape(login)}(?![\\w-])`, "gi")),
    ...ids.names.map((name) => new RegExp(`(?<!\\w)${escape(name)}(?!\\w)`, "g")),
  ];
}

const UCSC_EMAIL = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*ucsc\.edu\b/gi;

/**
 * Scrubs the added lines of a patch. Context and removed lines must match
 * base_commit to apply, and that text is already in the repository, so they
 * are left alone. Replacements stay valid code: known names become `student`,
 * known logins `anon`, and UCSC or known emails `student@example.com`.
 * Test-fixture emails (a@b.co) and decorators (@pytest.mark) are kept.
 */
export function scrubPatch(patch: string, ids: PersonalIdentifiers): { patch: string; changed: boolean } {
  let changed = false;
  const emails = ids.emails.map((email) => new RegExp(escape(email), "gi"));
  const lines = patch.split("\n").map((line) => {
    if (!line.startsWith("+") || line.startsWith("+++ ")) return line;
    let body = line.slice(1).replace(UCSC_EMAIL, "student@example.com");
    for (const pattern of emails) body = body.replace(pattern, "student@example.com");
    for (const pattern of knownPatterns(ids)) body = body.replace(pattern, pattern.flags.includes("i") ? "anon" : "student");
    if (body !== line.slice(1)) changed = true;
    return `+${body}`;
  });
  return { patch: lines.join("\n"), changed };
}

/** Drops per-person fields from a Repo Metrics report and scrubs emails and known identifiers from its strings. */
export function redactPersonalData(value: unknown, ids: PersonalIdentifiers = { names: [], logins: [], emails: [] }): unknown {
  if (typeof value === "string") return ids.names.length || ids.logins.length ? scrubText(value, ids) : value.replace(EMAIL, "[email]");
  if (Array.isArray(value)) return value.map((item) => redactPersonalData(item, ids));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !PERSONAL_KEYS.has(key))
      .map(([key, item]) => [key, redactPersonalData(item, ids)]));
  }
  return value;
}
