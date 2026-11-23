import { GraderPanel } from "@/components/cse115a/instructor/GraderPanel";

export default async function Cse115aGraderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GraderPanel slug={decodeURIComponent(slug)} />;
}
