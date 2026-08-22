import Link from "next/link";
import { Github } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
        {/* Research disclaimer */}
        <p className="text-xs leading-relaxed text-muted-foreground max-w-2xl">
          The repo analytics tool helps you reflect on your team&apos;s software engineering
          process. After selecting your project repository, the tool will summarize
          repository-level patterns such as development activity, code structure, testing signals,
          and maintainability.{" "}
          This tool is part of research on AI-assisted software engineering education.
          Repository-level metrics from this analysis may be used in anonymized research.{" "}
          <strong className="text-foreground/70">
            This analysis is not used to grade individual students.
          </strong>
        </p>

        {/* Links row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <a
            href="https://github.com/scottyUX/ts-repo-metrics"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github className="size-3.5" aria-hidden />
            GitHub
          </a>
          <Link href="/docs" className="hover:text-foreground transition-colors">
            Docs
          </Link>
          <Link href="/resources" className="hover:text-foreground transition-colors">
            Resources
          </Link>
          <Link href="/support" className="hover:text-foreground transition-colors">
            Report an Issue
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
          <Link href="/license" className="hover:text-foreground transition-colors">
            License
          </Link>
          <span className="ml-auto text-muted-foreground/60">
            © {new Date().getFullYear()} Repo Metrics
          </span>
        </div>
      </div>
    </footer>
  );
}
