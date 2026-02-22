/**
 * Results page: displays analysis result for a given resultId.
 * Fetches from /api/results/[id]. Placeholder for full dashboard (Story 2.x).
 */

import { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

  let data: unknown = null;
  let error: string | null = null;

  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/results/${id}`, {
      cache: "no-store",
    });
    if (res.ok) {
      data = await res.json();
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

  const report = data as { repoPath?: string; source?: { commit?: string; url?: string } };
  const commit = report?.source?.commit?.slice(0, 7) ?? "—";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analysis Results</h1>
          <p className="text-muted-foreground text-sm">
            Commit: {commit}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">New Analysis</Link>
        </Button>
      </div>

      <pre className="overflow-auto rounded-lg border bg-muted/50 p-4 text-sm">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
