import { notFound } from "next/navigation";
import { CourseDashboard } from "@/components/cse115a/CourseDashboard";

export default function Cse115aPreviewPage() {
  if (process.env.NODE_ENV !== "development" || process.env.CSE115A_SITE !== "true") notFound();
  return <CourseDashboard preview />;
}
