export type AiUsagePromptPlatform = "claude" | "codex" | "gemini";

export const AGENT_STATS_REPO_URL = "https://github.com/scottyUX/agent_stats";
export const AGENT_STATS_BRANCH = "main";
export const AGENT_STATS_DESKTOP_DIR = "$HOME/Desktop/agent_stats";
export const AI_USAGE_DESKTOP_CSV_PATH = "$HOME/Desktop/ai_usage_trace.csv";

interface AiUsagePromptPlatformConfig {
  id: AiUsagePromptPlatform;
  label: string;
  shortLabel: string;
  rootsGlob: string;
}

export const AI_USAGE_PROMPT_PLATFORMS: readonly AiUsagePromptPlatformConfig[] = [
  {
    id: "claude",
    label: "Claude Code",
    shortLabel: "Claude",
    rootsGlob: "$HOME/.claude/projects/**/*.jsonl",
  },
  {
    id: "codex",
    label: "Codex",
    shortLabel: "Codex",
    rootsGlob: "$HOME/.codex/sessions/**/rollout-*.jsonl",
  },
  {
    id: "gemini",
    label: "Gemini",
    shortLabel: "Gemini",
    rootsGlob: "$HOME/.gemini/tmp/**/session-*.json",
  },
] as const;

export function getAiUsagePromptPlatform(
  platform: AiUsagePromptPlatform,
): AiUsagePromptPlatformConfig {
  const match = AI_USAGE_PROMPT_PLATFORMS.find((item) => item.id === platform);
  if (!match) {
    throw new Error(`Unknown AI usage prompt platform: ${platform}`);
  }
  return match;
}

export function buildAiUsagePrompt(platform: AiUsagePromptPlatform): string {
  const config = getAiUsagePromptPlatform(platform);
  return [
    "Use your terminal tools to help me generate my AI usage CSV. Do not modify my project files.",
    "",
    "Infer the best value for --filter from the current project or repository context you are working in.",
    "If the correct filter is not obvious, ask me for it before continuing.",
    "",
    "Then do exactly this:",
    "",
    `1. Make sure the repo ${AGENT_STATS_REPO_URL} is available locally on branch ${AGENT_STATS_BRANCH}.`,
    `   - If "${AGENT_STATS_DESKTOP_DIR}" exists, update it:`,
    `     git -C "${AGENT_STATS_DESKTOP_DIR}" fetch origin`,
    `     git -C "${AGENT_STATS_DESKTOP_DIR}" checkout ${AGENT_STATS_BRANCH}`,
    `     git -C "${AGENT_STATS_DESKTOP_DIR}" pull origin ${AGENT_STATS_BRANCH}`,
    "   - Otherwise clone it:",
    `     git clone --branch ${AGENT_STATS_BRANCH} --single-branch ${AGENT_STATS_REPO_URL}.git "${AGENT_STATS_DESKTOP_DIR}"`,
    "",
    `2. Change into "${AGENT_STATS_DESKTOP_DIR}".`,
    "",
    "3. Prefer the executable script and run:",
    `   ./ai_usage_stats.py --roots "${config.rootsGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
    "",
    "4. If that fails because the script is not executable or Python is not resolved, retry with:",
    `   python3 ai_usage_stats.py --roots "${config.rootsGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
    "",
    "5. When done, tell me only:",
    "   - success or failure",
    `   - the exact file path of the CSV on my Desktop (${AI_USAGE_DESKTOP_CSV_PATH})`,
    "",
    "If you need permission for shell or network commands, ask once and then continue.",
  ].join("\n");
}
