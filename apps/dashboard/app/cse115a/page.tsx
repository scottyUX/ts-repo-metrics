import type { Metadata } from "next";
import { UcscGoogleButton } from "@/components/cse115a/UcscGoogleButton";
import { redirectCse115aSignedInUser } from "@/lib/cse115a/redirectSignedIn";

export const metadata: Metadata = { title: "CSE 115A Repo Metrics" };

export default async function Cse115aLanding() {
  await redirectCse115aSignedInUser();
  return (
    <div className="w-full max-w-5xl py-16 sm:py-24">
      <div className="mx-auto max-w-3xl space-y-7 text-center">
        <p className="mx-auto w-fit rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">For CSE 115A students</p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Submit your sprint tasks.
          <span className="mt-2 block">See how they&apos;re graded.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600">Paste two merged PRs per sprint. We read your task spec, check your tags and tests, and show you the rubric and Repo Metrics results.</p>
        <UcscGoogleButton />
      </div>
    </div>
  );
}
