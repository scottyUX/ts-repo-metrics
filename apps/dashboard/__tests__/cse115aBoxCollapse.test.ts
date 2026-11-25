// #454: "Collapse" on each patch and test_patch box of the staff review page, and on the Benchmark task table's
// opened row's Code patch and Test patch. Server-rendered, no browser: the stateless views are called with each state,
// and a button's onClick is called directly. Names, repos and task ids are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { REVIEW_TEXT } from "@/lib/cse115a/reviewText";
import { splitPatch } from "@/lib/cse115a/diff";
import type { TaskDetail } from "@/lib/cse115a/benchmark/taskTable";
import { CollapseToggle, CopyButton, DiffBox, DiffBoxView } from "@/components/cse115a/instructor/ReviewBoxes";
import { PatchBoxView, TaskDetailView } from "@/components/cse115a/instructor/BenchmarkTaskTable";
import { DiffTabBody, tabCopyAll } from "@/components/cse115a/instructor/SubmissionReview";

vi.mock("server-only", () => ({}));
// The portal needs a mounted browser; in place, the server render shows what the dialog holds.
vi.mock("@radix-ui/react-dialog", async (original) => ({ ...(await original<object>()), Portal: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children) }));

const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");

/** Every element of a tree, through children and props that hold elements (tools); components are not called. */
function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach((item) => elements(item, out)); return out; }
  if (!isValidElement(node)) return out;
  out.push(node);
  const props = node.props as { children?: ReactNode; tools?: ReactNode };
  elements(props.tools, out);
  if (typeof props.children !== "function") elements(props.children, out);
  return out;
}

const fileDiff = (file: string, line: string) => `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+${line}\n`;
const PATCH = fileDiff("src/kettle.ts", "export const boil = 100;");

/** A diff box in one state, with a Copy in its toolbar; the diff view is a pre that says how tall it was drawn. */
function diffBox(collapsed: boolean, onCollapse: () => void = () => {}) {
  return DiffBoxView({
    what: "the patch", title: "Task 1 · patch", boxId: "task-1-patch-main", full: false, onFull: () => {}, collapsed, onCollapse,
    tools: createElement(CopyButton, { text: () => PATCH, label: REVIEW_TEXT.copy, ariaLabel: "Copy the patch" }),
    children: (full: boolean) => createElement("pre", null, full ? "FULL" : PATCH),
  });
}

describe("#454 Collapse on the review page's patch and test_patch boxes", () => {
  it("sits at the right end of the box's toolbar, after Copy, Show full height and Full screen, and starts expanded", () => {
    // eslint-disable-next-line react/no-children-prop -- DiffBox's children is a render function, not elements
    const markup = renderToStaticMarkup(createElement(DiffBox, { what: "the patch", title: "Task 1 · patch", boxId: "task-1-patch-main", children: () => createElement("pre", null, "SHOWN") }));
    expect(markup).toContain("<button type=\"button\" aria-expanded=\"true\" aria-controls=\"task-1-patch-main\" aria-label=\"Collapse the patch\"");
    expect(markup).toContain(">Collapse</button>");
    expect(markup).toContain("SHOWN");
    const at = (text: string) => markup.indexOf(text);
    expect(at(">Show full height<")).toBeLessThan(at(">Full screen<"));
    expect(at(">Full screen<")).toBeLessThan(at(">Collapse<"));
    // The toolbar is right-aligned, so its last button is its top right.
    expect(markup).toMatch(/<div class="flex flex-wrap items-center justify-end gap-2 px-3 pt-2">.*>Collapse<\/button><\/div><div id="task-1-patch-main">/);
    expect([REVIEW_TEXT.collapse, REVIEW_TEXT.expand, REVIEW_TEXT.collapseLabel("the patch"), REVIEW_TEXT.expandLabel("the patch")])
      .toEqual(["Collapse", "Expand", "Collapse the patch", "Expand the patch"]);
  });

  it("collapsed, the box shows only its toolbar: the diff is hidden and not drawn, and the button reads Expand", () => {
    const markup = renderToStaticMarkup(diffBox(true));
    expect(markup).toContain("<div id=\"task-1-patch-main\" hidden=\"\"></div>");
    expect(markup).not.toContain("export const boil");
    expect(markup).toContain("<button type=\"button\" aria-expanded=\"false\" aria-controls=\"task-1-patch-main\" aria-label=\"Expand the patch\"");
    expect(markup).toContain(">Expand</button>");
    // The toolbar stays: Copy, Show full height and Full screen.
    for (const label of [">Copy<", ">Show full height<", ">Full screen<"]) expect(markup).toContain(label);
    // Expanded again, the diff is back.
    expect(renderToStaticMarkup(diffBox(false))).toContain("<div id=\"task-1-patch-main\"><pre>diff --git a/src/kettle.ts");
  });

  it("the button switches the box both ways", () => {
    const clicks: string[] = [];
    for (const collapsed of [false, true]) {
      const toggle = elements(diffBox(collapsed, () => clicks.push(collapsed ? "expand" : "collapse"))).find((element) => element.type === CollapseToggle)!;
      (CollapseToggle(toggle.props as Parameters<typeof CollapseToggle>[0]).props as { onClick: () => void }).onClick();
    }
    expect(clicks).toEqual(["collapse", "expand"]);
    const boxes = read("components/cse115a/instructor/ReviewBoxes.tsx");
    expect(boxes).toContain("const [collapsed, setCollapsed] = useState(false);");
    expect(boxes).toContain("onCollapse={() => setCollapsed(!collapsed)}");
  });

  it("Copy still copies the whole stored diff while collapsed, and so does the tab's Copy all", () => {
    const copy = elements(diffBox(true)).find((element) => element.type === CopyButton)!;
    expect((copy.props as { text: () => string }).text()).toBe(PATCH);
    // Copy all sits above the boxes and reads the stored text, whatever each box shows.
    const testFile = fileDiff("test/kettle.test.ts", "it('boils')");
    const sections = [
      { key: "main", prNumber: 4, heading: "PR #4: Kettle (main PR)", split: splitPatch(PATCH + testFile) },
      { key: "pr-6", prNumber: 6, heading: "PR #6: Kettle, part two (extra PR for this task's code)", split: splitPatch(fileDiff("src/whistle.ts", "export const loud = true;")) },
    ];
    const tab = elements(DiffTabBody({ sections, tab: "patch", slot: 1 }));
    const copyAll = tab.find((element) => element.type === CopyButton && (element.props as { label: string }).label === REVIEW_TEXT.copyAll)!;
    expect((copyAll.props as { text: () => string }).text()).toBe(tabCopyAll(sections, "patch"));
    expect((copyAll.props as { text: () => string }).text()).toContain("export const loud = true;");
    expect((copyAll.props as { text: () => string }).text()).toContain("export const boil = 100;");
    // One box per section, each with its own Collapse (DiffBox), and Copy all outside them.
    expect(tab.filter((element) => element.type === DiffBox)).toHaveLength(2);
    expect(tab.filter((element) => element.type === DiffBox).map((element) => (element.props as { boxId: string }).boxId)).toEqual(["task-1-patch-main", "task-1-patch-pr-6"]);
  });

  it("the test_patch tab's boxes are DiffBoxes too", () => {
    const sections = [{ key: "main", prNumber: 4, heading: null, split: splitPatch(PATCH + fileDiff("test/kettle.test.ts", "it('boils')")) }];
    const boxes = elements(DiffTabBody({ sections, tab: "test_patch", slot: 2 })).filter((element) => element.type === DiffBox);
    expect(boxes.map((element) => (element.props as { what: string; boxId: string })).map(({ what, boxId }) => [what, boxId])).toEqual([["the test_patch", "task-2-test_patch-main"]]);
  });
});

describe("#454 Collapse on the Benchmark task table's opened row", () => {
  const detail: TaskDetail = {
    id: "src-9", submissionId: "sub-9", slot: 2, validationStatus: "validated", flags: [], problemStatement: "# Kettle\n", patch: PATCH,
    testPatch: fileDiff("test/kettle.test.ts", "it('boils')"), failToPass: [], passToPass: 0, validation: null, workPrChoice: null, extraCodePrs: [],
    hasReport: false, reportDate: null, grade: null, scores: null, coverage: null,
  };

  it("Code patch and Test patch each have Collapse at the right of their header line, expanded at first", () => {
    const markup = renderToStaticMarkup(createElement(TaskDetailView, { detail }));
    expect(markup.match(/>Collapse<\/button>/g)).toHaveLength(2);
    expect(markup).toContain("<span class=\"ml-auto\"><button type=\"button\" aria-expanded=\"true\" aria-controls=\"task-src-9-patch\" aria-label=\"Collapse the code patch\"");
    expect(markup).toContain("aria-controls=\"task-src-9-test-patch\" aria-label=\"Collapse the test patch\"");
    expect(markup.indexOf(">Code patch</h4>")).toBeLessThan(markup.indexOf("aria-label=\"Collapse the code patch\""));
    expect(markup).toContain("export const boil = 100;");
  });

  it("collapsed: the header line and toolbar only, the button reads Expand, and Copy copies the whole patch", () => {
    const view = (collapsed: boolean, onCollapse: () => void = () => {}) =>
      PatchBoxView({ what: "Code patch", text: PATCH, boxId: "task-src-9-patch", title: "Code patch · Task 2", collapsed, onCollapse });
    const markup = renderToStaticMarkup(view(true));
    expect(markup).toContain("<h4 class=\"text-sm font-medium\">Code patch</h4>");
    expect(markup).toContain("<pre id=\"task-src-9-patch\" hidden=\"\" class=\"max-h-96 overflow-auto rounded-md bg-muted p-2 text-xs\"></pre>");
    expect(markup).not.toContain("export const boil");
    expect(markup).toContain("aria-expanded=\"false\" aria-controls=\"task-src-9-patch\" aria-label=\"Expand the code patch\"");
    expect(markup).toContain(">Expand</button>");
    const tree = elements(view(true));
    const copy = tree.find((element) => element.type === CopyButton)!;
    expect((copy.props as { text: () => string }).text()).toBe(PATCH);
    const clicks: number[] = [];
    const toggle = elements(view(true, () => clicks.push(1))).find((element) => element.type === CollapseToggle)!;
    (CollapseToggle(toggle.props as Parameters<typeof CollapseToggle>[0]).props as { onClick: () => void }).onClick();
    expect(clicks).toEqual([1]);
  });
});
