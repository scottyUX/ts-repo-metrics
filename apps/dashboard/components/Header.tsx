/**
 * Site header matching github.gg layout.
 * Logo left (with padding), nav links, CTA right.
 */

import Link from "next/link";
import { Github } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <Link
          href="/"
          className="flex items-center pl-4 sm:pl-6 text-xl font-bold tracking-tight text-foreground"
        >
          Repo Metrics
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Analyze
          </Link>
          <Link
            href="/docs"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Docs
          </Link>
          <Link
            href="/research"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Research
          </Link>
          <Link
            href="https://github.com/scottyUX/ts-repo-metrics"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            <Github className="size-4" />
            View on GitHub
          </Link>
        </nav>
      </div>
    </header>
  );
}
