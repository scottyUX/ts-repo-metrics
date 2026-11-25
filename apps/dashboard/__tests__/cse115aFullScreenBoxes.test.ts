// #448: "Full screen" for the review boxes: the staff review page's spec box and diff boxes, and the Benchmark task
// table's opened row (spec, code patch, test patch). Radix's portal is rendered in place so the dialog's markup can be
// read without a browser. Names, repos and task ids are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { REVIEW_TEXT } from "@/lib/cse115a/reviewText";
import type { TaskDetail } from "@/lib/cse115a/benchmark/taskTable";
import { FULL_SCREEN_CLASS, FullScreenView } from "@/components/cse115a/instructor/FullScreenBox";
import { CopyButton, DiffBox, HeightToggle, SpecBody, SpecBox, SpecViewSwitch } from "@/components/cse115a/instructor/ReviewBoxes";
import { TaskDetailView } from "@/components/cse115a/instructor/BenchmarkTaskTable";
import { Dialog, DialogClose, DialogTrigger } from "@/components/ui/dialog";

// The portal needs a mounted browser; in place, the server render shows what the dialog holds.
vi.mock("@radix-ui/react-dialog", async (original) => ({ ...(await original<object>()), Portal: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children) }));

const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");

/** Every element of a tree, through children; only the hook-free SpecViewSwitch is called to see its buttons. */
function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach((item) => elements(item, out)); return out; }
  if (!isValidElement(node)) return out;
  out.push(node);
  const props = node.props as { children?: ReactNode };
  if (node.type === SpecViewSwitch) elements(SpecViewSwitch(node.props as Parameters<typeof SpecViewSwitch>[0]), out);
  elements(props.children, out);
  return out;
}

const SPEC = "# Lamp timer\n\nThe lamp **dims** after ten minutes.\n";

function specDialog(open: boolean, raw: boolean, onRaw: (raw: boolean) => void = () => {}, onOpenChange: (open: boolean) => void = () => {}) {
  const tools = createElement(Fragment, null,
    createElement(SpecViewSwitch, { raw, onRaw }),
    createElement(CopyButton, { text: () => SPEC, label: REVIEW_TEXT.copy, ariaLabel: REVIEW_TEXT.copySpecLabel }));
  return FullScreenView({ open, onOpenChange, title: "Task spec · docs/tasks/US-7-T-1.md", what: "the task spec", tools,
    children: createElement(SpecBody, { markdown: SPEC, raw, full: true, boxId: "spec-full" }) });
}

describe("#448 full screen", () => {
  it("the button sits beside Show full height on the spec box and on a diff box; Show full height stays", () => {
    const spec = renderToStaticMarkup(createElement(SpecBox, { markdown: SPEC, taskPath: "docs/tasks/US-7-T-1.md", boxId: "task-1-spec" }));
    expect(spec).toContain(">Show full height</button>");
    expect(spec).toContain("aria-label=\"Show the task spec full screen\"");
    expect(spec.indexOf(">Show full height<")).toBeLessThan(spec.indexOf(">Full screen<"));
    // eslint-disable-next-line react/no-children-prop -- DiffBox's children is a render function, not elements
    const diff = renderToStaticMarkup(createElement(DiffBox, { what: "the patch", title: "Task 1 · patch", boxId: "task-1-patch-main", children: (full: boolean) => createElement("pre", null, full ? "FULL" : "SHORT") }));
    expect(diff).toContain(">Show full height</button>");
    expect(diff).toContain("aria-label=\"Show the patch full screen\"");
    // Closed, the dialog draws nothing and the page box is at its usual height.
    expect(diff).toContain("SHORT");
    expect(diff).not.toContain("FULL");
    expect(diff).not.toContain("role=\"dialog\"");
    // Show full height still switches the box's height.
    const toggled: boolean[] = [];
    const toggle = HeightToggle({ full: false, onToggle: () => toggled.push(true), what: "the patch", controls: "task-1-patch-main" });
    (toggle.props as { onClick: () => void }).onClick();
    expect(toggled).toEqual([true]);
    expect(REVIEW_TEXT.fullScreen).toBe("Full screen");
    expect(REVIEW_TEXT.close).toBe("Close");
  });

  it("opens one box over the whole window as a modal dialog with a heading naming it and a Close button", () => {
    const markup = renderToStaticMarkup(specDialog(true, false));
    expect(markup).toContain("role=\"dialog\"");
    expect(markup).toContain("aria-modal=\"true\"");
    const title = markup.match(/<h2 id="([^"]+)"[^>]*>Task spec · docs\/tasks\/US-7-T-1.md<\/h2>/);
    expect(title).not.toBeNull();
    expect(markup).toContain(`aria-labelledby="${title![1]}"`);
    expect(markup).toContain(">Close</button>");
    for (const name of FULL_SCREEN_CLASS.split(" ")) expect(markup).toContain(name);
    // The same content at full width: formatted, no height cap, inside a scrolling area.
    expect(markup).toContain("<strong>dims</strong>");
    expect(markup).toMatch(/<div id="spec-full" class="overflow-auto border-t/);
    expect(markup).toContain("min-h-0 flex-1 overflow-auto");
    // No score field and no form inside.
    expect(markup).not.toMatch(/<input|<textarea|<select|<form/);
  });

  it("opens and closes through the dialog's own state: the button is its trigger, Close and Esc close it", () => {
    const changes: boolean[] = [];
    const tree = elements(specDialog(false, false, () => {}, (open) => changes.push(open)));
    const root = tree.find((element) => element.type === Dialog)!;
    expect((root.props as { open: boolean }).open).toBe(false);
    (root.props as { onOpenChange: (open: boolean) => void }).onOpenChange(true);
    (root.props as { onOpenChange: (open: boolean) => void }).onOpenChange(false);
    expect(changes).toEqual([true, false]);
    // The trigger is the "Full screen" button itself, so Radix gives focus back to it on close.
    const trigger = tree.find((element) => element.type === DialogTrigger)!;
    expect((trigger.props as { asChild: boolean }).asChild).toBe(true);
    expect(renderToStaticMarkup((trigger.props as { children: ReactElement }).children)).toBe("<button type=\"button\" aria-label=\"Show the task spec full screen\" class=\"rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary\">Full screen</button>");
    expect(tree.some((element) => element.type === DialogClose)).toBe(true);
    // Radix's defaults are kept: modal (focus kept inside, the page behind not scrolling), Esc closes, focus moves in
    // and returns. Nothing overrides them.
    const source = read("components/cse115a/instructor/FullScreenBox.tsx");
    expect(source).not.toMatch(/modal=\{false\}|onEscapeKeyDown|onCloseAutoFocus|onOpenAutoFocus|onPointerDownOutside|onInteractOutside/);
    expect(source).not.toMatch(/fetch|localStorage|sessionStorage/);
    // Closed, nothing of the box is drawn in the dialog.
    expect(renderToStaticMarkup(specDialog(false, false))).not.toContain("<strong>dims</strong>");
  });

  it("Formatted / Raw and Copy work inside, and Copy copies the stored text", async () => {
    const picked: boolean[] = [];
    const tree = elements(specDialog(true, false, (raw) => picked.push(raw)));
    const rawButton = tree.find((element) => element.type === "button" && (element.props as { children?: unknown }).children === REVIEW_TEXT.raw)!;
    (rawButton.props as { onClick: () => void }).onClick();
    expect(picked).toEqual([true]);
    const raw = renderToStaticMarkup(specDialog(true, true));
    expect(raw).toContain("# Lamp timer\n\nThe lamp **dims** after ten minutes.");
    expect(raw).toMatch(/aria-pressed="true" class="[^"]*">Raw<\/button>/);
    const copy = tree.find((element) => element.type === CopyButton)!;
    expect((copy.props as { text: () => string }).text()).toBe(SPEC);
    const written: string[] = [];
    const { copyText } = await import("@/lib/cse115a/reviewText");
    expect(await copyText((copy.props as { text: () => string }).text(), { writeText: async (text) => { written.push(text); } })).toBe(true);
    expect(written).toEqual([SPEC]);
  });

  it("the review page wires the spec box and every diff box, with a Copy of the stored text in the dialog", () => {
    const boxes = read("components/cse115a/instructor/ReviewBoxes.tsx");
    expect(boxes).toContain("<FullScreenBox title={title} what=\"the task spec\" tools={<>{viewSwitch}{copy}</>}>");
    expect(boxes).toContain("<SpecBody markdown={markdown} raw={raw} full boxId={`${boxId}-full`} />");
    expect(boxes).toContain("<FullScreenBox title={title} what={what} tools={fullScreenTools ?? tools}>{children(true)}</FullScreenBox>");
    const review = read("components/cse115a/instructor/SubmissionReview.tsx");
    expect(review).toContain("title={`Task ${slot} · ${several ? `PR #${section.prNumber}'s ${tab}` : tab}`}");
    expect(review).toContain("fullScreenTools={<CopyButton text={() => sectionText(section, tab)}");
  });

  it("the task table's opened row has Full screen on its spec, code patch and test patch", () => {
    const detail: TaskDetail = {
      id: "src-9", submissionId: "sub-9", slot: 2, validationStatus: "validated", flags: [], problemStatement: SPEC, patch: "diff --git a/src/lamp.ts b/src/lamp.ts\n+dim()\n",
      testPatch: "diff --git a/test/lamp.test.ts b/test/lamp.test.ts\n+it('dims')\n", failToPass: [], passToPass: 0, validation: null, workPrChoice: null, extraCodePrs: [],
      hasReport: false, reportDate: null, grade: null, scores: null,
    };
    const markup = renderToStaticMarkup(createElement(TaskDetailView, { detail }));
    expect(markup.match(/>Full screen<\/button>/g)).toHaveLength(3);
    for (const what of ["the spec", "the code patch", "the test patch"]) expect(markup).toContain(`aria-label="Show ${what} full screen"`);
    const source = read("components/cse115a/instructor/BenchmarkTaskTable.tsx");
    expect(source).toContain("<FullScreenBox title={`${T.spec} · Task ${detail.slot}`} what=\"the spec\" tools={specTools}>");
    expect(source).toContain("<FullScreenBox title={title} what={`the ${what.toLowerCase()}`} tools={copy}>");
    // Without a spec there is nothing to open.
    expect(renderToStaticMarkup(createElement(TaskDetailView, { detail: { ...detail, problemStatement: "" } })).match(/>Full screen<\/button>/g)).toHaveLength(2);
  });
});
