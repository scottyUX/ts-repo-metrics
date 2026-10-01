import { notFound } from "next/navigation";
import { CourseSetupPreview, type SetupPreviewState } from "./CourseSetupPreview";

export default async function Cse115aSetupPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state } = await searchParams;
  const previewState: SetupPreviewState = state === "course" || state === "connected" ? state : "github";
  return <CourseSetupPreview state={previewState} />;
}
