"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { REVIEW_TEXT, teamLink } from "@/lib/cse115a/reviewText";
import {
  assignmentOptions, changedByStaffLines, coverageCell, DEFAULT_FILTERS, flagText, goldCell, gradeCell, longDate,
  metricsHref, nextTaskSort, repoCell, repoSourceLine, reportDateText, reviewHref, staffChangeLines, statusCell, summarize,
  TASK_TABLE_TEXT, taskCell, teamOptions, visibleRows, withStatus,
  type Changed, type Filters, type People, type StatusKey, type TaskDetail, type TaskSort, type TaskSortKey, type TaskTableRow,
} from "@/lib/cse115a/benchmark/taskTable";
import { CopyButton, SpecBody } from "./ReviewBoxes";
import { fetchJson } from "./shared";

// The Benchmark page's summary of validation results (#444) and its table of every current task (#445). Staff only.
// No cell, filter or opened row says whether a student consented.

const T = TASK_TABLE_TEXT;
const SELECT = "rounded-lg border border-input bg-background px-3 py-2";

const COLUMNS: Array<{ key: TaskSortKey; label: string; note?: string; title?: string }> = [
  { key: "assignment", label: T.columns.assignment },
  { key: "team", label: T.columns.team },
  { key: "student", label: T.columns.student },
  { key: "task", label: T.columns.task },
  { key: "status", label: T.columns.status },
  { key: "coverage", label: T.columns.coverage },
  { key: "gold", label: T.columns.gold },
  { key: "grade", label: T.columns.grade },
  { key: "staffChanges", label: T.columns.staffChanges },
  { key: "repo", label: T.columns.repo, note: T.repoColumnNote, title: T.repoColumnTitle },
];

/** The summary box: one line per status, its count and meaning; a line's button shows those tasks in the table. */
export function SummaryBox({ rows, selected, onPick }: { rows: readonly TaskTableRow[]; selected: StatusKey | "all"; onPick: (key: StatusKey) => void }) {
  const { lines, total } = summarize(rows);
  return (
    <section aria-labelledby="validation-results" className="rounded-xl border border-border bg-card p-4">
      <h2 id="validation-results" className="font-semibold">{T.summaryHeading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{T.summaryNote}</p>
      <ul className="mt-3 divide-y divide-border">
        {lines.map((line) => (
          <li key={line.key}>
            <button type="button" onClick={() => onPick(line.key)} aria-pressed={selected === line.key}
              className={`grid w-full grid-cols-[4rem_minmax(10rem,16rem)_1fr] items-baseline gap-3 px-2 py-2 text-left text-sm hover:bg-muted/50${selected === line.key ? " bg-muted" : ""}`}>
              <span className="text-right font-semibold tabular-nums">{line.count}</span>
              <span className="font-medium">{line.label}</span>
              <span className="text-muted-foreground">{line.meaning}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-border px-2 pt-2 text-sm font-medium">{T.summaryTotal(total)}</p>
    </section>
  );
}

/** The filters, as the Submissions table lays them out. */
export function TaskFilters({ rows, filters, onChange }: { rows: readonly TaskTableRow[]; filters: Filters; onChange: (next: Filters) => void }) {
  const statuses = summarize(rows).lines;
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
      <td className="px-3 py-3">{team ? <a href={team.url} target="_blank" rel="noopener noreferrer" title={team.fullName} className="text-primary underline">{team.name}</a> : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-3 py-3">
        <span className="break-all">{row.email || "—"}</span>
        {row.staff ? <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{T.staffTag}</span> : null}
      </td>
      <td className="px-3 py-3"><span className="font-medium">{task.slot}</span>{task.name ? <span className="block text-xs text-muted-foreground">{task.name}</span> : null}</td>
      <td className="px-3 py-3"><span>{status.label}</span>{status.detail ? <span className="block text-xs text-muted-foreground">{status.detail}</span> : null}</td>
      <td className="px-3 py-3">
        <span className="tabular-nums">{coverage.main}</span>
        {coverage.detail ? <span className="block text-xs text-muted-foreground">{coverage.detail}</span> : null}
        {coverage.untested ? <span className="block text-xs text-amber-700 dark:text-amber-300">{coverage.untested}</span> : null}
      </td>
      <td className="px-3 py-3">{goldCell(row.gold)}</td>
      <td className="px-3 py-3 tabular-nums">
        <span className={row.grade ? "" : "text-muted-foreground"}>{grade.text}</span>
        {grade.unreleased ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{T.notReleased}</span> : null}
      </td>
      <td className="px-3 py-3">{staffChangeLines(row).map((line) => <span key={line} className="block text-xs font-medium">{line}</span>)}</td>
      <td className="px-3 py-3"><span className={row.hasReport ? "" : "text-muted-foreground"}>{repo.text}</span>{repo.date ? <span className="block text-xs text-muted-foreground">{repo.date}</span> : null}</td>
    </>
  );
}

/** A patch in a scrolling box with a Copy button that copies it whole. */
function PatchBox({ what, text, boxId }: { what: string; text: string; boxId: string }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{what}</h4>
        <CopyButton text={() => text} label={REVIEW_TEXT.copy} ariaLabel={T.copyPatch(what.toLowerCase())} />
      </div>
      <pre id={boxId} className="max-h-96 overflow-auto rounded-md bg-muted p-2 text-xs">{text || T.emptyPatch}</pre>
    </div>
  );
}

/** The opened row: spec, patches, proving tests, flags, validation, staff changes and the links. */
export function TaskDetailView({ detail, raw = false, onRaw }: { detail: TaskDetail; raw?: boolean; onRaw?: (raw: boolean) => void }) {
  const changes = changedByStaffLines(detail);
  const idBase = `task-${detail.id}`;
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

      <section className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{T.spec}</h4>
          <div role="group" aria-label={REVIEW_TEXT.specViewLabel} className="inline-flex overflow-hidden rounded-md border border-input text-xs">
            <button type="button" aria-pressed={!raw} onClick={() => onRaw?.(false)} className={`px-2 py-1 font-medium ${raw ? "hover:bg-muted" : "bg-primary text-primary-foreground"}`}>{REVIEW_TEXT.formatted}</button>
            <button type="button" aria-pressed={raw} onClick={() => onRaw?.(true)} className={`border-l border-input px-2 py-1 font-medium ${raw ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{REVIEW_TEXT.raw}</button>
          </div>
          <CopyButton text={() => detail.problemStatement} label={REVIEW_TEXT.copy} ariaLabel={REVIEW_TEXT.copySpecLabel} />
        </div>
        {detail.problemStatement ? <div className="rounded-md border border-border"><SpecBody markdown={detail.problemStatement} raw={raw} full={false} boxId={`${idBase}-spec`} /></div> : <p className="text-muted-foreground">{T.noSpec}</p>}
      </section>

      <PatchBox what={T.codePatch} text={detail.patch} boxId={`${idBase}-patch`} />
      <PatchBox what={T.testPatch} text={detail.testPatch} boxId={`${idBase}-test-patch`} />

      <section>
        <h4 className="font-medium">{T.provingHeading(detail.failToPass.length)}</h4>
        {detail.validationStatus !== "validated" ? <p className="text-xs text-muted-foreground">{T.provingGuess}</p> : null}
        {detail.failToPass.length ? <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 font-mono text-xs">{detail.failToPass.map((test) => <li key={test}>{test}</li>)}</ul> : <p className="text-muted-foreground">{T.noProvingTests}</p>}
        <p className="mt-1 text-muted-foreground">{T.stillPass(detail.passToPass)}</p>
      </section>

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

/** The sortable header, as the Submissions table's. */
function Header({ sort, onSort }: { sort: TaskSort; onSort: (key: TaskSortKey) => void }) {
  return (
    <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
      <tr>
        {COLUMNS.map((column) => {
          const active = sort?.key === column.key ? sort.direction : null;
          return (
            <th key={column.key} scope="col" title={column.title} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"} className="px-3 py-3 align-bottom font-medium">
              <button type="button" onClick={() => onSort(column.key)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground">
                {column.label}
                <span aria-hidden="true">{active === "asc" ? "▲" : active === "desc" ? "▼" : "↕"}</span>
              </button>
              {column.note ? <span className="block text-[11px] font-normal normal-case tracking-normal">{column.note}</span> : null}
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
      <SummaryBox rows={rows} selected={filters.status} onPick={(key) => setFilters((current) => withStatus(current, key))} />
      <h2 className="font-semibold">{T.tableHeading}</h2>
      <TaskFilters rows={rows} filters={filters} onChange={setFilters} />
      <p className="text-sm text-muted-foreground" role="status">{T.showing(visible.length, rows.length)}</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1100px] text-left text-sm">
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

