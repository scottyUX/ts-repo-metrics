import Link from "next/link";
import { UcscGoogleButton } from "@/components/cse115a/UcscGoogleButton";

export default function Cse115aSignin() {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm">
      <h1 className="text-2xl font-bold">Sign in to Repo Metrics</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">Continue with the UCSC Google account you used to join your course.</p>
      <div className="mt-8"><UcscGoogleButton /></div>
      <p className="mt-6 text-sm text-slate-600">New student? <Link href="/cse115a/signup" className="font-medium text-emerald-700 underline">Sign up</Link></p>
    </div>
  );
}
