/**
 * Theme-aware site header (GitHub Primer-inspired nav strip).
 */

import { HeaderNavClient } from "@/components/HeaderNavClient";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-muted">
      <div className="container flex h-14 items-center px-4 sm:px-6">
        <HeaderNavClient />
      </div>
    </header>
  );
}
