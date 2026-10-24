/**
 * Main landing page — hero + dashboard preview + feature sections.
 */

import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AnalyzeRepositoryHero } from "@/components/analyze/AnalyzeRepositoryHero";
import { DashboardPreview } from "@/components/landing/DashboardPreview";
import { FeatureSections } from "@/components/landing/FeatureSections";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function HomePage() {
  await connection();
  if (process.env.CSE115A_SITE === "true") {
    redirect("/cse115a");
  }
  return (
    <div className="w-full pb-16">
      {/* Hero */}
      <div className="flex justify-center">
        <AnalyzeRepositoryHero />
      </div>

      {/* Dashboard preview */}
      <div className="mx-auto mt-12 w-full max-w-5xl">
        <DashboardPreview />
      </div>

      {/* Feature sections */}
      <div className="mt-4">
        <FeatureSections />
      </div>
    </div>
  );
}
