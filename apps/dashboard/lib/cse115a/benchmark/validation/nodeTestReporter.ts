// Source of the custom reporter the runner gives `node --test`. Node's built-in reporters do not
// name the file a test came from when several files run together, and we need `file::describe > test`
// ids. The runner writes this text to /patches/reporter.mjs; the reporter writes {id: status} JSON to
// the path in $REPORT. Kept as a string so it ships with the dashboard code and needs no build step.

export const NODE_TEST_REPORTER_SOURCE = `import { writeFileSync } from "node:fs";

export default async function* hecateReporter(source) {
  const results = {};
  const stack = [];
  for await (const event of source) {
    const d = event.data;
    if (!d || typeof d.nesting !== "number") continue;
    if (event.type === "test:start") { stack.length = d.nesting; stack.push(d.name); continue; }
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    if (d.details && d.details.type === "suite") continue;
    const names = [...stack.slice(0, d.nesting), d.name];
    const file = String(d.file ?? "").replace(/^file:\\/\\//, "");
    const id = file + "::" + names.join(" > ");
    results[id] = event.type === "test:fail" ? "failed" : (d.skip || d.todo) ? "skipped" : "passed";
  }
  writeFileSync(process.env.REPORT ?? "report.json", JSON.stringify(results, null, 2));
  yield "";
}
`;
