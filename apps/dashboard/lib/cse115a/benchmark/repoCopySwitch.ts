// The server setting that turns on the website's repo copies (#298): at Submit (jobs/runner.ts) and
// from the instructor Benchmark page. Only the exact value "on" turns them on; anything else, or
// unset, leaves the site as it was. Reading which tasks already have a copy works either way.

export const REPO_COPIES_SETTING = "CSE115A_REPO_COPIES";

export function repoCopiesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[REPO_COPIES_SETTING] === "on";
}

export const REPO_COPIES_OFF_MESSAGE = `Repo copies are off on this site. Set ${REPO_COPIES_SETTING}=on in the site's settings to turn them on.`;
