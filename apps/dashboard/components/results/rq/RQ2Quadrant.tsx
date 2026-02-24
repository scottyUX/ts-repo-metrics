"use client";

interface RQ2QuadrantProps {
  riskIndex: number;
  verificationIndex: number;
  riskLabel: "Low" | "High";
  verificationLabel: "Low" | "High";
}

export function RQ2Quadrant({
  riskIndex,
  verificationIndex,
  riskLabel,
  verificationLabel,
}: RQ2QuadrantProps) {
  const quadrant =
    riskLabel === "High" && verificationLabel === "Low"
      ? "High risk / Low verification"
      : riskLabel === "High" && verificationLabel === "High"
        ? "High risk / High verification"
        : riskLabel === "Low" && verificationLabel === "Low"
          ? "Low risk / Low verification"
          : "Low risk / High verification";

  return (
    <div className="rounded-md border p-4 space-y-4">
      <h3 className="font-medium">Risk vs Verification Profile</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Risk index: </span>
          <span className="font-mono">{riskIndex.toFixed(2)}</span>
          <span className="ml-2 text-muted-foreground">({riskLabel})</span>
        </div>
        <div>
          <span className="text-muted-foreground">Verification index: </span>
          <span className="font-mono">{verificationIndex.toFixed(2)}</span>
          <span className="ml-2 text-muted-foreground">({verificationLabel})</span>
        </div>
      </div>
      <div className="rounded bg-muted/50 px-3 py-2">
        <span className="font-medium">Quadrant: </span>
        <span>{quadrant}</span>
      </div>
    </div>
  );
}
