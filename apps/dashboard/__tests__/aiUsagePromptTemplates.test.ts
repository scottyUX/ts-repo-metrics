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

  it("uses the same roots glob for Mac and Linux for Cursor (agent-transcripts path)", () => {
    const cursorConfig = getAiUsagePromptPlatform("cursor");
    expect(cursorConfig.rootsGlobLinux).toBeUndefined();
    expect(cursorConfig.rootsGlob).toContain(".cursor/projects");
    expect(cursorConfig.rootsGlob).toContain("agent-transcripts");
  });

  it("includes coding_agent guidance for Cursor", () => {
    const prompt = buildAiUsagePrompt("cursor");
    expect(prompt).toContain(".cursor/projects");
    expect(prompt).toContain("agent-transcripts");
    expect(prompt).toContain("Cursor logs are JSONL files");
  });

  it("groups Mac and Linux together for all platforms including Cursor", () => {
    for (const platform of AI_USAGE_PROMPT_PLATFORMS) {
      const prompt = buildAiUsagePrompt(platform.id);
      expect(prompt).toContain("Mac / Linux:");
      expect(prompt).not.toContain("Mac:\n");
    }
  });
});
