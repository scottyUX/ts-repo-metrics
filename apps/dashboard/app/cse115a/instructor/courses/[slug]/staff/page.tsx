import { StaffPanel } from "@/components/cse115a/instructor/StaffPanel";

export default async function Cse115aStaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StaffPanel slug={decodeURIComponent(slug)} />;
}
