"use client";

import { usePathname } from "next/navigation";

export function Cse115aFooter() {
  const pathname = usePathname();
  if (!pathname.startsWith("/cse115a")) return null;
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-6 text-center text-sm text-slate-600">
      Submit here. On Canvas, submit only your Repo Metrics write-up.
    </footer>
  );
}
