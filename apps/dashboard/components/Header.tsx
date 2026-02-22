/**
 * Site header with navigation.
 * Uses shadcn primitives. Layout inspired by github.gg.
 * @see https://ui.aceternity.com/ — Aceternity UI
 * @see https://ui.shadcn.com/ — shadcn/ui
 */

import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2 font-semibold">
          <span>Repo Metrics</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
            Analyze
          </Link>
          <Link
            href="/components"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Components
          </Link>
        </nav>
      </div>
    </header>
  );
}
