import { createElement, Fragment, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TestingRiskQuadrant } from "../components/results/rq/TestingRiskQuadrant";

// Render the open dialog inline for the Node suite while retaining Radix's
// real Content/Title context and aria-labelledby relationship.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Root: (props: ComponentProps<typeof actual.Root>) =>
      createElement(actual.Root, { ...props, open: true }),
    Portal: ({ children }: { children?: ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

vi.mock("@/components/results/ConceptHelpDialog", () => ({
  ConceptHelpDialog: () => null,
}));

describe("expanded risk profile dialog", () => {
  it.each([
    { sectionTitle: undefined, expectedTitle: "Your risk profile" },
    {
      sectionTitle: "Risk profile for the whole repository",
      expectedTitle: "Risk profile for the whole repository",
    },
  ])("has the accessible name $expectedTitle", ({ sectionTitle, expectedTitle }) => {
    const html = renderToStaticMarkup(
      createElement(TestingRiskQuadrant, {
        sectionTitle,
        riskIndex: 20,
        verificationIndex: 70,
        riskLabel: "Low",
        verificationLabel: "High",
      }),
    );

    const dialogTag = html.match(/<div\b[^>]*\brole="dialog"[^>]*>/)?.[0];
    expect(dialogTag).toBeDefined();
    const titleId = dialogTag?.match(/\baria-labelledby="([^"]+)"/)?.[1];
    expect(titleId).toBeDefined();

    const title = [...html.matchAll(/<h2\b([^>]*)>([^<]*)<\/h2>/g)].find(
      ([, attributes]) => attributes.includes(`id="${titleId}"`),
    );
    expect(title).toBeDefined();
    expect(title?.[1]).toMatch(/\bclass="[^"]*\bsr-only\b/);
    expect(title?.[2]).toBe(expectedTitle);
  });
});
