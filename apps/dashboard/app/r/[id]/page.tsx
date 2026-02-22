/**
 * Results page: displays analysis result for a given resultId.
 * Fetches from /api/results/[id]. Renders ResultsDashboard with KPIs, hotspots, file table.
 */

import { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import type { RepoReport } from "@/lib/reportTypes";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Results: ${id} | Repo Metrics` };
}

async function getBaseUrl(): Promise<string> {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export default async function ResultsPage({ params }: PageProps) {
  const { id } = await params;

  let data: RepoReport | null = null;
  let error: string | null = null;

  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/results/${id}`, {
      cache: "no-store",
    });
    if (res.ok) {
      data = (await res.json()) as RepoReport;
    } else {
      const body = await res.json();
      error = body.error ?? "Not found";
    }
  } catch {
    error = "Failed to load result";
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <h1 className="text-2xl font-semibold">Result not found</h1>
        <p className="text-muted-foreground">{error}</p>
        <Button asChild>
          <Link href="/">Back to Analyze</Link>
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="w-full max-w-6xl">
      <ResultsDashboard report={data} resultId={id} />
    </div>
  );
}
