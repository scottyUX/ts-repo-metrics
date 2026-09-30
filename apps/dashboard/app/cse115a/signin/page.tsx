import { UcscGoogleButton } from "@/components/cse115a/UcscGoogleButton";
import { redirectCse115aSignedInUser } from "@/lib/cse115a/redirectSignedIn";

export default async function Cse115aSignin() {
  await redirectCse115aSignedInUser();
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm">
      <h1 className="text-2xl font-bold">Continue with UCSC Google</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">Use your @ucsc.edu account. Signing up and signing in are the same step. The course code is requested once, after you sign in.</p>
      <div className="mt-8"><UcscGoogleButton fullWidth /></div>
    </div>
  );
}
