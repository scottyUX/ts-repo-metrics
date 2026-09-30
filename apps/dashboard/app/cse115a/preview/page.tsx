import { notFound } from "next/navigation";
import { CourseDashboard, type PreviewState } from "@/components/cse115a/CourseDashboard";

export default async function Cse115aPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state } = await searchParams;
  const states: PreviewState[] = ["joined", "draft", "ready", "submitted", "needs-fixes", "grading", "released"];
  const previewState: PreviewState = states.includes(state as PreviewState) ? state as PreviewState : "draft";
  return <CourseDashboard preview previewState={previewState} />;
}
