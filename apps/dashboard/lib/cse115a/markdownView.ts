// A small markdown reader for the staff review page's task spec (#440). Students wrote this text, so it is parsed
// into plain data here and drawn as React elements by MarkdownView.tsx, never as HTML: raw HTML in the markdown stays
// text, only http, https and mailto links are clickable, and images are never loaded. It covers what task files use:
// front matter, headings, paragraphs, lists, block quotes, fenced and indented code, tables, rules, and inline code,
// bold, italic, links and images. Client-safe: no imports.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  /** `href` is the address when it is safe to open (safeHref), else null and the link is shown as text. */
  | { kind: "link"; href: string | null; address: string; children: Inline[] }
  /** Never loaded: the page shows the alt text and the address (a link when safe). */
  | { kind: "image"; alt: string; href: string | null; address: string }
  | { kind: "break" };

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: Block[][] }
  | { kind: "quote"; children: Block[] }
  | { kind: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { kind: "rule" };

export type FrontMatterField = { key: string; value: string };
export type ParsedMarkdown = { frontMatter: FrontMatterField[] | null; blocks: Block[] };

/** The only schemes a link may open. Anything else (javascript:, data:, vbscript:, file:, …) is shown as text. */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * The address a link may open, or null. Only absolute http, https and mailto addresses: a relative or
 * scheme-less address would open inside this site, and every other scheme can run code or read files. Control
 * characters and whitespace that browsers strip inside a scheme ("java\tscript:") are refused outright.
 */
export function safeHref(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed || /[\u0000-\u001f\u007f\s]/.test(trimmed)) return null;
  const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1];
  if (!scheme || !SAFE_SCHEMES.has(`${scheme.toLowerCase()}:`)) return null;
  try {
    const url = new URL(trimmed);
    return SAFE_SCHEMES.has(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

// ---- Front matter ----

/** The same front matter checkTaskSpec reads: a `---` block at the very top. */
const FRONT_MATTER = /^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * The front matter as `key: value` fields in file order. A YAML list under a key (`- a` lines) is joined with ", ".
 * A line that is neither is kept with an empty key, so nothing the student wrote is hidden.
 */
export function parseFrontMatter(body: string): FrontMatterField[] {
  const fields: FrontMatterField[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const field = line.match(/^([A-Za-z0-9_][A-Za-z0-9_ .-]*?)\s*:\s*(.*?)\s*$/);
    const item = line.match(/^\s+-\s+(.*?)\s*$|^-\s+(.*?)\s*$/);
    const last = fields[fields.length - 1];
    if (field && !/^\s/.test(line)) {
      fields.push({ key: field[1]!, value: unquote(field[2]!) });
    } else if (item && last) {
      const value = unquote(item[1] ?? item[2] ?? "");
      last.value = last.value ? `${last.value}, ${value}` : value;
    } else if (/^\s/.test(line) && last) {
      last.value = last.value ? `${last.value} ${line.trim()}` : line.trim();
    } else {
      fields.push({ key: "", value: line.trim() });
    }
  }
  return fields;
}

function unquote(value: string): string {
  return value.replace(/^(['"])(.*)\1$/, "$2");
}

// ---- Blocks ----

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const BULLET = /^( {0,3})([-*+])([ \t]+|$)(.*)$/;
const ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)(.*)$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function listMarker(line: string): { indent: number; ordered: boolean; start: number; marker: string; contentIndent: number; first: string } | null {
  const bullet = line.match(BULLET);
  if (bullet) {
    const [, lead, marker, space, rest] = bullet;
    return { indent: lead!.length, ordered: false, start: 1, marker: marker!, contentIndent: lead!.length + 1 + Math.min(space!.length || 1, 4), first: rest! };
  }
  const ordered = line.match(ORDERED);
  if (ordered) {
    const [, lead, digits, close, space, rest] = ordered;
    return { indent: lead!.length, ordered: true, start: Number(digits), marker: close!, contentIndent: lead!.length + digits!.length + 1 + Math.min(space!.length || 1, 4), first: rest! };
  }
  return null;
}

function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === "\\" && text[index + 1] === "|") { current += "|"; index++; continue; }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) { cells.push(current.trim()); current = ""; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function isTableStart(lines: string[], index: number): boolean {
  const head = lines[index];
  const delimiter = lines[index + 1];
  if (head === undefined || delimiter === undefined || !head.includes("|") || !TABLE_DELIMITER.test(delimiter)) return false;
  return splitRow(head).length === splitRow(delimiter).length;
}

/** Whether a line starts a block that ends a paragraph. */
function interrupts(lines: string[], index: number): boolean {
  const line = lines[index]!;
  if (FENCE.test(line) || ATX.test(line) || RULE.test(line) || QUOTE.test(line)) return true;
  const marker = listMarker(line);
  if (marker && marker.first.trim() !== "" && (!marker.ordered || marker.start === 1)) return true;
  return isTableStart(lines, index);
}

/** Removes up to `width` columns of leading spaces (a tab counts as four). */
function dedent(line: string, width: number): string {
  let removed = 0;
  let index = 0;
  while (index < line.length && removed < width) {
    if (line[index] === " ") removed += 1;
    else if (line[index] === "\t") removed += 4;
    else break;
    index++;
  }
  return line.slice(index);
}

/** How deep lists, quotes and emphasis may nest; deeper text is shown as it is written, so no input can overflow the stack. */
export const MAX_NESTING = 16;

function parseBlocks(lines: string[], depth = 0): Block[] {
  if (depth >= MAX_NESTING) {
    const text = lines.join("\n").trim();
    return text ? [{ kind: "paragraph", children: [{ kind: "text", text }] }] : [];
  }
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (isBlank(line)) { index++; continue; }

    const fence = line.match(FENCE);
    if (fence) {
      const [, open, lang] = fence;
      const indent = line.length - line.trimStart().length;
      const body: string[] = [];
      index++;
      while (index < lines.length) {
        const closing = lines[index]!.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
        if (closing && closing[1]![0] === open![0] && closing[1]!.length >= open!.length) { index++; break; }
        body.push(dedent(lines[index]!, indent));
        index++;
      }
      blocks.push({ kind: "code", lang: lang ?? "", text: body.join("\n") });
      continue;
    }

    const atx = line.match(ATX);
    if (atx) {
      blocks.push({ kind: "heading", level: atx[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, children: parseInline(atx[2] ?? "") });
      index++;
      continue;
    }

    if (RULE.test(line)) { blocks.push({ kind: "rule" }); index++; continue; }

    if (/^( {4}|\t)/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && (/^( {4}|\t)/.test(lines[index]!) || isBlank(lines[index]!))) {
        body.push(dedent(lines[index]!, 4));
        index++;
      }
      while (body.length && isBlank(body[body.length - 1]!)) body.pop();
      blocks.push({ kind: "code", lang: "", text: body.join("\n") });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (index < lines.length && !isBlank(lines[index]!)) {
        const current = lines[index]!;
        if (QUOTE.test(current)) body.push(current.replace(QUOTE, ""));
        else if (body.length && !interrupts(lines, index)) body.push(current); // a lazy continuation line
        else break;
        index++;
      }
      blocks.push({ kind: "quote", children: parseBlocks(body, depth + 1) });
      continue;
    }

    const marker = listMarker(line);
    if (marker) {
      const items: Block[][] = [];
      let current = marker;
      while (true) {
        const body: string[] = [current.first];
        index++;
        while (index < lines.length) {
          const next = lines[index]!;
          if (isBlank(next)) {
            // A blank line stays in the item only when the item goes on, indented, after it.
            let ahead = index;
            while (ahead < lines.length && isBlank(lines[ahead]!)) ahead++;
            const following = lines[ahead];
            if (following === undefined || following.search(/\S/) < current.contentIndent) break;
            for (; index < ahead; index++) body.push("");
            continue;
          }
          const indent = next.search(/\S/);
          if (indent >= current.contentIndent) { body.push(dedent(next, current.contentIndent)); index++; continue; }
          const sibling = listMarker(next);
          if (sibling) break;
          if (interrupts(lines, index)) break;
          body.push(next.trim()); // a lazy continuation of the item's paragraph
          index++;
        }
        items.push(parseBlocks(body, depth + 1));
        const next = index < lines.length ? listMarker(lines[index]!) : null;
        if (!next || next.ordered !== marker.ordered || next.marker !== marker.marker || next.indent > marker.indent + 3) break;
        current = next;
      }
      blocks.push({ kind: "list", ordered: marker.ordered, start: marker.start, items });
      continue;
    }

    if (isTableStart(lines, index)) {
      const head = splitRow(line);
      const align = splitRow(lines[index + 1]!).map((cell): Align => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "right" : left ? "left" : null;
      });
      index += 2;
      const rows: Inline[][][] = [];
      while (index < lines.length && !isBlank(lines[index]!) && lines[index]!.includes("|")) {
        const cells = splitRow(lines[index]!);
        rows.push(head.map((_, column) => parseInline(cells[column] ?? "")));
        index++;
      }
      blocks.push({ kind: "table", align, head: head.map((cell) => parseInline(cell)), rows });
      continue;
    }

    // A paragraph, or a setext heading when it is underlined with === or ---.
    const body: string[] = [line.trim()];
    index++;
    let setext: 1 | 2 | null = null;
    while (index < lines.length && !isBlank(lines[index]!)) {
      const underline = lines[index]!.match(SETEXT);
      if (underline) { setext = underline[1]![0] === "=" ? 1 : 2; index++; break; }
      if (interrupts(lines, index)) break;
      body.push(lines[index]!.replace(/^[ \t]+/, ""));
      index++;
    }
    const text = body.join("\n");
    blocks.push(setext ? { kind: "heading", level: setext, children: parseInline(text) } : { kind: "paragraph", children: parseInline(text) });
  }
  return blocks;
}

// ---- Inline ----

const PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/**
 * Where each code span and each bracket closes, worked out once per piece of inline text so no lookup scans ahead
 * again: a spec of thousands of stray backticks, brackets or asterisks still parses in linear time.
 * `code`: a code span's opening backtick run start → its closing run start (CommonMark: the next run of the same
 * length). `bracket`: a `[` → its matching `]`, outside code spans and escapes.
 */
type InlineIndex = { code: Map<number, number>; bracket: Map<number, number> };

function escaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let at = index - 1; at >= 0 && text[at] === "\\"; at--) slashes++;
  return slashes % 2 === 1;
}

function indexInline(text: string): InlineIndex {
  const runs: Array<{ start: number; length: number }> = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "`") continue;
    let end = index;
    while (text[end] === "`") end++;
    if (!escaped(text, index)) runs.push({ start: index, length: end - index });
    index = end - 1;
  }
  // The next run of the same length after each run, from a single pass backwards.
  const nextSame = new Array<number>(runs.length).fill(-1);
  const seen = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index--) {
    nextSame[index] = seen.get(runs[index]!.length) ?? -1;
    seen.set(runs[index]!.length, index);
  }
  const code = new Map<number, number>();
  for (let index = 0; index < runs.length;) {
    const close = nextSame[index]!;
    if (close === -1) { index++; continue; }
    code.set(runs[index]!.start, runs[close]!.start);
    index = close + 1;
  }
  const bracket = new Map<number, number>();
  const open: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === "\\") { index++; continue; }
    if (char === "`") {
      const close = code.get(index);
      let end = index;
      while (text[end] === "`") end++;
      index = close === undefined ? end - 1 : close + (end - index) - 1;
      continue;
    }
    if (char === "[") open.push(index);
    else if (char === "]" && open.length) bracket.set(open.pop()!, index);
  }
  return { code, bracket };
}

/** The longest `(address "title")` read after a `]`, so text full of `[a](` is not scanned to its end again and again. */
const MAX_DESTINATION = 2048;

/** `(address "title")` right after a `]`: the address and where it ends, or null. */
function linkDestination(whole: string, from: number): { address: string; end: number } | null {
  if (whole[from] !== "(") return null;
  // Indexes stay those of `whole`; the text is only cut short.
  const text = whole.slice(0, from + MAX_DESTINATION);
  let index = from + 1;
  while (text[index] === " " || text[index] === "\t" || text[index] === "\n") index++;
  let address = "";
  if (text[index] === "<") {
    const close = text.indexOf(">", index);
    if (close === -1) return null;
    address = text.slice(index + 1, close);
    index = close + 1;
  } else {
    let depth = 0;
    const start = index;
    for (; index < text.length; index++) {
      const char = text[index]!;
      if (char === "\\") { index++; continue; }
      if (char === "(") depth++;
      else if (char === ")") { if (depth === 0) break; depth--; }
      else if (/\s/.test(char)) break;
    }
    address = text.slice(start, index);
  }
  while (/\s/.test(text[index] ?? "")) index++;
  const quote = text[index];
  if (quote === '"' || quote === "'" || quote === "(") {
    const closer = quote === "(" ? ")" : quote;
    const close = text.indexOf(closer, index + 1);
    if (close === -1) return null;
    index = close + 1;
    while (/\s/.test(text[index] ?? "")) index++;
  }
  if (text[index] !== ")") return null;
  return { address: address.replace(/\\([!-/:-@[-`{-~])/g, "$1"), end: index + 1 };
}

/**
 * The index where an emphasis run opened at `from` with `delim` closes, or -1 (code spans and escapes skipped).
 * `failed` remembers the earliest start a search for each delimiter failed from: no later start can succeed, so a
 * line of stray asterisks is not searched again and again.
 */
function emphasisEnd(text: string, from: number, delim: string, index: InlineIndex, failed: Map<string, number>): number {
  const known = failed.get(delim);
  if (known !== undefined && from >= known) return -1;
  for (let at = from; at < text.length; at++) {
    const char = text[at]!;
    if (char === "\\") { at++; continue; }
    if (char === "`") {
      const close = index.code.get(at);
      let end = at;
      while (text[end] === "`") end++;
      at = close === undefined ? end - 1 : close + (end - at) - 1;
      continue;
    }
    if (text.startsWith(delim, at) && at > from && !/\s/.test(text[at - 1]!)) {
      // A single * or _ must not be half of a ** or __ run.
      if (delim.length === 1 && (text[at + 1] === delim || text[at - 1] === delim)) continue;
      // Underscores do not close inside a word (snake_case_names).
      if (delim[0] === "_" && /[A-Za-z0-9]/.test(text[at + delim.length] ?? "")) continue;
      return at;
    }
  }
  failed.set(delim, Math.min(known ?? from, from));
  return -1;
}

const AUTOLINK = /<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*)>/y;
const EMAIL_AUTOLINK = /<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*)>/y;

function matchAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

function pushText(out: Inline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.kind === "text") last.text += text;
  else out.push({ kind: "text", text });
}

export function parseInline(text: string, depth = 0): Inline[] {
  if (depth >= MAX_NESTING) return text ? [{ kind: "text", text }] : [];
  const out: Inline[] = [];
  const found = indexInline(text);
  const failed = new Map<string, number>();
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;

    if (char === "\\") {
      const next = text[index + 1];
      if (next === "\n") { out.push({ kind: "break" }); index += 2; continue; }
      if (next !== undefined && PUNCTUATION.test(next)) { pushText(out, next); index += 2; continue; }
      pushText(out, char);
      index++;
      continue;
    }

    if (char === "\n") {
      const hard = text[index - 1] === " " && text[index - 2] === " ";
      if (hard) {
        const last = out[out.length - 1];
        if (last?.kind === "text") last.text = last.text.replace(/ +$/, "");
        out.push({ kind: "break" });
      } else {
        pushText(out, " ");
      }
      index++;
      continue;
    }

    if (char === "`") {
      let end = index;
      while (text[end] === "`") end++;
      const length = end - index;
      const close = found.code.get(index) ?? -1;
      if (close === -1) { pushText(out, text.slice(index, end)); index = end; continue; }
      let code = text.slice(end, close).replace(/\n/g, " ");
      if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
      out.push({ kind: "code", text: code });
      index = close + length;
      continue;
    }

    if (char === "!" && text[index + 1] === "[") {
      const close = found.bracket.get(index + 1) ?? -1;
      const destination = close === -1 ? null : linkDestination(text, close + 1);
      if (destination) {
        const alt = plainText(parseInline(text.slice(index + 2, close), depth + 1));
        out.push({ kind: "image", alt, href: safeHref(destination.address), address: destination.address });
        index = destination.end;
        continue;
      }
    }

    if (char === "[") {
      const close = found.bracket.get(index) ?? -1;
      const destination = close === -1 ? null : linkDestination(text, close + 1);
      if (destination) {
        out.push({ kind: "link", href: safeHref(destination.address), address: destination.address, children: parseInline(text.slice(index + 1, close), depth + 1) });
        index = destination.end;
        continue;
      }
    }

    if (char === "<") {
      const auto = matchAt(AUTOLINK, text, index);
      if (auto) {
        out.push({ kind: "link", href: safeHref(auto[1]!), address: auto[1]!, children: [{ kind: "text", text: auto[1]! }] });
        index += auto[0].length;
        continue;
      }
      const email = matchAt(EMAIL_AUTOLINK, text, index);
      if (email) {
        out.push({ kind: "link", href: safeHref(`mailto:${email[1]}`), address: `mailto:${email[1]}`, children: [{ kind: "text", text: email[1]! }] });
        index += email[0].length;
        continue;
      }
    }

    if (char === "*" || char === "_") {
      const double = text[index + 1] === char;
      const delim = double ? char + char : char;
      const after = text[index + delim.length];
      const before = text[index - 1];
      // An opener is followed by a non-space; an underscore opener is not inside a word.
      const opens = after !== undefined && !/\s/.test(after) && !(char === "_" && before !== undefined && /[A-Za-z0-9]/.test(before));
      const close = opens ? emphasisEnd(text, index + delim.length, delim, found, failed) : -1;
      if (close !== -1) {
        const children = parseInline(text.slice(index + delim.length, close), depth + 1);
        out.push(double ? { kind: "strong", children } : { kind: "em", children });
        index = close + delim.length;
        continue;
      }
      pushText(out, delim);
      index += delim.length;
      continue;
    }

    // Plain text up to the next character that may start something.
    let end = index + 1;
    while (end < text.length && !"\\\n`![<*_".includes(text[end]!)) end++;
    pushText(out, text.slice(index, end));
    index = end;
  }
  return out;
}

/** The text of inline content with no markup: an image's alt text, a link's label. */
export function plainText(inlines: Inline[]): string {
  return inlines.map((item) => {
    switch (item.kind) {
      case "text": case "code": return item.text;
      case "strong": case "em": case "link": return plainText(item.children);
      case "image": return item.alt;
      case "break": return " ";
    }
  }).join("");
}

/** The task spec as front matter and blocks. */
export function parseMarkdown(markdown: string): ParsedMarkdown {
  const text = markdown.replace(/\r\n?/g, "\n");
  const front = text.match(FRONT_MATTER);
  const body = front ? text.slice(front[0].length) : text;
  return { frontMatter: front ? parseFrontMatter(front[1]!) : null, blocks: parseBlocks(body.split("\n")) };
}
