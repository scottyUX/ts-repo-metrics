import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TestingRiskQuadrant } from "@/components/results/rq/TestingRiskQuadrant";

type Label = "Low" | "High";

function render(riskLabel: Label, verificationLabel: Label): string {
  return renderToStaticMarkup(
    createElement(TestingRiskQuadrant, {
      riskIndex: riskLabel === "High" ? 1 : 0,
      verificationIndex: verificationLabel === "High" ? 1 : 0,
      riskLabel,
      verificationLabel,
    }),
  );
}

/** Markup for each quadrant cell, keyed by its title. */
function cells(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of html.split('role="group"').slice(1)) {
    const title = /aria-label="([^.]+)\./.exec(part)?.[1];
    if (title) out[title] = part;
  }
  return out;
}

const QUADRANTS: [Label, Label, string][] = [
  ["Low", "Low", "Low risk / Low verification"],
  ["Low", "High", "Low risk / High verification"],
  ["High", "Low", "High risk / Low verification"],
  ["High", "High", "High risk / High verification"],
];

describe("TestingRiskQuadrant", () => {
  it.each(QUADRANTS)(
    "shows You are here only in the current quadrant (risk %s, verification %s)",
    (risk, verification, title) => {
      const html = render(risk, verification);
      expect(html.match(/You are here/g)).toHaveLength(1);
      const here = Object.entries(cells(html)).filter(([, part]) => part.includes("You are here"));
      expect(here.map(([t]) => t)).toEqual([title]);
    },
  );

  it("combines Ideal and You are here into one pill in the Ideal quadrant", () => {
    const ideal = cells(render("Low", "High"))["Low risk / High verification"];
    expect(ideal).toContain(">Ideal · You are here</span>");
    expect(ideal.match(/rounded-full/g)).toHaveLength(1);
  });

  it("shows only Ideal in the Ideal quadrant when the user is elsewhere", () => {
    const ideal = cells(render("High", "Low"))["Low risk / High verification"];
    expect(ideal).toContain(">Ideal</span>");
    expect(ideal).not.toContain("You are here");
  });

  it("does not give the High risk / High verification box the badge's solid yellow border when the user is elsewhere", () => {
    const br = cells(render("Low", "Low"))["High risk / High verification"];
    const brCellTag = br.slice(0, br.indexOf(">"));
    expect(brCellTag).toContain("border-[rgba(234,179,8,0.3)]");
    expect(brCellTag).not.toContain("border-[#eab308]");
  });
});
