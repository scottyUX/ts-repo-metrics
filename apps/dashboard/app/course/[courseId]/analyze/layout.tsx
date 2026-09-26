import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Repo Analytics | Course Submission",
};

export default function CourseAnalyzeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.CSE115A_SITE === "true") redirect("/cse115a");
  return children;
}
