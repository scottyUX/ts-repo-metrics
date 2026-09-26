import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "CSE 115A Repo Metrics" };

export default function Cse115aLanding() {
  return (
    <div className="w-full max-w-5xl py-16 sm:py-24">
      <div className="mx-auto max-w-3xl space-y-7 text-center">
        <p className="mx-auto w-fit rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">For CSE 115A students</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">Your sprint work, all in one place.</h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600">Join your course with the code from your instructor. For each assignment, submit two merged task pull requests and review what Repo Metrics finds.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/cse115a/signup" className="rounded-lg bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800">Sign up</Link>
          <Link href="/cse115a/signin" className="rounded-lg border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-50">Sign in</Link>
        </div>
      </div>
      <div className="mt-20 grid gap-4 sm:grid-cols-3">
        {[
          ["1", "Join your course", "Sign in with your UCSC Google account and enter your quarter’s course code."],
          ["2", "Submit task PRs", "Choose Assignment 1, 2, 3, and beyond. Paste one merged PR for each task."],
          ["3", "Review the evidence", "We import your task spec and run Repo Metrics on the code changed by the PR."],
        ].map(([number, title, copy]) => (
          <div key={number} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="text-sm font-bold text-emerald-700">{number}</span>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
