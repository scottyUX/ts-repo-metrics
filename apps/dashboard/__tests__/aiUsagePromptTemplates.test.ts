import { describe, expect, it } from "vitest";
import {
  AGENT_STATS_BRANCH,
  AGENT_STATS_REPO_URL,
  AGENT_STATS_DESKTOP_DIR,
  AI_USAGE_DESKTOP_CSV_PATH,
  AI_USAGE_DESKTOP_CSV_PATH_WIN,
  AI_USAGE_PROMPT_PLATFORMS,
  buildAiUsagePrompt,
  getAiUsagePromptPlatform,
} from "../lib/aiUsagePromptTemplates";

describe("aiUsagePromptTemplates", () => {
  it("keeps the supported platform order stable", () => {
    expect(AI_USAGE_PROMPT_PLATFORMS.map((platform) => platform.id)).toEqual([
      "claude",
      "codex",
      "gemini",
      "cursor",
    ]);
  });

  it("builds prompts with the shared repo, branch, filter, and desktop output guidance", () => {
    const prompt = buildAiUsagePrompt("claude");

    expect(prompt).toContain(AGENT_STATS_REPO_URL);
    expect(prompt).toContain(`branch ${AGENT_STATS_BRANCH}`);
    expect(prompt).toContain(AGENT_STATS_DESKTOP_DIR);
    expect(prompt).toContain(AI_USAGE_DESKTOP_CSV_PATH);
    expect(prompt).toContain("Infer the best value for --filter");
    expect(prompt).toContain("If the correct filter is not obvious, ask me for it");
    expect(prompt).toContain("--tokens --messages");
    expect(prompt).toContain("--csv");
  });

  it("includes the Mac roots glob and Windows roots glob for each platform", () => {
    for (const platform of AI_USAGE_PROMPT_PLATFORMS) {
      const prompt = buildAiUsagePrompt(platform.id);
      expect(getAiUsagePromptPlatform(platform.id).label).toBe(platform.label);
      expect(prompt).toContain(`--roots "${platform.rootsGlob}"`);
      expect(prompt).toContain(`--roots "${platform.rootsGlobWindows}"`);
      expect(prompt).toContain(AI_USAGE_DESKTOP_CSV_PATH_WIN);
    }
  });

  it("includes Linux roots glob for Cursor (differs from Mac)", () => {
    const prompt = buildAiUsagePrompt("cursor");
    const cursorConfig = getAiUsagePromptPlatform("cursor");
    expect(cursorConfig.rootsGlobLinux).toBeDefined();
    expect(prompt).toContain(`--roots "${cursorConfig.rootsGlobLinux}"`);
  });

  it("includes coding_agent guidance for Cursor", () => {
    const prompt = buildAiUsagePrompt("cursor");
    expect(prompt).toContain("coding_agent = cursor");
    expect(prompt).toContain("workspaceStorage");
  });

  it("groups Mac and Linux together for platforms where the path is the same", () => {
    for (const platform of AI_USAGE_PROMPT_PLATFORMS) {
      if (platform.id === "cursor") continue;
      const prompt = buildAiUsagePrompt(platform.id);
      expect(prompt).toContain("Mac / Linux:");
      expect(prompt).not.toContain("Mac:\n");
    }
  });
});
