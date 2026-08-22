const PREVIEW_METRICS = [
  { label: "Code Complexity", score: 77, rating: "Strong",     color: "text-status-positive" },
  { label: "Commit Habits",   score: 70, rating: "Strong",     color: "text-status-positive" },
  { label: "Testing",         score: 69, rating: "Good",       color: "text-status-positive" },
  { label: "Code Quality",    score: 40, rating: "Needs Work", color: "text-status-warning" },
  { label: "React",           score: 18, rating: "Critical",   color: "text-status-critical" },
] as const;

const PREVIEW_CARDS = [
  { label: "Total Commits",      value: "114",   rating: "Strong",     sub: "114 commits — solid volume for review rhythm" },
  { label: "Commits Per Week",   value: "5.30",  rating: "Strong",     sub: "Consistent cadence, steady integration" },
  { label: "Large Commit Ratio", value: "34.2%", rating: "Needs Work", sub: "Split work where you can to ease review" },
] as const;

const PREVIEW_TABS = [
  "Commit Habits", "Testing", "Code Quality",
  "React Components", "AI Usage", "Documentation",
] as const;

export function DashboardPreview() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex gap-1.5">
          <div className="size-3 rounded-full bg-red-400/50" />
          <div className="size-3 rounded-full bg-yellow-400/50" />
          <div className="size-3 rounded-full bg-green-400/50" />
        </div>
        <div className="mx-auto rounded-md bg-background/60 px-4 py-1 text-xs text-muted-foreground">
          ts-repo-metrics-production.up.railway.app/r/…
        </div>
      </div>

      <div className="space-y-5 p-5">
        {/* Top metric chips */}
        <div className="grid grid-cols-5 gap-3">
          {PREVIEW_METRICS.map((m) => (
            <div key={m.label} className="space-y-1 rounded-lg border border-border bg-background/60 p-3">
              <p className="truncate text-[10px] text-muted-foreground">{m.label}</p>
              <p className={`text-[10px] font-medium ${m.color}`}>{m.rating}</p>
              <p className="text-xl font-bold">{m.score}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-0 overflow-x-auto border-b border-border">
          {PREVIEW_TABS.map((tab, i) => (
            <div
              key={tab}
              className={`shrink-0 px-3 py-2 text-[11px] font-medium ${
                i === 0 ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
              }`}
            >
              {tab}
            </div>
          ))}
        </div>

        {/* Metric detail cards */}
        <div className="grid grid-cols-3 gap-3">
          {PREVIEW_CARDS.map((m) => (
            <div key={m.label} className="space-y-1 rounded-lg border border-border bg-background/40 p-4">
              <p className="text-[11px] text-muted-foreground">{m.label}</p>
              <p className={`text-[10px] font-medium ${m.rating === "Strong" ? "text-status-positive" : "text-status-warning"}`}>
                {m.rating}
              </p>
              <p className="text-2xl font-bold">{m.value}</p>
              <p className="text-[10px] leading-snug text-muted-foreground">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
