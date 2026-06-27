export type AiUsagePromptPlatform = "claude" | "codex" | "gemini" | "cursor";

export const AGENT_STATS_REPO_URL = "https://github.com/scottyUX/agent_stats";
export const AGENT_STATS_BRANCH = "main";
export const AGENT_STATS_DESKTOP_DIR = "$HOME/Desktop/agent_stats";
export const AI_USAGE_DESKTOP_CSV_PATH = "$HOME/Desktop/ai_usage_trace.csv";
export const AI_USAGE_DESKTOP_CSV_PATH_WIN =
  "$env:USERPROFILE\\Desktop\\ai_usage_trace.csv";

interface AiUsagePromptPlatformConfig {
  id: AiUsagePromptPlatform;
  label: string;
  shortLabel: string;
  /** Mac log path glob (also used for Linux when rootsGlobLinux is not set). */
  rootsGlob: string;
  /** Linux log path glob. Falls back to rootsGlob when not set. */
  rootsGlobLinux?: string;
  /** Windows PowerShell log path glob. */
  rootsGlobWindows: string;
  codingAgent?: string;
  tools?: ReadonlyArray<{
    name: string;
    bucket: "exploration" | "generation" | "verification";
  }>;
}

export const AI_USAGE_PROMPT_PLATFORMS: readonly AiUsagePromptPlatformConfig[] =
  [
    {
      id: "claude",
      label: "Claude Code",
      shortLabel: "Claude",
      rootsGlob: "$HOME/.claude/projects/**/*.jsonl",
      rootsGlobWindows: "$env:USERPROFILE\\.claude\\projects\\**\\*.jsonl",
    },
    {
      id: "codex",
      label: "Codex",
      shortLabel: "Codex",
      rootsGlob: "$HOME/.codex/sessions/**/rollout-*.jsonl",
      rootsGlobWindows:
        "$env:USERPROFILE\\.codex\\sessions\\**\\rollout-*.jsonl",
    },
    {
      id: "gemini",
      label: "Gemini",
      shortLabel: "Gemini",
      rootsGlob: "$HOME/.gemini/tmp/**/session-*.json",
      rootsGlobWindows: "$env:USERPROFILE\\.gemini\\tmp\\**\\session-*.json",
    },
    {
      id: "cursor",
      label: "Cursor",
      shortLabel: "Cursor",
      rootsGlob:
        "$HOME/.cursor/projects/*/agent-transcripts/*/*.jsonl",
      rootsGlobWindows:
        "$env:USERPROFILE\\.cursor\\projects\\*\\agent-transcripts\\*\\*.jsonl",
      codingAgent: "cursor",
      tools: [
        { name: "Read",           bucket: "exploration"  },
        { name: "Glob",           bucket: "exploration"  },
        { name: "Grep",           bucket: "exploration"  },
        { name: "SemanticSearch", bucket: "exploration"  },
        { name: "WebSearch",      bucket: "exploration"  },
        { name: "WebFetch",       bucket: "exploration"  },
        { name: "Write",          bucket: "generation"   },
        { name: "StrReplace",     bucket: "generation"   },
        { name: "EditNotebook",   bucket: "generation"   },
        { name: "Shell",          bucket: "verification" },
        { name: "Task",           bucket: "verification" },
      ],
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
  const linuxGlob = config.rootsGlobLinux ?? config.rootsGlob;
  const macLinuxSame = linuxGlob === config.rootsGlob;

  const platformGuidance = config.codingAgent
    ? [
        "Cursor logs are JSONL files under the --roots path below.",
        "Token efficiency metrics are not available for Cursor exports — agent-transcript logs do not include usage data. Prompt quality and activity metrics will still populate after upload.",
        "",
      ]
    : [];

  const step3Lines = macLinuxSame
    ? [
        "3. Run the command for your OS:",
        "   Mac / Linux:",
        `     ./ai_usage_stats.py --roots "${config.rootsGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
        "   Windows (PowerShell):",
        `     python ai_usage_stats.py --roots "${config.rootsGlobWindows}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH_WIN}"`,
      ]
    : [
        "3. Run the command for your OS:",
        "   Mac:",
        `     ./ai_usage_stats.py --roots "${config.rootsGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
        "   Linux:",
        `     ./ai_usage_stats.py --roots "${linuxGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
        "   Windows (PowerShell):",
        `     python ai_usage_stats.py --roots "${config.rootsGlobWindows}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH_WIN}"`,
      ];

  const step4Lines = macLinuxSame
    ? [
        "4. If the script is not executable or Python is not resolved on Mac / Linux, retry with:",
        `   python3 ai_usage_stats.py --roots "${config.rootsGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
        "   Windows (PowerShell): the step 3 command already uses python — no retry needed.",
      ]
    : [
        "4. If the script is not executable or Python is not resolved on Mac or Linux, retry with:",
        "   Mac:",
        `     python3 ai_usage_stats.py --roots "${config.rootsGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
        "   Linux:",
        `     python3 ai_usage_stats.py --roots "${linuxGlob}" --filter "<INFERRED_OR_CONFIRMED_FILTER>" --tokens --messages --csv "${AI_USAGE_DESKTOP_CSV_PATH}"`,
        "   Windows (PowerShell): the step 3 command already uses python — no retry needed.",
      ];

  return [
    "Use your terminal tools to help me generate my AI usage CSV. Do not modify my project files.",
    "",
    "Infer the best value for --filter from the current project or repository context you are working in.",
    "If the correct filter is not obvious, ask me for it before continuing.",
    "",
    ...platformGuidance,
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
    ...step3Lines,
    "",
    ...step4Lines,
    "",
    "5. When done, tell me only:",
    "   - success or failure",
    "   - the exact file path of the CSV on your Desktop",
    "",
    "If you need permission for shell or network commands, ask once and then continue.",
  ].join("\n");
}
