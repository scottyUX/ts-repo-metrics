import { Badge } from "@/components/ui/badge";
import { buildLanguageSummaryView } from "@/lib/languageSummary";
import type { RepoReport } from "@/lib/reportTypes";

export function AnalyzedLanguagesSummary({ report }: { report: RepoReport }) {
  const view = buildLanguageSummaryView(report);
  if (!view) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Languages in {view.corpus}.</span>{" "}
        {view.segments.join(" · ")}
      </p>
      {view.badges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {view.badges.map((badge) => (
            <Badge key={badge} variant="outline">
              {badge}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
