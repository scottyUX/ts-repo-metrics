import { notFound } from "next/navigation";
import { SprintChecklistPreview } from "./SprintChecklistPreview";

export default function Cse115aSprintChecklistPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SprintChecklistPreview />;
}
