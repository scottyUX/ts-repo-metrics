import type { Metadata } from "next";
import { ConsentPage } from "@/components/cse115a/ConsentPage";

export const metadata: Metadata = { title: "Research consent · CSE 115A" };

/** The research consent question at its own address, so staff can send one link. */
export default function Cse115aConsentPage() {
  return <ConsentPage />;
}
