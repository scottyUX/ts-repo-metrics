// Source of the custom reporter the runner gives `node --test`. Node's built-in reporters do not
// name the file a test came from when several files run together, and we need `file::describe > test`
// ids. The runner writes this text to /patches/reporter.mjs; the reporter writes {id: status} JSON to
// the path in $REPORT, and prints each failure's message and the tests' own output to stderr so the
// run log explains itself. Kept as a string so it ships with the dashboard code and needs no build.

export const NODE_TEST_REPORTER_SOURCE = `import { writeFileSync } from "node:fs";

const log = (text) => process.stderr.write(text);

export default async function* hecateReporter(source) {
  const results = {};
  const stack = [];
  let count = 0;
  for await (const event of source) {
    const d = event.data;
    if (event.type === "test:stderr" || event.type === "test:stdout") { log(String(d?.message ?? "")); continue; }
    if (event.type === "test:diagnostic") { log("[node:test] " + String(d?.message ?? "") + "\\n"); continue; }
    if (!d || typeof d.nesting !== "number") continue;
    if (event.type === "test:start") { stack.length = d.nesting; stack.push(d.name); continue; }
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    if (d.details && d.details.type === "suite") continue;
    const names = [...stack.slice(0, d.nesting), d.name];
    const file = String(d.file ?? "").replace(/^file:\\/\\//, "");
    // A file that fails to load is reported by node as a top-level test named after the file.
    const fileLevel = d.nesting === 0 && d.name && file.endsWith("/" + d.name);
    const id = fileLevel ? file + "::(load)" : file + "::" + names.join(" > ");
    const status = event.type === "test:fail" ? "failed" : (d.skip || d.todo) ? "skipped" : "passed";
    results[id] = status;
    count++;
    if (status === "failed") {
      const error = d.details && d.details.error;
      const message = error ? String(error.cause && error.cause.message ? error.cause.message : error.message ?? error) : "";
      log("[hecate] FAIL " + id + "\\n" + message.split("\\n").map((l) => "    " + l).join("\\n") + "\\n");
    }
  }
  log("[hecate] " + count + " test results written to " + (process.env.REPORT ?? "report.json") + "\\n");
  writeFileSync(process.env.REPORT ?? "report.json", JSON.stringify(results, null, 2));
  yield "";
}
`;
