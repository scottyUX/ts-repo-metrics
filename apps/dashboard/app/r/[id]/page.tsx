/**
 * Results page: displays analysis result for a given resultId.
 * Fetches directly from Supabase (avoids HTTP fetch to own API which can fail in serverless).
 */

import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { getReportById } from "@/lib/getReportById";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Results: ${id} | Repo Metrics` };
}

export default async function ResultsPage({ params }: PageProps) {
  const { id } = await params;
  const { data, error } = await getReportById(id);

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Result not found</h1>
        <p className="text-muted-foreground">{error ?? "Failed to load result"}</p>
        <Button asChild>
          <Link href="/">Back to Analyze</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl">
      <ResultsDashboard report={data} resultId={id} />
    </div>
  );
}
