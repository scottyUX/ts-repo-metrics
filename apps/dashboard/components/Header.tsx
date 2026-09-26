/**
 * Theme-aware site header (GitHub Primer-inspired nav strip).
 */

import { HeaderNavClient } from "@/components/HeaderNavClient";
import { Cse115aHeader } from "@/components/cse115a/Cse115aHeader";

export function Header() {
  if (process.env.CSE115A_SITE === "true") return <Cse115aHeader />;
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-muted">
      <div className="container flex h-14 items-center px-4 sm:px-6">
        <HeaderNavClient cse115aSite={process.env.CSE115A_SITE === "true"} />
      </div>
    </header>
  );
}
