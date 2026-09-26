"use client";

import { usePathname } from "next/navigation";

export function Cse115aMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const resultsPage = pathname === "/cse115a/preview" || pathname === "/cse115a/dashboard" || pathname === "/cse115a/preview/results" || /^\/cse115a\/assignments\/\d+\/tasks\/[12]\/metrics$/.test(pathname) || pathname.startsWith("/cse115a/instructor");
  return (
    <main className={`flex-1 flex flex-col items-center justify-start py-6 px-4 sm:px-6 min-h-[calc(100vh-4rem)] ${resultsPage ? "bg-background text-foreground" : "bg-slate-50 text-slate-900"}`}>
      {children}
    </main>
  );
}
