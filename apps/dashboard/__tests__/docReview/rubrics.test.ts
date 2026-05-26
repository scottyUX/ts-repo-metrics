import { describe, expect, it } from "vitest";
import { RUBRICS } from "../../lib/docReview/rubrics";

describe("RUBRICS", () => {
  it("defines frozen keys for each structured doc type", () => {
    expect(RUBRICS.release_plan.keys).toHaveLength(10);
    expect(RUBRICS.sprint_plan.keys).toHaveLength(17);
    expect(RUBRICS.sprint_report.keys).toHaveLength(14);
    expect(RUBRICS.test_plan.keys).toHaveLength(9);
  });

  it("uses snake_case keys without spaces", () => {
    for (const def of Object.values(RUBRICS)) {
      for (const key of def.keys) {
        expect(key).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  it("includes non-empty prompt text for each rubric", () => {
    for (const [name, def] of Object.entries(RUBRICS)) {
      expect(def.prompt.length, name).toBeGreaterThan(50);
    }
  });
});
