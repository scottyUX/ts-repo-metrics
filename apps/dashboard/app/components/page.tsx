/**
 * Component inventory page (Story 0.2).
 * Lists all UI components used in the dashboard with reference links.
 * Only Aceternity UI and shadcn primitives — no custom UI libraries.
 * @see https://ui.aceternity.com/ — Aceternity UI
 * @see https://ui.shadcn.com/ — shadcn/ui
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";

const COMPONENTS = [
  {
    name: "Button",
    source: "shadcn/ui",
    url: "https://ui.shadcn.com/docs/components/button",
    usedIn: ["Landing (Analyze)", "Results", "Components page"],
  },
  {
    name: "Input",
    source: "shadcn/ui",
    url: "https://ui.shadcn.com/docs/components/input",
    usedIn: ["Landing (GitHub URL input)"],
  },
  {
    name: "Toaster (Sonner)",
    source: "sonner (toast)",
    url: "https://sonner.emilkowal.ski/",
    usedIn: ["Layout — error/success toasts"],
  },
  {
    name: "Card",
    source: "shadcn/ui",
    url: "https://ui.shadcn.com/docs/components/card",
    usedIn: ["— (planned for KPI cards)"],
  },
  {
    name: "Table",
    source: "shadcn/ui",
    url: "https://ui.shadcn.com/docs/components/table",
    usedIn: ["— (planned for file/hotspot tables)"],
  },
  {
    name: "Badge",
    source: "shadcn/ui",
    url: "https://ui.shadcn.com/docs/components/badge",
    usedIn: ["— (planned for complexity thresholds)"],
  },
] as const;

export const metadata = {
  title: "Component Inventory | Repo Metrics",
  description: "UI components used in the dashboard",
};

export default function ComponentsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Component Inventory</h1>
        <p className="text-muted-foreground mt-1">
          All UI building blocks are from Aceternity UI or shadcn. No custom UI
          libraries beyond these primitives.
        </p>
      </div>

      <div className="space-y-4">
        {COMPONENTS.map((c) => (
          <div
            key={c.name}
            className="rounded-lg border p-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{c.name}</h2>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                {c.source} →
              </a>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Used in: {c.usedIn.join(", ")}
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Design reference:{" "}
        <a
          href="https://www.github.gg/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          github.gg
        </a>
      </p>

      <Button asChild variant="outline">
        <Link href="/">Back to Analyze</Link>
      </Button>
    </div>
  );
}
