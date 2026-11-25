"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { REVIEW_TEXT, teamLink } from "@/lib/cse115a/reviewText";
import {
  assignmentOptions, changedByStaffLines, consentCell, consentCounts, countSplit, coverageCell, coverageFileLine, coverageNotes, DEFAULT_FILTERS, flagText, goldCell,
  gradeBoxLines, gradeCell, longDate, matchesPeople, metricsHref, nextTaskSort, repoCell, repoSourceLine, reportDateText, reviewHref, scoreText, staffChangeLines,
  statusCell, statusHelpLines, summarize, TASK_TABLE_TEXT, taskCell, taskListLine, taskListRows, teamOptions, visibleRows, withStatus,
  type Changed, type ConsentFilter, type Filters, type People, type StatusKey, type SummaryLine, type TaskDetail, type TaskGrade, type TaskSort, type TaskSortKey, type TaskTableRow,
} from "@/lib/cse115a/benchmark/taskTable";
import { FullScreenBox } from "./FullScreenBox";
import { HelpTip } from "./HelpTip";
import { CollapseToggle, CopyButton, SpecBody, SpecViewSwitch } from "./ReviewBoxes";
import { fetchJson } from "./shared";

// The Benchmark page's summary of validation results (#444) and its table of every current task (#445), with the
// Consented column, heading help, the two benchmark columns and the opened row's grade and scores (#449). Since #452
// the box lists the tasks behind each count, Consent has three values and the opened row has "Tests and criteria";
// #454 makes the box compact again and adds Collapse to the opened row's patch boxes. Staff only.

const T = TASK_TABLE_TEXT;
const SELECT = "rounded-lg border border-input bg-background px-3 py-2";

/** The Status heading's help: one line per result, in the box's own words, then what the two prefixes mean (statusHelpLines). */
export function StatusHelp() {
  return <ul className="space-y-1">{statusHelpLines().map((line) => <li key={line.label}><span className="font-semibold">{line.label}</span>: {line.meaning}</li>)}</ul>;
}

/** A column: `sort` is its sort key; a column without one does not sort. `help` is its "?" panel. */
export type Column = { id: string; label: string; sort?: TaskSortKey; help?: ReactNode };

/** The columns in order (#452); TaskCells follows the same order. */
export const COLUMNS: Column[] = [
  { id: "assignment", sort: "assignment", label: T.columns.assignment },
  { id: "team", sort: "team", label: T.columns.team },
  { id: "who", sort: "who", label: T.columns.who },
  { id: "consent", sort: "consent", label: T.columns.consent },
  { id: "task", sort: "task", label: T.columns.task },
  { id: "status", sort: "status", label: T.columns.status, help: <StatusHelp /> },
  { id: "coverage", sort: "coverage", label: T.columns.coverage, help: T.coverageHelp },
  { id: "grade", sort: "grade", label: T.columns.grade },
  // Placeholders (#449): no data, no route field and no migration yet; every cell reads "Not set". They do not sort or filter.
  { id: "score", label: T.columns.score, help: T.scoreHelp },
  { id: "gold", sort: "gold", label: T.columns.gold, help: T.goldHelp },
  { id: "include", label: T.columns.include, help: T.includeHelp },
  { id: "repo", sort: "repo", label: T.columns.repo, help: T.repoHelp },
  { id: "staffChanges", sort: "staffChanges", label: T.columns.staffChanges },
];

type SummaryProps = {
  /** The rows the People filter keeps: the box follows it. */
  rows: readonly TaskTableRow[];
  people: People;
  /** The table's Status filter: its row is marked as pressed. */
  selected: StatusKey | "all";
  onPick: (key: StatusKey) => void;
};

/**
 * The "Validation results" box, compact again (#454, as before #452's table): one line per result in a fixed order,
 * its count, label and one-line meaning; clicking a line sets the table's Status filter. Kept from #452: the result
 * rows and their rules, "decided / from the last run" under a count, the People filter in the total, and a small
 * "Show tasks" button per line opening the list of those tasks (built like the Grader tab's lists, #432) with "Show
 * in the table" inside. Every list is in the markup, hidden until opened.
 */
export function SummaryBoxView({ rows, people, selected, onPick, open, onToggle, idBase }: SummaryProps & { open: StatusKey | null; onToggle: (key: StatusKey) => void; idBase: string }) {
  const { lines, total } = summarize(rows);
  return (
    <section aria-labelledby="validation-results" className="rounded-xl border border-border bg-card p-4">
      <h2 id="validation-results" className="font-semibold">{T.summaryHeading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{T.summaryNote}</p>
      <ul className="mt-3 divide-y divide-border text-sm">
        {lines.map((line) => <SummaryRow key={line.key} line={line} selected={selected === line.key} isOpen={open === line.key} listId={`${idBase}-${line.key}`} onToggle={onToggle} onPick={onPick} />)}
      </ul>
      <p className="mt-2 border-t border-border px-2 pt-2 text-sm font-medium">{T.summaryTotal(total, people)}</p>
      <ConsentCountLines rows={rows} />
    </section>
  );
}

/** One result: its line (a button setting the Status filter), its "Show tasks" button, and its list of tasks under it. */
function SummaryRow({ line, selected, isOpen, listId, onToggle, onPick }: { line: SummaryLine; selected: boolean; isOpen: boolean; listId: string; onToggle: (key: StatusKey) => void; onPick: (key: StatusKey) => void }) {
  const split = countSplit(line);
  return (
    <li>
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => onPick(line.key)} aria-pressed={selected}
          className={`grid min-w-0 flex-1 grid-cols-[4rem_minmax(10rem,16rem)_1fr] items-baseline gap-3 px-2 py-2 text-left hover:bg-muted/50${selected ? " bg-muted" : ""}`}>
          <span className="text-right">
            <span className="font-semibold tabular-nums">{line.count}</span>
            {split ? <span className="block text-xs text-muted-foreground">{split}</span> : null}
          </span>
          <span className="font-medium">{line.label}</span>
          <span className="text-muted-foreground">{line.meaning}</span>
        </button>
        {line.count > 0 ? (
          <button type="button" aria-expanded={isOpen} aria-controls={listId}
            aria-label={isOpen ? T.hideTasksLabel(line.label) : T.showTasksLabel(line.count, line.label)}
            onClick={() => onToggle(line.key)}
            className="mt-1.5 shrink-0 whitespace-nowrap rounded-md border border-input px-2 py-0.5 text-xs font-medium hover:bg-muted">
            {isOpen ? T.hideTasks : T.showTasks}
          </button>
        ) : null}
      </div>
      {line.count > 0 ? (
        <div id={listId} hidden={!isOpen} className="bg-muted/20 px-2 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-medium text-muted-foreground">{T.listHeading(line.label)}</p>
            <button type="button" onClick={() => onPick(line.key)} aria-label={T.showInTableLabel(line.label)}
              className="rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted">
              {T.showInTable}
            </button>
          </div>
          <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto">
            {taskListRows(line.tasks).map((task) => (
              <li key={task.id}>
                <Link href={reviewHref(task.submissionId)} className="text-primary underline">{taskListLine(task)}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/** The box with its one open list. */
export function SummaryBox(props: SummaryProps) {
  const [open, setOpen] = useState<StatusKey | null>(null);
  const idBase = useId();
  return <SummaryBoxView {...props} open={open} idBase={idBase} onToggle={(key) => setOpen((current) => current === key ? null : key)} />;
}

/** The foot of the summary box: validated tasks by consent, apart from the lines that add up to the total. */
export function ConsentCountLines({ rows }: { rows: readonly TaskTableRow[] }) {
  const counts = consentCounts(rows);
  return (
    <div className="mt-3 rounded-lg bg-muted/50 px-2 py-2 text-sm">
      <p>{T.validatedConsented(counts.consented)}</p>
      <p>{T.validatedNotConsented(counts.notConsented)}</p>
      <p className="mt-1 text-muted-foreground">{T.consentCountsNote}</p>
    </div>
  );
}

/** The filters, as the Submissions table lays them out. */
export function TaskFilters({ rows, filters, onChange }: { rows: readonly TaskTableRow[]; filters: Filters; onChange: (next: Filters) => void }) {
  // The box's results and counts, for the rows the People filter keeps, as the box shows them.
  const statuses = summarize(rows.filter((row) => matchesPeople(row, filters.people))).lines;
  const teams = teamOptions(rows);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">{T.assignmentLabel}</span>
        <select value={String(filters.assignment)} onChange={(event) => set({ assignment: event.target.value === "all" ? "all" : Number(event.target.value) })} className={SELECT}>
          <option value="all">{T.allAssignments}</option>
          {assignmentOptions(rows).map((number) => <option key={number} value={number}>{T.assignmentOption(number)}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">{T.teamLabel}</span>
        <select value={filters.team === "all" || teams.includes(filters.team) ? filters.team : "all"} onChange={(event) => set({ team: event.target.value })} className={SELECT}>
          <option value="all">{T.allTeams}</option>
          {teams.map((team) => <option key={team} value={team} title={team}>{teamLink(team)?.name ?? team}</option>)}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">{T.statusLabel}</span>
        <select value={filters.status} onChange={(event) => set({ status: event.target.value as StatusKey | "all" })} className={SELECT}>
          <option value="all">{T.allStatuses}</option>
          {statuses.map((line) => <option key={line.key} value={line.key}>{line.label} ({line.count})</option>)}
          {filters.status !== "all" && !statuses.some((line) => line.key === filters.status) ? <option value={filters.status}>{filters.status}</option> : null}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">{T.consentLabel}</span>
        <select value={filters.consent} onChange={(event) => set({ consent: event.target.value as ConsentFilter })} className={SELECT}>
          <option value="any">{T.consentAny}</option>
          <option value="yes">{T.consentYes}</option>
          <option value="no">{T.consentNo}</option>
          <option value="not_yet">{T.consentNotYet}</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">{T.changedLabel}</span>
        <select value={filters.changed} onChange={(event) => set({ changed: event.target.value as Changed })} className={SELECT}>
          <option value="any">{T.changedAny}</option>
          <option value="yes">{T.changedYes}</option>
          <option value="no">{T.changedNo}</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">{T.peopleLabel}</span>
        <select value={filters.people} onChange={(event) => set({ people: event.target.value as People })} className={SELECT}>
          <option value="students">{T.studentsOnly}</option>
          <option value="staff">{T.staffOnly}</option>
          <option value="everyone">{T.everyone}</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted-foreground">{T.searchLabel}</span>
        <input type="search" value={filters.search} onChange={(event) => set({ search: event.target.value })} placeholder={T.searchPlaceholder} className={`${SELECT} w-56`} />
      </label>
    </div>
  );
}

/** The six box lines, as the Final grade cell's hover and focus text. */
export function GradeBoxesPanel({ grade }: { grade: TaskGrade }) {
  return <ul>{gradeBoxLines(grade).map((line) => <li key={line} className="tabular-nums">{line}</li>)}</ul>;
}

/** One row's cells, in column order. */
export function TaskCells({ row }: { row: TaskTableRow }) {
  const team = teamLink(row.team);
  const task = taskCell(row);
  const status = statusCell(row);
  const coverage = coverageCell(row);
  const grade = gradeCell(row.grade);
  const repo = repoCell(row);
  return (
    <>
      <td className="px-3 py-3 tabular-nums">{row.assignment}</td>
      <td className="whitespace-nowrap px-3 py-3">{team ? <a href={team.url} target="_blank" rel="noopener noreferrer" title={team.fullName} className="text-primary underline">{team.name}</a> : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-3">
        <span className="break-all">{row.email || "—"}</span>
        {row.staff ? <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{T.staffTag}</span> : null}
      </td>
      <td className={`whitespace-nowrap px-3 py-3${row.consent === "yes" ? "" : " text-muted-foreground"}`}>{consentCell(row.consent)}</td>
      <td className="px-3 py-3"><span className="font-medium">{task.slot}</span>{task.name ? <span className="block text-xs text-muted-foreground">{task.name}</span> : null}</td>
      <td className="px-3 py-3"><span>{status.label}</span>{status.detail ? <span className="block text-xs text-muted-foreground">{status.detail}</span> : null}</td>
      <td className="px-3 py-3">
        <span className="tabular-nums">{coverage.main}</span>
        {coverage.detail ? <span className="block text-xs text-muted-foreground">{coverage.detail}</span> : null}
        {coverage.untested ? <span className="block text-xs text-amber-700 dark:text-amber-300">{coverage.untested}</span> : null}
      </td>
      <td className="px-3 py-3 tabular-nums">
        {row.grade
          ? <HelpTip id={`grade-boxes-${row.id}`} kind="text" panel={<GradeBoxesPanel grade={row.grade} />}><span>{grade.text}</span></HelpTip>
          : <span className="text-muted-foreground">{grade.text}</span>}
        {grade.unreleased ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{T.notReleased}</span> : null}
      </td>
      <td className="px-3 py-3 text-muted-foreground">{T.notSet}</td>
      <td className="px-3 py-3">{goldCell(row.gold)}</td>
      <td className="px-3 py-3 text-muted-foreground">{T.notSet}</td>
      <td className="px-3 py-3"><span className={row.hasReport ? "" : "text-muted-foreground"}>{repo.text}</span>{repo.date ? <span className="block text-xs text-muted-foreground">{repo.date}</span> : null}</td>
      <td className="px-3 py-3">{staffChangeLines(row).map((line) => <span key={line} className="block text-xs font-medium">{line}</span>)}</td>
    </>
  );
}

type PatchBoxProps = { what: string; text: string; boxId: string; title: string };

/** A patch in a scrolling box with a Copy button that copies it whole, Full screen (#448), and Collapse (#454). */
function PatchBox(props: PatchBoxProps) {
  const [collapsed, setCollapsed] = useState(false);
  return <PatchBoxView {...props} collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} />;
}

/** The patch box without state: its header line and toolbar, then the patch unless collapsed. Starts expanded. */
export function PatchBoxView({ what, text, boxId, title, collapsed, onCollapse }: PatchBoxProps & { collapsed: boolean; onCollapse: () => void }) {
  const copy = <CopyButton text={() => text} label={REVIEW_TEXT.copy} ariaLabel={T.copyPatch(what.toLowerCase())} />;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{what}</h4>
        {copy}
        <FullScreenBox title={title} what={`the ${what.toLowerCase()}`} tools={copy}>
          <pre className="whitespace-pre p-3 text-xs">{text || T.emptyPatch}</pre>
        </FullScreenBox>
        <span className="ml-auto"><CollapseToggle collapsed={collapsed} onToggle={onCollapse} what={`the ${what.toLowerCase()}`} controls={boxId} /></span>
      </div>
      <pre id={boxId} hidden={collapsed} className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-xs">{collapsed ? null : text || T.emptyPatch}</pre>
    </div>
  );
}

/** The opened row's grade: each box's final points, the total, and "not released" as the table marks it. */
export function GradeSection({ grade }: { grade: TaskGrade | null }) {
  const cell = gradeCell(grade);
  return (
    <section>
      <h4 className="font-medium">{T.gradeHeading}</h4>
      {grade ? (
        <>
          <ul className="mt-1 tabular-nums">{gradeBoxLines(grade).map((line) => <li key={line}>{line}</li>)}</ul>
          <p className="mt-1 font-medium tabular-nums">
            {T.gradeTotal(grade.total)}
            {cell.unreleased ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{T.notReleased}</span> : null}
          </p>
        </>
      ) : <p className="text-muted-foreground">{T.notGraded}</p>}
    </section>
  );
}

/**
 * "Tests and criteria" (#452), directly under the spec: the proving tests, the stored coverage run file by file, and
 * a line saying the criteria are not linked yet. Shows what the validator stored; nothing is computed here.
 */
export function TestsSection({ detail }: { detail: Pick<TaskDetail, "validationStatus" | "failToPass" | "passToPass" | "coverage"> }) {
  return (
    <section aria-labelledby="tests-and-criteria" className="space-y-3 rounded-lg border border-border p-3">
      <h4 id="tests-and-criteria" className="font-medium">{T.testsHeading}</h4>
      <div>
        <h5 className="font-medium">{T.provingHeading(detail.failToPass.length)}</h5>
        {detail.validationStatus !== "validated" ? <p className="text-xs text-muted-foreground">{T.provingGuess}</p> : null}
        {detail.failToPass.length ? <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 font-mono text-xs">{detail.failToPass.map((test) => <li key={test}>{test}</li>)}</ul> : <p className="text-muted-foreground">{T.noProvingTests}</p>}
        <p className="mt-1 text-muted-foreground">{T.stillPass(detail.passToPass)}</p>
      </div>
      <div>
        <h5 className="font-medium">{T.coverageHeading}</h5>
        {detail.coverage?.files.length ? (
          <ul className="mt-1 space-y-0.5">
            {detail.coverage.files.map((file) => {
              const line = coverageFileLine(file);
              return (
                <li key={file.path}>
                  <span className="font-mono text-xs">{line.path}</span>: {line.state}
                  {line.lines ? <span className="text-muted-foreground tabular-nums">, {line.lines}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {coverageNotes(detail.coverage).map((note) => <p key={note} className="mt-1">{note}</p>)}
      </div>
      <p className="text-xs text-muted-foreground">{T.criteriaNote}</p>
    </section>
  );
}

/** The opened row's Repo Metrics scores from the stored report, with the report's date; nothing without a report. */
export function ScoresSection({ detail }: { detail: Pick<TaskDetail, "hasReport" | "reportDate" | "scores"> }) {
  if (!detail.hasReport) return null;
  return (
    <section>
      <h4 className="font-medium">{T.scoresHeading} <span className="text-xs font-normal text-muted-foreground">{reportDateText(detail.reportDate)}</span></h4>
      {detail.scores ? (
        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
          {detail.scores.map((item) => (
            <div key={item.id} className="flex gap-2"><dt className="text-muted-foreground">{item.title}</dt><dd className="font-medium tabular-nums">{scoreText(item.score)}</dd></div>
          ))}
        </dl>
      ) : <p className="text-muted-foreground">{T.scoresFailed}</p>}
    </section>
  );
}

/** The opened row: spec, tests and criteria, patches, flags, validation, staff changes and the links. */
export function TaskDetailView({ detail, raw = false, onRaw }: { detail: TaskDetail; raw?: boolean; onRaw?: (raw: boolean) => void }) {
  const changes = changedByStaffLines(detail);
  const idBase = `task-${detail.id}`;
  // The same switch and Copy on the page and in the full-screen dialog; both drive one Formatted / Raw choice.
  const specTools = (
    <>
      <SpecViewSwitch raw={raw} onRaw={(next) => onRaw?.(next)} />
      <CopyButton text={() => detail.problemStatement} label={REVIEW_TEXT.copy} ariaLabel={REVIEW_TEXT.copySpecLabel} />
    </>
  );
  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex flex-wrap gap-4">
        <Link href={reviewHref(detail.submissionId)} className="font-medium text-primary underline">{T.reviewLink}</Link>
        {detail.hasReport ? (
          <span>
            <Link href={metricsHref(detail.submissionId, detail.slot)} className="font-medium text-primary underline">{T.reportLink}</Link>
            <span className="ml-2 text-xs text-muted-foreground">{reportDateText(detail.reportDate)}</span>
          </span>
        ) : <span className="text-muted-foreground">{T.noReport}</span>}
      </div>
      {detail.hasReport && changes.length ? <p className="text-xs text-muted-foreground">{T.reportBeforeChange}</p> : null}

      {changes.length ? (
        <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <h4 className="font-medium">{T.changedHeading}</h4>
          {changes.map((block, index) => (
            <div key={index} className="mt-2">{block.lines.map((line) => <p key={line} className={block.kind === "chosen" || block.kind === "extra" ? "" : "text-muted-foreground"}>{line}</p>)}</div>
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <GradeSection grade={detail.grade} />
        <ScoresSection detail={detail} />
      </div>

      <section className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{T.spec}</h4>
          {specTools}
          {detail.problemStatement ? (
            <FullScreenBox title={`${T.spec} · Task ${detail.slot}`} what="the spec" tools={specTools}>
              <SpecBody markdown={detail.problemStatement} raw={raw} full boxId={`${idBase}-spec-full`} />
            </FullScreenBox>
          ) : null}
        </div>
        {detail.problemStatement ? <div className="rounded-md border border-border"><SpecBody markdown={detail.problemStatement} raw={raw} full={false} boxId={`${idBase}-spec`} /></div> : <p className="text-muted-foreground">{T.noSpec}</p>}
      </section>

      <TestsSection detail={detail} />

      <PatchBox what={T.codePatch} text={detail.patch} boxId={`${idBase}-patch`} title={`${T.codePatch} · Task ${detail.slot}`} />
      <PatchBox what={T.testPatch} text={detail.testPatch} boxId={`${idBase}-test-patch`} title={`${T.testPatch} · Task ${detail.slot}`} />

      <section>
        <h4 className="font-medium">{T.flagsHeading}</h4>
        {detail.flags.length ? <ul className="mt-1 list-disc pl-5">{detail.flags.map((flag) => <li key={flag} title={flag}>{flagText(flag)}</li>)}</ul> : <p className="text-muted-foreground">{T.noFlags}</p>}
      </section>

      {detail.validation ? (
        <section>
          <h4 className="font-medium">{T.validatedHeading}</h4>
          <p>{detail.validation.validatedAt && longDate(detail.validation.validatedAt) ? T.validatedAt(longDate(detail.validation.validatedAt)!) : T.validatedAtUnknown}</p>
          <p>{repoSourceLine(detail.validation.repoSource)}</p>
          <p className="mt-2 font-medium">{T.untestedHeading}</p>
          {detail.validation.untestedFiles.length ? <ul className="list-disc pl-5 font-mono text-xs">{detail.validation.untestedFiles.map((file) => <li key={file}>{file}</li>)}</ul> : <p className="text-muted-foreground">{T.noUntested}</p>}
        </section>
      ) : null}
    </div>
  );
}

type Opened = { status: "loading" } | { status: "failed"; message: string } | { status: "loaded"; detail: TaskDetail };

/** What the opened row shows while loading, after a failure, or once loaded. */
export function OpenedRow({ opened, raw, onRaw }: { opened: Opened; raw: boolean; onRaw: (raw: boolean) => void }) {
  if (opened.status === "loading") return <p className="p-4 text-sm text-muted-foreground">{T.detailLoading}</p>;
  if (opened.status === "failed") return <p role="alert" className="p-4 text-sm text-destructive">{T.detailFailed(opened.message)}</p>;
  return <TaskDetailView detail={opened.detail} raw={raw} onRaw={onRaw} />;
}

/** The header, as the Submissions table's: a sorting button per sortable column, and "?" help beside some. */
export function Header({ sort, onSort }: { sort: TaskSort; onSort: (key: TaskSortKey) => void }) {
  return (
    <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
      <tr>
        {COLUMNS.map((column) => {
          const active = column.sort && sort?.key === column.sort ? sort.direction : null;
          return (
            <th key={column.id} scope="col" aria-sort={column.sort ? (active === "asc" ? "ascending" : active === "desc" ? "descending" : "none") : undefined} className="px-3 py-3 align-bottom font-medium">
              <span className="inline-flex items-center gap-1.5">
                {column.sort ? (
                  <button type="button" onClick={() => onSort(column.sort!)} className="inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-foreground">
                    {column.label}
                    <span aria-hidden="true">{active === "asc" ? "▲" : active === "desc" ? "▼" : "↕"}</span>
                  </button>
                ) : <span className="whitespace-nowrap">{column.label}</span>}
                {column.help ? <HelpTip id={`help-${column.id}`} kind="button" label={T.helpLabel(column.label)} panel={column.help} /> : null}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function BenchmarkTaskTable({ slug }: { slug: string }) {
  const [rows, setRows] = useState<TaskTableRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<TaskSort>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, Opened>>({});
  const [raw, setRaw] = useState(false);
  const base = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/benchmark/tasks`;

  useEffect(() => {
    fetchJson<{ rows: TaskTableRow[] }>(base)
      .then((body) => setRows(body.rows))
      .catch((caught: Error) => setError(caught.message));
  }, [base]);

  const visible = useMemo(() => visibleRows(rows ?? [], filters, sort), [rows, filters, sort]);
  const people = useMemo(() => (rows ?? []).filter((row) => matchesPeople(row, filters.people)), [rows, filters.people]);

  function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    // One request per open: a row already loaded is shown again; a failed one is asked again.
    if (opened[id]?.status === "loaded") return;
    setOpened((current) => ({ ...current, [id]: { status: "loading" } }));
    fetchJson<{ task: TaskDetail }>(`${base}/${encodeURIComponent(id)}`)
      .then((body) => setOpened((current) => ({ ...current, [id]: { status: "loaded", detail: body.task } })))
      .catch((caught: Error) => setOpened((current) => ({ ...current, [id]: { status: "failed", message: caught.message } })));
  }

  if (error) return <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{T.loadFailed(error)}</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">{T.loading}</p>;

  return (
    <div className="space-y-4">
      <SummaryBox rows={people} people={filters.people} selected={filters.status} onPick={(key) => setFilters((current) => withStatus(current, key))} />
      <div>
        <h2 className="font-semibold">{T.tableHeading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{T.tableIntro}</p>
      </div>
      <TaskFilters rows={rows} filters={filters} onChange={setFilters} />
      <p className="text-sm text-muted-foreground" role="status">{T.showing(visible.length, rows.length)}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <Header sort={sort} onSort={(key) => setSort((current) => nextTaskSort(current, key))} />
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? <tr><td colSpan={COLUMNS.length} className="px-3 py-6 text-muted-foreground">{T.noTasks}</td></tr> : null}
            {rows.length > 0 && visible.length === 0 ? <tr><td colSpan={COLUMNS.length} className="px-3 py-6 text-muted-foreground">{T.noMatch}</td></tr> : null}
            {visible.map((row) => {
              const isOpen = openId === row.id;
              const name = `${taskCell(row).slot} of ${row.email || "this student"}`;
              return (
                <Fragment key={row.id}>
                  <tr onClick={() => toggle(row.id)} className={`cursor-pointer align-top hover:bg-muted/40${isOpen ? " bg-muted/40" : ""}`}
                    aria-expanded={isOpen} aria-label={isOpen ? T.closeRow(name) : T.openRow(name)}
                    tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(row.id); } }}>
                    <TaskCells row={row} />
                  </tr>
                  {isOpen ? <tr><td colSpan={COLUMNS.length} className="bg-background">{opened[row.id] ? <OpenedRow opened={opened[row.id]!} raw={raw} onRaw={setRaw} /> : null}</td></tr> : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">{T.tableNote}</p>
    </div>
  );
}

