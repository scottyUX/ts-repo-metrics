/**
 * Git history across all refs can hold the same work twice: a rebased branch
 * next to its old copy, GitHub "Rebase and merge" next to an undeleted feature
 * branch, or a cherry-pick. Those copies get new hashes but keep the author,
 * the author time, and the subject, so that triple identifies one change.
 */

export function commitIdentityKey(
  authorEmail: string,
  authorTimeSec: number,
  subject: string,
): string {
  return `${authorEmail.trim().toLowerCase()}\u0000${authorTimeSec}\u0000${subject.trim()}`;
}

/** Keep the first commit of each identity, in the order given. */
export function uniqueCommits<T>(commits: T[], identity: (c: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of commits) {
    const key = identity(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
