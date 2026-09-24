import { notFound } from "next/navigation";
import { CourseDashboard, type PreviewState } from "@/components/cse115a/CourseDashboard";

export default async function Cse115aPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.CSE115A_SITE !== "true") notFound();
  const { state } = await searchParams;
  const previewState: PreviewState = state === "submitted" || state === "ready" || state === "grading" || state === "released" ? state : "draft";
  return <CourseDashboard preview previewState={previewState} />;
}
