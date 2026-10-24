"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchJson, type StaffCourse } from "./shared";

type Staff = { course: StaffCourse; staff: Array<{ email: string; role: "instructor" | "ta"; created_at: string }>; me: string };

export function StaffPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<Staff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"instructor" | "ta">("ta");
  const [busy, setBusy] = useState(false);
  const url = `/api/cse115a/instructor/courses/${encodeURIComponent(slug)}/roles`;

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<Staff>(url));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load staff.");
    }
  }, [url]);
  useEffect(() => { void load(); }, [load]);

  async function change(init: RequestInit, target = url) {
    setBusy(true);
    setError(null);
    try {
      await fetchJson(target, init);
      setEmail("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update staff.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <p role="alert" className="py-10 text-destructive">{error}</p> : <p className="py-10 text-muted-foreground">Loading…</p>;
  const instructor = data.course.role === "instructor";

  return (
    <div className="w-full max-w-3xl space-y-6 py-6">
      <Link href={`/cse115a/instructor?course=${encodeURIComponent(slug)}`} className="text-sm font-medium text-primary underline">← Submissions</Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{data.course.title} · {data.course.term}</p>
        <h1 className="mt-1 text-2xl font-semibold">Staff</h1>
        <p className="mt-1 text-sm text-muted-foreground">Staff sign in with their UCSC Google account. TAs can review, edit, release, and regrade. Only instructors can unlock submissions and manage staff.</p>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {data.staff.map((member) => (
          <li key={member.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{member.email}{member.email === data.me.toLowerCase() ? <span className="ml-2 text-muted-foreground">(you)</span> : null}</span>
            <span className="flex items-center gap-3">
              <span className="text-muted-foreground">{member.role === "ta" ? "TA" : "Instructor"}</span>
              {instructor && member.email !== data.me.toLowerCase() ? (
                <button type="button" disabled={busy} onClick={() => void change({ method: "DELETE" }, `${url}?email=${encodeURIComponent(member.email)}`)} className="text-destructive underline disabled:opacity-50">Remove</button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {instructor ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void change({ method: "POST", body: JSON.stringify({ email, role }) }); }}>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">UCSC email</span>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@ucsc.edu" className="w-64 rounded-lg border border-input bg-background px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as "instructor" | "ta")} className="rounded-lg border border-input bg-background px-3 py-2">
              <option value="ta">TA</option>
              <option value="instructor">Instructor</option>
            </select>
          </label>
          <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button>
        </form>
      ) : null}
    </div>
  );
}
