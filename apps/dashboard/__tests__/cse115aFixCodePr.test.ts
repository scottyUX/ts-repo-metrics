// #454: one "Fix the code PR" button on the staff review page in place of "Use a different PR for the code" (#431) and
// "Add another PR for the code" (#437), opening two labelled choices; each opens its existing flow, unchanged.
// Server-rendered, no browser: the stateless view is called with each state and a choice's onClick is called directly.
// Names, repos and PR numbers are made up.
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { extrasFirstMessage, WORK_PR_TEXT } from "@/lib/cse115a/workPr";
import { REVIEW_TEXT } from "@/lib/cse115a/reviewText";
import type { ExtraCodePr } from "@/lib/cse115a/submissionSnapshot";
import { FixCodePr, FixCodePrView, type Flow } from "@/components/cse115a/instructor/FixCodePr";
import { pinTask } from "./cse115aExtraCodePrsFixture";

const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");

function elements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { node.forEach((item) => elements(item, out)); return out; }
  if (!isValidElement(node)) return out;
  out.push(node);
  elements((node.props as { children?: ReactNode }).children, out);
  return out;
}

const view = (props: Partial<Parameters<typeof FixCodePrView>[0]> = {}) =>
  FixCodePrView({ menuOpen: false, onMenu: () => {}, onChoose: () => {}, extraPrs: [], idBase: "fix", ...props });
const buttons = (node: ReactNode) => elements(node).filter((element) => element.type === "button");
const named = (node: ReactNode, text: string) => buttons(node).find((element) => (element.props as { children?: unknown }).children === text)!;

const extra = (prNumber: number): ExtraCodePr => ({
  prNumber, prUrl: `https://github.com/team-kettle/kettle/pull/${prNumber}`, title: "Kettle, part two", mergedAt: "2026-10-12T00:00:00Z", mergeCommitSha: "m".repeat(40),
  baseCommit: "0".repeat(40), headCommit: "h".repeat(40), diffEnd: "head", diff: "", diffBytes: 0, diffTruncated: false, checks: [],
  addedBy: "ta-kettle@ucsc.edu", addedAt: "2026-11-23T00:00:00Z", reason: "More of the code is in #12.",
});

describe("#454 Fix the code PR", () => {
  it("the page texts, word for word", () => {
    expect({
      open: WORK_PR_TEXT.fixOpen, label: WORK_PR_TEXT.fixChoicesLabel,
      different: WORK_PR_TEXT.fixDifferent, differentLine: WORK_PR_TEXT.fixDifferentLine, more: WORK_PR_TEXT.fixMore, moreLine: WORK_PR_TEXT.fixMoreLine,
    }).toEqual({
      open: "Fix the code PR", label: "How to fix the code PR",
      different: "The code is in a different PR",
      differentLine: "Use when the submitted PR holds only the task file, or is not where the work is. Replaces the code PR; the submitted PR is kept as the task-file PR.",
      more: "The code is spread over more PRs",
      moreLine: "Use when this PR is right but incomplete. Adds up to three more PRs; nothing is replaced.",
    });
    expect(REVIEW_TEXT.tableNote).toBe("Team is the repository of the student's tasks. \"No code in PR\" means the task's PR changes only task files (docs/tasks/); open Review and use \"Fix the code PR\", then \"The code is in a different PR\".");
  });

  it("one button, closed at first: aria-expanded and aria-controls point at the hidden choices", () => {
    const markup = renderToStaticMarkup(view());
    expect(markup).toContain("<button type=\"button\" aria-expanded=\"false\" aria-controls=\"fix-choices\"");
    expect(markup).toContain(">Fix the code PR</button>");
    expect(markup).toContain("<ul id=\"fix-choices\" hidden=\"\" aria-label=\"How to fix the code PR\"");
    const opened: number[] = [];
    (named(view({ onMenu: () => opened.push(1) }), WORK_PR_TEXT.fixOpen).props as { onClick: () => void }).onClick();
    expect(opened).toEqual([1]);
  });

  it("open, it shows the two labelled choices, each with its line, in order", () => {
    const markup = renderToStaticMarkup(view({ menuOpen: true }));
    expect(markup).toContain("aria-expanded=\"true\" aria-controls=\"fix-choices\"");
    expect(markup).toMatch(/<ul id="fix-choices" aria-label="How to fix the code PR"/);
    expect(markup).toContain("<button type=\"button\" aria-describedby=\"fix-different-line\" class=\"rounded-lg border border-input px-3 py-1.5 text-sm font-medium disabled:opacity-50\">The code is in a different PR</button><p id=\"fix-different-line\" class=\"text-muted-foreground\">Use when the submitted PR holds only the task file, or is not where the work is. Replaces the code PR; the submitted PR is kept as the task-file PR.</p>");
    expect(markup).toContain("<button type=\"button\" aria-describedby=\"fix-more-line\" class=\"rounded-lg border border-input px-3 py-1.5 text-sm font-medium disabled:opacity-50\">The code is spread over more PRs</button><p id=\"fix-more-line\" class=\"text-muted-foreground\">Use when this PR is right but incomplete. Adds up to three more PRs; nothing is replaced.</p>");
    expect(markup.indexOf("The code is in a different PR")).toBeLessThan(markup.indexOf("The code is spread over more PRs"));
    expect(markup).not.toContain("disabled=\"\"");
  });

  it("each choice opens its own flow", () => {
    const chosen: Flow[] = [];
    const tree = view({ menuOpen: true, onChoose: (flow) => chosen.push(flow) });
    (named(tree, WORK_PR_TEXT.fixDifferent).props as { onClick: () => void }).onClick();
    (named(tree, WORK_PR_TEXT.fixMore).props as { onClick: () => void }).onClick();
    expect(chosen).toEqual(["different", "more"]);
    const source = read("components/cse115a/instructor/FixCodePr.tsx");
    expect(source).toContain("(next === \"different\" ? different : more).current?.open();");
    expect(source).toContain("<WorkPrChooser {...props} ref={different}");
    expect(source).toContain("<ExtraCodePrs {...props} ref={more}");
  });

  it("while the task has extra PRs, the first choice is disabled and shows the existing message; the second still works", () => {
    const markup = renderToStaticMarkup(view({ menuOpen: true, extraPrs: [12, 14] }));
    const message = extrasFirstMessage([12, 14]);
    expect(message).toBe("This task has extra PRs for its code (PR #12 and PR #14). Remove them first, then change or undo the main PR.");
    expect(markup).toContain("<button type=\"button\" disabled=\"\" aria-describedby=\"fix-different-line fix-different-note\"");
    expect(markup).toContain(`<p id="fix-different-note" class="text-amber-700 dark:text-amber-300">${message}</p>`);
    expect(markup.match(/disabled=""/g)).toHaveLength(1);
    expect(markup).not.toContain("fix-more-note");
    // The flow itself refuses too, so the main PR stays locked whatever calls it.
    expect(read("components/cse115a/instructor/FixCodePr.tsx")).toContain("if (next === \"different\" && extraPrs.length > 0) return;");
    expect(read("components/cse115a/instructor/WorkPrChooser.tsx")).toContain("useImperativeHandle(ref, () => ({ open: () => { if (!locked) void openChooser(); } }));");
    expect(read("components/cse115a/instructor/WorkPrChooser.tsx")).toContain("const locked = readOnly || extras.length > 0;");
  });

  it("on the page: the one button under Get the code, neither old button, and no flow open until a choice is made", () => {
    const markup = renderToStaticMarkup(createElement(FixCodePr, { submissionId: "sub-4", task: pinTask(), recapturedAt: null, readOnly: false, onChanged: () => {} }));
    expect(markup.match(/>Fix the code PR<\/button>/g)).toHaveLength(1);
    for (const old of ["Use a different PR for the code", "Add another PR for the code"]) expect(markup).not.toContain(old);
    expect(markup).not.toContain(WORK_PR_TEXT.heading);
    expect(markup).not.toContain(WORK_PR_TEXT.extraHeading);
    const review = read("components/cse115a/instructor/SubmissionReview.tsx");
    expect(review).toContain("<FixCodePr submissionId={submissionId} task={task} recapturedAt={recapturedAt} readOnly={readOnly} onChanged={onSaved} />");
    expect(review).not.toContain("<WorkPrChooser ");
    expect(review).not.toContain("<ExtraCodePrs ");
    expect(review.indexOf("<GetTheCode ")).toBeLessThan(review.indexOf("<FixCodePr "));
    for (const file of ["WorkPrChooser.tsx", "ExtraCodePrs.tsx", "FixCodePr.tsx"]) {
      const source = read(`components/cse115a/instructor/${file}`);
      expect(source).not.toContain("WORK_PR_TEXT.open}");
      expect(source).not.toContain("WORK_PR_TEXT.extraOpen");
    }
  });

  it("with extra PRs, the list and its Remove stay on the page, and the message waits on the disabled choice", () => {
    const task = pinTask({ extraCodePrs: [extra(12)] });
    const markup = renderToStaticMarkup(createElement(FixCodePr, { submissionId: "sub-4", task, recapturedAt: null, readOnly: false, onChanged: () => {} }));
    expect(markup).toContain(WORK_PR_TEXT.extraListHeading.replace("'", "&#x27;"));
    expect(markup).toContain(">Remove</button>");
    expect(markup.match(/This task has extra PRs for its code/g)).toHaveLength(1);
    expect(markup).toMatch(/<ul id="[^"]*-choices" hidden=""/);
  });

  it("a read-only attempt shows no button and no choices", () => {
    const markup = renderToStaticMarkup(createElement(FixCodePr, { submissionId: "sub-4", task: pinTask({ extraCodePrs: [extra(12)] }), recapturedAt: null, readOnly: true, onChanged: () => {} }));
    expect(markup).not.toContain("Fix the code PR");
    expect(markup).not.toContain("The code is in a different PR");
    expect(markup).not.toContain(">Remove</button>");
  });

  it("each flow is unchanged: the same route, bodies, reason, preview, Undo and Remove", () => {
    const chooser = read("components/cse115a/instructor/WorkPrChooser.tsx");
    const adder = read("components/cse115a/instructor/ExtraCodePrs.tsx");
    for (const source of [chooser, adder]) {
      expect(source).toContain("const url = `/api/cse115a/instructor/submissions/${submissionId}/work-pr`;");
      expect(source).toContain("setListed(await fetchJson<Listed>(`${url}?slot=${task.slot}`));");
      expect(source).toContain("const canPreview = !busy && pr.trim() !== \"\" && reason.trim() !== \"\";");
      expect(source).toContain("<span className=\"text-muted-foreground\">{WORK_PR_TEXT.reasonLabel}</span>");
    }
    expect(chooser).toContain("send({ slot: task.slot, pr: chosen, reason, apply: false, seen })");
    expect(chooser).toContain("send({ slot: task.slot, pr: previewedPr, reason, apply: true, seen })");
    expect(chooser).toContain("send({ slot: task.slot, undo: true, seen })");
    expect(adder).toContain("send({ slot: task.slot, extra: chosen, reason, apply: false, seen })");
    expect(adder).toContain("send({ slot: task.slot, extra: previewedPr, reason, apply: true, seen })");
    expect(adder).toContain("send({ slot: task.slot, removeExtra: prNumber, seen })");
  });
});
