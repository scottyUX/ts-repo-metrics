"use client";

export function ResearchFramingBanner() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4 text-sm">
      <p className="font-medium text-blue-900 dark:text-blue-100">
        Research framing
      </p>
      <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-200">
        <li>• Each repository = one observation in the dataset.</li>
        <li>• Features operationalize RQ1–RQ3 (structural, behavioral, verification).</li>
        <li>• Some constructs (e.g., cognitive engagement) are measured externally via survey.</li>
        <li>• Repo-derived features are distinct from survey data.</li>
      </ul>
    </div>
  );
}
