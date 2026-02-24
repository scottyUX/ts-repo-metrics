import DocsContent from "@/components/docs/DocsContent";

export const metadata = {
  title: "Docs | Repo Metrics",
  description:
    "Technical documentation: overview, architecture, metrics, data pipeline, reproducibility.",
};

export default function DocsPage() {
  return (
    <div className="container py-8">
      <DocsContent />
    </div>
  );
}
