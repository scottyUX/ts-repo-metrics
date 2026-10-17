import { SubmissionReview } from "@/components/cse115a/instructor/SubmissionReview";

export default async function Cse115aSubmissionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionReview id={id} />;
}
