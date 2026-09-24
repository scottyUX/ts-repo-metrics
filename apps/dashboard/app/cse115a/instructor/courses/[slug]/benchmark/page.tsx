import { BenchmarkPanel } from "@/components/cse115a/instructor/BenchmarkPanel";

export default async function Cse115aBenchmarkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BenchmarkPanel slug={decodeURIComponent(slug)} />;
}
