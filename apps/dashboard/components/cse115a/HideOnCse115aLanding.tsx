"use client";

import { usePathname } from "next/navigation";

export function HideOnCse115aLanding({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/cse115a" || pathname.startsWith("/cse115a/")) return null;
  return children;
}
