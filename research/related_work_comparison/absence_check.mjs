/**
 * Structured (schema-level) capability check across every tool's own output.
 *
 * A plain `grep halstead raw/` is not valid evidence here: the corpus is React
 * code, so words like "react", "hook" and "component" appear in thousands of
 * FILE PATHS and source fragments that the tools merely echo back. That says
 * nothing about whether the tool MEASURES anything React-specific.
 *
 * So this script inspects what each tool actually emits as structured data --
 * the set of rule IDs, the set of JSON keys, the metric field names -- and
 * reports presence/absence of each capability at that level instead.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPOS = ['Colin-Posat__SlugFound', 'MikeyZv__SlugMarket', 'Brinqa-CRQ-2026__VulnContext-Desktop'];
const out = [];
const say = (s) => { out.push(s); console.log(s); };

/** Recursively collect every distinct key name in a JSON structure. */
function keySet(obj, acc = new Set(), depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== 'object') return acc;
  if (Array.isArray(obj)) { for (const v of obj.slice(0, 50)) keySet(v, acc, depth + 1); return acc; }
  for (const [k, v] of Object.entries(obj)) { acc.add(k); keySet(v, acc, depth + 1); }
  return acc;
}
const match = (set, re) => [...set].filter((k) => re.test(k));

say('=== STRUCTURED CAPABILITY / ABSENCE CHECK ===');
say('Evidence is at the schema level: rule IDs emitted, JSON key names, metric field names.');
say('Incidental matches inside analyzed file paths or source fragments are NOT counted.');
say('Generated: ' + new Date().toISOString());
say('');

// ---------------- ESLint + typescript-eslint ----------------
say('## Tool 1: ESLint 9.39.5 + typescript-eslint 8.65.0');
for (const r of REPOS) {
  const j = JSON.parse(readFileSync(`raw/eslint/${r}.json`, 'utf8'));
  const rules = new Set(), msgKeys = new Set();
  let realFindings = 0, missingRuleDefs = 0;
  for (const f of j) for (const m of f.messages) {
    rules.add(m.ruleId || '(null)');
    keySet(m, msgKeys);
    if (/^Definition for rule .* was not found/.test(m.message)) missingRuleDefs++; else realFindings++;
  }
  say(`- ${r}: ruleIds emitted = ${JSON.stringify([...rules].sort())}`);
  say(`    message object keys = ${JSON.stringify([...msgKeys].sort())}`);
  say(`    genuine findings=${realFindings}  "rule definition not found" errors=${missingRuleDefs}`);
  say(`    keys matching /halstead|volume|operand/  -> ${JSON.stringify(match(msgKeys, /halstead|volume|operand/i))}`);
  say(`    keys matching /cognitive/                -> ${JSON.stringify(match(msgKeys, /cognitive/i))}`);
  say(`    keys matching /commit|author|blame|git/   -> ${JSON.stringify(match(msgKeys, /commit|author|blame|git/i))}`);
  say(`    numeric metric field (score outside message text)? -> ${match(msgKeys, /^(complexity|score|value|metric)$/i).length ? 'YES' : 'NO - score only inside `message` prose'}`);
}
say('');

// ---------------- eslint-plugin-sonarjs ----------------
say('## Tool 2 (FREE tier): eslint-plugin-sonarjs 3.0.7');
for (const r of REPOS) {
  const j = JSON.parse(readFileSync(`raw/sonarjs-eslint-plugin/${r}.json`, 'utf8'));
  const msgKeys = new Set(); let cog = 0;
  for (const f of j) for (const m of f.messages) {
    keySet(m, msgKeys);
    if (m.ruleId === 'sonarjs/cognitive-complexity') cog++;
  }
  say(`- ${r}: cognitive-complexity findings = ${cog}`);
  say(`    message object keys = ${JSON.stringify([...msgKeys].sort())}`);
  say(`    keys matching /halstead|volume|operand/ -> ${JSON.stringify(match(msgKeys, /halstead|volume|operand/i))}`);
  say(`    numeric cognitive score as its own field? -> ${match(msgKeys, /^(score|complexity|value)$/i).length ? 'YES' : 'NO - integer embedded in `message` prose only'}`);
  // React rule subset run
  const rf = `raw/sonarjs-eslint-plugin/${r}.react-rules.txt`;
  if (existsSync(rf)) {
    const body = readFileSync(rf, 'utf8').split('\n').slice(4).join('\n');
    const hits = (body.match(/sonarjs\/(jsx-no-leaked-render|no-hook-setter-in-body|no-useless-react-setstate)/g) || []).length;
    say(`    React-rule subset actually triggered: ${hits} finding(s)  [${rf}]`);
  }
}
say('');

// ---------------- jscpd ----------------
say('## Tool 3: jscpd 4.2.5');
for (const r of REPOS) {
  const p = `raw/jscpd/${r}/jscpd-report.json`;
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const ks = keySet(j);
  say(`- ${r}: clones=${j.duplicates.length}  top-level keys=${JSON.stringify(Object.keys(j))}`);
  say(`    clone-record keys = ${JSON.stringify(Object.keys(j.duplicates[0] || {}))}`);
  say(`    per-file location keys = ${JSON.stringify(Object.keys((j.duplicates[0] || {}).firstFile || {}))}`);
  say(`    keys matching /halstead|volume/   -> ${JSON.stringify(match(ks, /halstead|volume/i))}`);
  say(`    keys matching /cognitive|cyclomatic/ -> ${JSON.stringify(match(ks, /cognitive|cyclomatic/i))}`);
  say(`    keys matching /function|method|symbol/ -> ${JSON.stringify(match(ks, /function|method|symbol/i))} (per-function granularity?)`);
  // Exact key names only: jscpd uses analysed FILE PATHS as object keys, so a
  // loose /rev/ matches "ReviewsSection.tsx" and yields a false positive.
  say(`    exact git-ish keys (blame|author|commit|rev|date) -> ${JSON.stringify(match(ks, /^(blame|author|commit|rev|date)$/i))}`);
}
for (const variant of ['Colin-Posat__SlugFound__blame_shallow', 'Colin-Posat__SlugFound__blame_fullhistory']) {
  const p = `raw/jscpd/${variant}/jscpd-report.json`;
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const revs = new Set(), authors = new Set(); let lines = 0;
  for (const d of j.duplicates) for (const f of [d.firstFile, d.secondFile])
    for (const b of Object.values(f.blame || {})) { lines++; revs.add(b.rev); authors.add(b.author); }
  say(`- ${variant}: blamed lines=${lines} distinctRevs=${revs.size} distinctAuthors=${authors.size}`);
  say(`    blame entry keys = ${JSON.stringify(Object.keys(Object.values(j.duplicates[0].firstFile.blame || { x: {} })[0]))}`);
}
say('');

// ---------------- ts-complex + escomplex ----------------
say('## Tool 4: ts-complex 1.0.0 + typhonjs-escomplex 0.1.0');
for (const r of REPOS) {
  const j = JSON.parse(readFileSync(`raw/ts-complex-escomplex/${r}.tool4.json`, 'utf8'));
  const hKeys = new Set();
  let named = 0, offsetKeyed = 0, methodsWithLine = 0;
  for (const rec of j.perFile) {
    for (const k of Object.keys(rec.tsComplex_cyclomatic || {})) {
      if (k === '__error') continue;
      k.startsWith('{"pos"') ? offsetKeyed++ : named++;
    }
    for (const v of Object.values(rec.tsComplex_halstead || {})) keySet(v, hKeys);
    for (const m of rec.escomplex_raw?.methods || []) if (typeof m.line === 'number') methodsWithLine++;
  }
  say(`- ${r}: files=${j.fileCount} (tsx=${j.tsxFileCount})  errors=${j.errors.length}`);
  say(`    ts-complex Halstead field names = ${JSON.stringify([...hKeys].sort())}`);
  say(`    ts-complex function keys: named=${named}  character-offset(anonymous)=${offsetKeyed}  -> no line numbers in either case`);
  say(`    ts-complex maintainability keys = ${JSON.stringify(Object.keys(j.perFile[0].tsComplex_maintainability || {}))} (file-level only)`);
  say(`    escomplex methods carrying a line number = ${methodsWithLine}`);
  say(`    any /cognitive/ field anywhere? -> ${match(hKeys, /cognitive/i).length ? 'YES' : 'NO'}`);
  say(`    any /react|hook|jsx|component/ field anywhere? -> ${match(hKeys, /react|hook|jsx|component/i).length ? 'YES' : 'NO'}`);
  say(`    any /commit|author|blame|git/ field anywhere? -> ${match(hKeys, /commit|author|blame|git/i).length ? 'YES' : 'NO'}`);
  say(`    escomplex project mode = ${JSON.stringify(j.escomplexProjectMode?.projectMetrics || j.escomplexProjectMode)}`);
}

writeOut();
function writeOut() {

  writeFileSync('raw/ABSENCE_CHECK.txt', out.join('\n') + '\n');
}
