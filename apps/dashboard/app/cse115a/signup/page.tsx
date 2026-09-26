import Link from "next/link";
import { UcscGoogleButton } from "@/components/cse115a/UcscGoogleButton";

export default function Cse115aSignup() {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm">
      <h1 className="text-2xl font-bold">Sign up for Repo Metrics</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">Use your UCSC Google account. After sign in, enter the course code from your instructor.</p>
      <div className="mt-8"><UcscGoogleButton /></div>
      <p className="mt-6 text-sm text-slate-600">Already joined? <Link href="/cse115a/signin" className="font-medium text-emerald-700 underline">Sign in</Link></p>
    </div>
  );
}
