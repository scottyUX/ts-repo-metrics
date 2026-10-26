import type { Metadata } from "next";
import CourseHelp from "@/components/cse115a/CourseHelp";

export const metadata: Metadata = { title: "Help · CSE 115A" };

export default function Cse115aHelpPage() {
  return <CourseHelp />;
}
