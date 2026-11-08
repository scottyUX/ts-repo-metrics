import type { SymbolVerificationRisk } from "@/lib/reportTypes";

export type RiskTier = "critical" | "high" | "medium" | "low";

export type VerificationLane = "referenced" | "paired_only" | "none";

export interface SymbolRiskScatterPoint {
  /** Stable key for SVG elements */
  key: string;
  x: number;
  /** Discrete test-proximity band (not a 0–1 continuum in practice). */
  lane: VerificationLane;
  labelShort: string;
  tier: RiskTier;
}

/** Map engine evidence to visualization lane (top = stronger test signal). */
export function laneFromEvidence(evidence: SymbolVerificationRisk["evidence"]): VerificationLane {
  switch (evidence) {
    case "referenced_in_test":
      return "referenced";
    case "paired_file_only":
      return "paired_only";
    default:
      return "none";
  }
}

/**
 * Thresholds emphasize high complexity with weak test proximity (`riskScore` from engine).
 */
export function tierFromRisk(r: SymbolVerificationRisk): RiskTier {
  const rs = r.riskScore;
  if (rs >= 28) return "critical";
  if (rs >= 14) return "high";
  if (rs >= 6) return "medium";
  return "low";
}

export function tierAction(tier: RiskTier): string {
  switch (tier) {
    case "critical":
      return "Prioritize tests or decompose.";
    case "high":
      return "Add characterization tests.";
    case "medium":
      return "Consider targeted coverage.";
    default:
      return "Monitor during changes.";
  }
}

export function buildScatterPoints(rows: SymbolVerificationRisk[]): SymbolRiskScatterPoint[] {
  return rows.map((r, i) => ({
    key: `${r.file}:${r.name}:${r.startLine}:${i}`,
    x: r.cyclomaticComplexity,
    lane: laneFromEvidence(r.evidence),
    labelShort: `${r.file}:${r.name}`,
    tier: tierFromRisk(r),
  }));
}

/**
 * Chooses an x-axis upper bound for the complexity scatter so one extreme outlier does not
 * compress the main cluster (empty space on the right). Values above this are drawn at the
 * right edge; see {@link SymbolRiskScatterPoint.x} in tooltips for true complexity.
 */
export function scatterComplexityDisplayMax(xs: number[]): { xMax: number; capped: boolean } {
  if (xs.length === 0) return { xMax: 10, capped: false };
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  const rawMax = sorted[n - 1]!;
  const pick = (p: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))]!;

  if (n < 5) {
    return { xMax: Math.max(8, rawMax), capped: false };
  }

  if (rawMax <= 18) {
    return { xMax: Math.max(8, rawMax), capped: false };
  }

  const p90 = pick(0.9);
  const q1 = pick(0.25);
  const q3 = pick(0.75);
  const iqr = Math.max(1, q3 - q1);
  const fence = q3 + 1.5 * iqr;
  const fromBulk = Math.max(fence, p90 * 1.12, 14);
  const xMax = Math.min(rawMax, fromBulk);
  const capped = xMax < rawMax - 1e-6;
  return { xMax: Math.max(8, xMax), capped };
}
