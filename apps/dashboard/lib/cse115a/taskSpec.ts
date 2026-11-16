/** The fewest parts a task ID may have. 2 refuses one-part IDs such as "3" (open for Scott, #388). */
export const TASK_ID_MIN_PARTS = 2;

/** A task ID: letters and digits in TASK_ID_MIN_PARTS or more parts joined by "-", "." or "_" (US-1-T-1, US-2.3-T-2, 3_2_1). */
export const TASK_ID_PATTERN = `[A-Za-z0-9]+(?:[-._][A-Za-z0-9]+){${TASK_ID_MIN_PARTS - 1},}`;

const ID_CHARACTERS = 'Use only letters, digits, "-", "." and "_".';

/**
 * What is wrong with a task ID, or null when it is valid. Null exactly when ^TASK_ID_PATTERN$ matches;
 * the first problem found is the one named.
 */
export function taskIdProblem(id: string): string | null {
  if (!id) return "The front matter needs an id.";
  if (/\s/.test(id)) return `The task ID “${id}” has a space. ${ID_CHARACTERS}`;
  const other = id.match(/[^A-Za-z0-9._-]/u);
  if (other) return `The task ID “${id}” has the character “${other[0]}”. ${ID_CHARACTERS}`;
  if (/^[-._]|[-._]$|[-._]{2}/.test(id)) {
    return `The task ID “${id}” must be letters and digits joined by single "-", "." or "_", for example US-1-T-1.`;
  }
  if (id.split(/[-._]/).length < TASK_ID_MIN_PARTS) {
    return `The task ID “${id}” has only one part. Use two or more parts joined by "-", "." or "_", for example US-3-T-1.`;
  }
  return null;
}

/** Whether a task file's name fits its ID. A name may use "_" where the ID has "." (3_2_1.md for 3.2.1). */
export function filenameMatchesId(filenameId: string, id: string): boolean {
  return filenameId === id || filenameId.replace(/_/g, ".") === id.replace(/_/g, ".");
}

/** Whether a path is a task file for this sprint: docs/tasks/sprint-N/<task ID>.md. */
export function isTaskFilePath(path: string, sprint: number): boolean {
  return new RegExp(`^docs/tasks/sprint-${sprint}/${TASK_ID_PATTERN}\\.md$`, "i").test(path);
}

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
};

const REQUIRED_SECTIONS = ["Description", "Specs", "Requirements", "Acceptance criteria"] as const;

/** A heading in comparable form: lower case, single spaces, no trailing colon. */
function normalizeHeading(heading: string): string {
  return heading.toLowerCase().replace(/\s+/g, " ").replace(/\s*:$/, "").trim();
}

/** Whether two strings differ by at most one inserted, deleted or changed character. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * A required section's text. An exact heading wins; otherwise one that differs only in case, spacing,
 * a trailing colon, or one typo (Acceptance Critera). Several close headings count as none.
 */
function findSection(sections: Map<string, string>, heading: string): string | undefined {
  const exact = sections.get(heading);
  if (exact) return exact;
  const wanted = normalizeHeading(heading);
  const close = [...sections].filter(([name]) => withinOneEdit(normalizeHeading(name), wanted));
  return close.length === 1 ? close[0]![1] : undefined;
}

/**
 * The task file with each required heading spelled exactly where the file has a near miss that
 * findSection would accept (## Acceptance Critera → ## Acceptance criteria), so stored copies and
 * benchmark records use the standard names. `renamed` lists each change as "old → new".
 */
export function canonicalHeadings(markdown: string): { markdown: string; renamed: string[] } {
  const names = [...markdown.matchAll(/^##\s+(.+)\s*$/gm)].map((m) => m[1]!.trim());
  const renamed: string[] = [];
  let out = markdown;
  for (const heading of REQUIRED_SECTIONS) {
    if (names.includes(heading)) continue;
    const close = names.filter((name) => withinOneEdit(normalizeHeading(name), normalizeHeading(heading)));
    if (close.length !== 1) continue;
    const escaped = close[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`^##[ \\t]+${escaped}[ \\t]*(\\r?)$`, "m"), `## ${heading}$1`);
    renamed.push(`${close[0]} → ${heading}`);
  }
  return { markdown: out, renamed };
}

/** The file's id and sprint as written, for the checks that compare them with the file name and assignment. */
export type TaskSpecCheck = { spec: TaskSpec | null; problems: string[]; id: string; sprint: number };

/** Every problem with a task file, in a fixed order, and the parsed task when there are none. */
export function checkTaskSpec(markdown: string): TaskSpecCheck {
  if (markdown.length > 65536) return { spec: null, problems: ["The task file is too large to import."], id: "", sprint: Number.NaN };
  const problems: string[] = [];
  const frontMatter = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontMatter) problems.push("The task file needs YAML front matter.");
  const fields = new Map<string, string>();
  for (const line of frontMatter?.[1]!.split(/\r?\n/) ?? []) {
    const match = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (match) fields.set(match[1]!, match[2]!.replace(/^['"]|['"]$/g, ""));
  }
  const title = markdown.slice(frontMatter?.[0].length ?? 0).match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
  if (!title) problems.push("The task file needs a title.");
  const headings = [...markdown.matchAll(/^##\s+(.+)\s*$/gm)];
  const sections = new Map<string, string>();
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]!;
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    sections.set(heading[1]!.trim(), markdown.slice(start, end).trim());
  }
  const found = new Map<string, string>();
  for (const heading of REQUIRED_SECTIONS) {
    const body = findSection(sections, heading);
    if (body) found.set(heading, body);
    else problems.push(`The task file needs a nonempty “${heading}” section.`);
  }
  const id = fields.get("id") ?? "";
  const story = fields.get("story") ?? "";
  const sprint = Number(fields.get("sprint"));
  const assignee = fields.get("assignee") ?? "";
  const estimateHours = Number(fields.get("estimate_hours"));
  if (frontMatter) {
    const idProblem = taskIdProblem(id);
    if (idProblem) problems.push(idProblem);
    if (!story) problems.push("The front matter needs a story.");
    if (!Number.isInteger(sprint) || sprint < 1) problems.push("The front matter needs a sprint number (a whole number, 1 or more).");
    if (!assignee) problems.push("The front matter needs an assignee.");
    if (!Number.isFinite(estimateHours)) problems.push("The front matter needs estimate_hours as a number.");
  }
  if (problems.length > 0 || !title) return { spec: null, problems, id, sprint };
  return {
    spec: {
      id, story, sprint, assignee, estimateHours, title,
      description: found.get("Description")!,
      specs: found.get("Specs")!,
      requirements: found.get("Requirements")!,
      acceptanceCriteria: found.get("Acceptance criteria")!,
    },
    problems, id, sprint,
  };
}

/** The parsed task file; throws every problem, one per line. */
export function parseTaskSpec(markdown: string): TaskSpec {
  const { spec, problems } = checkTaskSpec(markdown);
  if (problems.length > 0 || !spec) throw new Error(problems.join("\n"));
  return spec;
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
