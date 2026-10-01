export type TaskSpec = {
  id: string;
  story: string;
  sprint: number;
  assignee: string;
  estimateHours: number;
  title: string;
  description: string;
  specs: string;
  requirements: string;
  acceptanceCriteria: string;
  tests: string;
};

const REQUIRED_SECTIONS = ["Description", "Specs", "Requirements", "Acceptance criteria", "Tests"] as const;

export function parseTaskSpec(markdown: string): TaskSpec {
  if (markdown.length > 65536) throw new Error("The task file is too large to import.");
  const frontMatter = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontMatter) throw new Error("The task file needs YAML front matter.");
  const fields = new Map<string, string>();
  for (const line of frontMatter[1]!.split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (match) fields.set(match[1]!, match[2]!.replace(/^['"]|['"]$/g, ""));
  }
  const title = markdown.slice(frontMatter[0].length).match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
  if (!title) throw new Error("The task file needs a title.");
  const headings = [...markdown.matchAll(/^##\s+(.+)\s*$/gm)];
  const sections = new Map<string, string>();
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!;
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    sections.set(heading[1]!.trim(), markdown.slice(start, end).trim());
  }
  for (const heading of REQUIRED_SECTIONS) {
    if (!sections.get(heading)) throw new Error(`The task file needs a nonempty “${heading}” section.`);
  }
  const id = fields.get("id") ?? "";
  const story = fields.get("story") ?? "";
  const sprint = Number(fields.get("sprint"));
  const assignee = fields.get("assignee") ?? "";
  const estimateHours = Number(fields.get("estimate_hours"));
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(id) || !story || !Number.isInteger(sprint) || sprint < 1 || !assignee || !Number.isFinite(estimateHours)) {
    throw new Error("The task file has missing or invalid id, story, sprint, assignee, or estimate_hours fields.");
  }
  return {
    id, story, sprint, assignee, estimateHours, title,
    description: sections.get("Description")!,
    specs: sections.get("Specs")!,
    requirements: sections.get("Requirements")!,
    acceptanceCriteria: sections.get("Acceptance criteria")!,
    tests: sections.get("Tests")!,
  };
}

export function parsePullRequestUrl(value: string): { owner: string; repo: string; number: number; url: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const match = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/);
    if (!match) return null;
    const number = Number(match[3]);
    if (!Number.isSafeInteger(number) || number < 1) return null;
    return { owner: match[1]!, repo: match[2]!, number, url: `https://github.com/${match[1]}/${match[2]}/pull/${number}` };
  } catch {
    return null;
  }
}
