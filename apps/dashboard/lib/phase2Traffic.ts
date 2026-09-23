import { severityNumericCellClass, type SeverityBand } from "./severityTableCell";
import { cn } from "@/lib/utils";

/**
 * Traffic-light bands for Code Complexity table cells. MI thresholds follow GRAD-AI (2025);
 * CC and cognitive bands follow common SonarSource-style guidance and the project’s
 * Tampere / verification-gap framing (see dashboard legend).
 */
export type Phase2Traffic = SeverityBand;

export function trafficForMiNorm(mi: number): Phase2Traffic {
  if (mi >= 85) return "green";
  if (mi >= 65) return "yellow";
  return "red";
}

/** Cyclomatic complexity: green ≤10, yellow 11–20, red ≥21 */
export function trafficForCyclomatic(cc: number): Phase2Traffic {
  if (cc <= 10) return "green";
  if (cc <= 20) return "yellow";
  return "red";
}

/** Cognitive complexity: green ≤8, yellow 9–15, red ≥16 */
export function trafficForCognitive(c: number): Phase2Traffic {
  if (c <= 8) return "green";
  if (c <= 15) return "yellow";
  return "red";
}

export function phase2TrafficCellClass(
  value: number | null | undefined,
  kind: "mi" | "cc" | "cognitive",
): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "text-right tabular-nums";
  }
  const t =
    kind === "mi"
      ? trafficForMiNorm(value)
      : kind === "cc"
        ? trafficForCyclomatic(value)
        : trafficForCognitive(value);
  return severityNumericCellClass(t);
}

/** Lexical volume: higher is harder; compare to repo mean and p90. */
export function trafficForHalsteadVolume(
  vol: number,
  mean: number,
  p90: number,
): Phase2Traffic {
  if (vol >= p90) return "red";
  if (vol >= mean) return "yellow";
  return "green";
}

export function phase2HalsteadVolumeCellClass(
  vol: number | undefined,
  mean: number,
  p90: number,
): string {
  if (vol === undefined || Number.isNaN(vol)) {
    return "text-right tabular-nums";
  }
  const t = trafficForHalsteadVolume(vol, mean, p90);
  return severityNumericCellClass(t);
}
