"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RiskProfileHelpBody } from "./metricHelpContent";
import { ConceptHelpDialog } from "../ConceptHelpDialog";

type QuadrantPosition = "tl" | "tr" | "bl" | "br";

interface TestingRiskQuadrantProps {
  /** Section heading (e.g. includes “whole repository” when scoped to a contributor). */
  sectionTitle?: string;
  riskIndex: number;
  verificationIndex: number;
  riskLabel: "Low" | "High";
  /** Null when there is no source code to measure verification against. */
  verificationLabel: "Low" | "High" | null;
  /** When true, show that indices come from the whole-repository scan (contributor dropdown does not apply). */
  wholeRepositoryNote?: boolean;
  /** Repo-wide counts backing structural risk (same basis as quadrant). */
  structuralRiskSignals?: {
    highComplexityFunctions: number;
    longFunctions: number;
    /** Functions in either count, each counted once; absent in older reports. */
    highComplexityOrLongFunctions?: number;
  };
  /** Snapshot test LOC ÷ source LOC (0–1), same basis as verification score. */
  testLocShare?: number;
  /** True when the report covers only the files in one pull request */
  prScoped?: boolean;
}

const QUADRANT_COPY: Record<
  QuadrantPosition,
  { title: string; description: string }
> = {
  tl: {
    title: "Low risk / Low verification",
    description:
      "Structural risk is modest and test LOC ratio is below the dashboard threshold. Fine while complexity stays low — watch both as the codebase grows.",
  },
  tr: {
    title: "Low risk / High verification",
    description:
      "Strong verification density relative to structural risk — a good balance for this summary view.",
  },
  bl: {
    title: "High risk / Low verification",
    description:
      "Complex areas with comparatively little test code in the tree. Bugs are harder to catch and fix without more verification near hotspots.",
  },
  br: {
    title: "High risk / High verification",
    description:
      "Complexity is elevated but test density helps offset it. Keep tightening remaining hotspots.",
  },
};

/** Dark panel shell for the risk profile card (matches existing Testing tab styling). */
const shell = "rounded-[14px] border border-[#262626] bg-[#171717] text-[#fafafa] shadow-sm";
const matrixShell =
  "rounded-[10px] border border-[#262626] bg-[#0a0a0a] p-2 sm:p-2.5";
const axisLabel =
  "text-center text-[11px] font-normal uppercase leading-[16.5px] tracking-normal text-[#a1a1a1]";
const structuralRiskAxisLabel =
  "inline-block text-[9px] font-normal uppercase leading-[13px] tracking-normal text-[#a1a1a1] [writing-mode:vertical-rl] rotate-180 text-center";
const sideLabel =
  "text-[11px] font-normal uppercase leading-[16.5px] tracking-[1.5px] text-[#a1a1a1]";
const indexValueClass =
  "font-sans text-[24px] font-bold tabular-nums leading-[36px] tracking-tight";

function activePosition(
  riskLabel: "Low" | "High",
  verificationLabel: "Low" | "High" | null,
): QuadrantPosition | null {
  if (verificationLabel === null) return null;
  const lowRisk = riskLabel === "Low";
  const lowVer = verificationLabel === "Low";
  if (lowRisk && lowVer) return "tl";
  if (lowRisk && !lowVer) return "tr";
  if (!lowRisk && lowVer) return "bl";
  return "br";
}

function narrativeForActive(pos: QuadrantPosition | null): string {
  if (pos === null) {
      return "There is no source code in the snapshot, so verification density (test LOC ratio) can't be measured or placed on this chart.";
  }
  switch (pos) {
    case "tl":
      return "Structural risk is low, but verification density (test LOC ratio) is also low. You have runway—add tests before complexity climbs.";
    case "tr":
      return "Verification density looks healthy relative to structural risk. Maintain this balance as features and complexity evolve.";
    case "bl":
      return "Structural risk is high while verification density (test LOC ratio) is low. This combination deserves attention first—increase tests or simplify risky areas.";
    case "br":
      return "Complexity is high, but test density is helping. Continue focusing reviews and tests on the highest-risk functions.";
  }
}

function cell(position: QuadrantPosition, active: QuadrantPosition | null, roomy: boolean) {
  const { title, description } = QUADRANT_COPY[position];
  const isHere = active === position;
  const isIdeal = position === "tr";

  const zoneClass =
    position === "tl"
      ? "bg-[#262626]"
      : position === "tr"
        ? "border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)]"
        : position === "bl"
          ? "border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.15)]"
          : "border border-[rgba(234,179,8,0.3)] bg-[rgba(234,179,8,0.15)]";

  const badge = isIdeal ? (isHere ? "Ideal · You are here" : "Ideal") : isHere ? "You are here" : null;
  const badgeClass =
    position === "tl"
      ? "border-[#a1a1a1] bg-[rgba(161,161,161,0.15)] text-[#fafafa]"
      : position === "tr"
        ? "border-[#22c55e] bg-[rgba(34,197,94,0.15)] text-[#22c55e]"
        : position === "bl"
          ? "border-[#ef4444] bg-[rgba(239,68,68,0.15)] text-[#ef4444]"
          : "border-[#eab308] bg-[rgba(234,179,8,0.15)] text-[#eab308]";

  const titleClass =
    position === "tr"
      ? "text-[13px] font-semibold leading-4 text-[#22c55e]"
      : "text-[13px] font-semibold leading-4 text-[#fafafa]";

  const bodyClass =
    position === "tr"
      ? "text-[11px] font-normal leading-4 text-[rgba(34,197,94,0.8)]"
      : "text-[11px] font-normal leading-4 text-[#a1a1a1]";

  return (
    <div
      role="group"
      aria-label={`${title}. ${QUADRANT_COPY[position].description}${isHere ? " Current zone." : ""}`}
      className={cn(
        "relative flex flex-col gap-1.5 rounded-lg px-3.5 pt-3.5 pb-2 transition-colors",
        roomy ? "min-h-[9rem] sm:min-h-[11rem]" : "min-h-[7.875rem] sm:min-h-[8rem]",
        zoneClass,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {badge ? (
          <span
            className={cn(
              "inline-flex h-[22px] items-center rounded-full border px-2",
              "text-[11px] font-medium leading-none",
              badgeClass,
            )}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <p className={titleClass}>{title}</p>
      <p className={bodyClass}>{description}</p>
    </div>
  );
}

interface TestingRiskQuadrantInnerProps {
  sectionTitle: string;
  wholeRepositoryNote: boolean;
  riskIndex: number;
  verificationIndex: number;
  riskLabel: "Low" | "High";
  verificationLabel: "Low" | "High" | null;
  structuralRiskSignals?: {
    highComplexityFunctions: number;
    longFunctions: number;
    /** Functions in either count, each counted once; absent in older reports. */
    highComplexityOrLongFunctions?: number;
  };
  testLocShare?: number;
  prScoped?: boolean;
  roomy: boolean;
  headerTrailing: ReactNode;
}

function formatScorePercent(index: number): string {
  if (!Number.isFinite(index)) return "—";
  return `${Math.round(Math.min(1, Math.max(0, index)) * 100)}%`;
}

function TestingRiskQuadrantInner({
  sectionTitle,
  wholeRepositoryNote,
  riskIndex,
  verificationIndex,
  riskLabel,
  verificationLabel,
  structuralRiskSignals,
  testLocShare,
  roomy,
  prScoped,
  headerTrailing,
}: TestingRiskQuadrantInnerProps) {
  const active = activePosition(riskLabel, verificationLabel);
  const narrative = narrativeForActive(active);
  const showImproveCta = active !== "tr";

  const riskRaw =
    structuralRiskSignals != null
      ? (structuralRiskSignals.highComplexityOrLongFunctions ??
        structuralRiskSignals.highComplexityFunctions + structuralRiskSignals.longFunctions)
      : null;
  const riskFootnote =
    structuralRiskSignals != null && riskRaw != null ? (
      <p className="mt-1.5 text-[11px] font-normal leading-snug text-[#737373]">
        From <span className="tabular-nums text-[#a1a1a1]">{structuralRiskSignals.highComplexityFunctions}</span>{" "}
        high-complexity +{" "}
        <span className="tabular-nums text-[#a1a1a1]">{structuralRiskSignals.longFunctions}</span> long functions (
        <span className="tabular-nums text-[#a1a1a1]">{riskRaw}</span>{" "}
        {structuralRiskSignals.highComplexityOrLongFunctions != null ? "distinct" : "combined"}). Score is that count ÷
        20, capped at 100%.
      </p>
    ) : null;

  const sharePct =
    typeof testLocShare === "number" && Number.isFinite(testLocShare)
      ? parseFloat((testLocShare * 100).toFixed(1))
      : null;
  const verificationFootnote =
    sharePct != null ? (
      <p className="mt-1.5 text-[11px] font-normal leading-snug text-[#737373]">
        Test code is <span className="tabular-nums text-[#a1a1a1]">{sharePct}%</span> of source LOC
        ({prScoped ? "files in this PR" : "repo snapshot"}).
        Score is 5× that share, capped at 100% (reaches max when test share is at least 20%).
      </p>
    ) : null;

  return (
    <>
      <div className="mb-5 flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 pr-2">
          <h2 className="text-base font-semibold leading-6 tracking-tight text-[#fafafa]">
            {sectionTitle}
          </h2>
          <p className="max-w-3xl text-sm font-normal leading-5 text-[#a1a1a1]">
            Structural risk from complexity + long functions versus verification density (test LOC ratio)
            — not instrumented line coverage.
          </p>
          {wholeRepositoryNote ? (
            <p className="text-xs font-medium text-amber-200/90">
              Based on the {prScoped ? "pull-request" : "whole-repository"} scan; unchanged when you pick a contributor above.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">{headerTrailing}</div>
      </div>

      <div
        className={cn(
          "flex flex-col lg:flex-row lg:items-start",
          roomy ? "gap-8 lg:gap-10" : "gap-6 lg:gap-6",
        )}
      >
        <div className={cn(matrixShell, roomy && "p-3 sm:p-4", "min-w-0 flex-1")}>
          <div
            className="grid gap-x-2 gap-y-2"
            style={{ gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, 1fr)" }}
          >
            <div className="min-h-4" />
            <div className={axisLabel}>Low verification</div>
            <div className={axisLabel}>High verification</div>

            <div className="flex w-9 max-w-[2.25rem] items-center justify-center sm:w-9">
              <span className={structuralRiskAxisLabel}>Low structural risk</span>
            </div>
            {cell("tl", active, roomy)}
            {cell("tr", active, roomy)}
            <div className="flex w-9 max-w-[2.25rem] items-center justify-center sm:w-9">
              <span className={structuralRiskAxisLabel}>High structural risk</span>
            </div>
            {cell("bl", active, roomy)}
            {cell("br", active, roomy)}
          </div>
        </div>

        <aside
          className={cn(
            "flex w-full shrink-0 flex-col justify-start gap-5",
            roomy ? "lg:max-w-lg xl:max-w-xl" : "lg:max-w-md",
          )}
        >
          <div className="space-y-1.5">
            <p className={sideLabel}>Structural risk score</p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  indexValueClass,
                  riskLabel === "High" ? "text-[#ef4444]" : "text-[#22c55e]",
                )}
              >
                {formatScorePercent(riskIndex)}
              </span>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-lg px-2 text-[10px] font-medium leading-[15px]",
                  riskLabel === "High"
                    ? "bg-[rgba(239,68,68,0.08)] text-[#ef4444]"
                    : "bg-[rgba(34,197,94,0.08)] text-[#22c55e]",
                )}
              >
                {riskLabel} band
              </span>
            </div>
            {riskFootnote}
          </div>

          <div className="space-y-1.5">
            <p className={sideLabel}>Verification score</p>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  indexValueClass,
                  verificationLabel === "High"
                   ? "text-[#22c55e]"
                   : verificationLabel === "Low"
                    ? "text-[#eab308]"
                    : "text-[#a1a1a1]",
                )}
              >
                {formatScorePercent(verificationIndex)}
              </span>
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-lg px-2 text-[10px] font-medium leading-[15px]",
                  verificationLabel === "High"
                    ? "bg-[rgba(34,197,94,0.08)] text-[#22c55e]"
                    : verificationLabel === "Low"
                      ? "border border-[#eab308]/50 bg-[rgba(234,179,8,0.08)] text-[#eab308]"
                      : "bg-[#262626] text-[#a1a1a1]",
                )}
              >
                {verificationLabel ? `${verificationLabel} band` : "No data"}
              </span>
            </div>
            {verificationFootnote}
          </div>

          <div className="h-px w-full shrink-0 bg-[#262626]" aria-hidden />
          <div>
            <p className="text-sm font-normal leading-[22px] text-[#a1a1a1]">{narrative}</p>
            {showImproveCta ? (
              <p className="mt-4">
                <a
                  href="#testing-safety-nets"
                  className="text-sm font-normal leading-5 text-[#eab308] underline-offset-4 hover:underline"
                >
                  → Jump to safety-net metrics
                </a>
              </p>
            ) : (
              <p className="mt-4 text-sm text-[#a1a1a1]">
                Keep pairing complexity reviews with test proximity checks as you ship.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

export function TestingRiskQuadrant({
  sectionTitle = "Your risk profile",
  riskIndex,
  verificationIndex,
  riskLabel,
  verificationLabel,
  wholeRepositoryNote = false,
  structuralRiskSignals,
  testLocShare,
  prScoped,
}: TestingRiskQuadrantProps) {
  const [fullOpen, setFullOpen] = useState(false);

  const innerProps: TestingRiskQuadrantInnerProps = {
    sectionTitle,
    wholeRepositoryNote,
    riskIndex,
    verificationIndex,
    riskLabel,
    verificationLabel,
    structuralRiskSignals,
    testLocShare,
    prScoped,
    roomy: false,
    headerTrailing: (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-[#a1a1a1] hover:bg-transparent hover:text-[#fafafa]"
        aria-label="Open risk profile full screen"
        onClick={() => setFullOpen(true)}
      >
        <Maximize2 className="size-4" aria-hidden strokeWidth={1.75} />
      </Button>
    ),
  };

  return (
    <>
      <div className={cn(shell, "p-5 sm:p-6")}>
        <TestingRiskQuadrantInner {...innerProps} />
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "top-0 left-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 bg-[#0a0a0a] p-0 shadow-xl",
            "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 sm:max-w-none",
          )}
        >
          <div className={cn(shell, "border-[#262626] m-4 rounded-[14px] border sm:m-6 sm:p-8")}>
            <TestingRiskQuadrantInner
              sectionTitle={sectionTitle}
              wholeRepositoryNote={wholeRepositoryNote}
              riskIndex={riskIndex}
              verificationIndex={verificationIndex}
              riskLabel={riskLabel}
              verificationLabel={verificationLabel}
              structuralRiskSignals={structuralRiskSignals}
              testLocShare={testLocShare}
              prScoped={prScoped}
              roomy
              headerTrailing={null}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
