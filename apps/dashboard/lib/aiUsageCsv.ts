export const AI_USAGE_ACTIVE_WINDOW_DAYS = 40;

export const AI_USAGE_REQUIRED_COLUMNS = [
  "timestamp",
  "event_type",
  "session_id",
  "tool_name",
] as const;

const TOKEN_COLUMNS = [
  "input_tokens",
  "output_tokens",
  "cache_creation_tokens",
  "cache_read_tokens",
] as const;

const EXPLORATION_TOOLS = new Set(
  [
    "read",
    "glob",
    "grep",
    "search",
    "codebase_search",
    "listmcpresources",
    "listmcpresource",
    "websearch",
    "webfetch",
  ],
);

const GENERATION_TOOLS = new Set(
  ["write", "edit", "multiedit", "applypatch", "notebookedit"],
);

const VERIFICATION_TOOLS = new Set(
  ["bash", "shell", "runterminalcmd", "run_terminal_cmd", "terminal", "task"],
);

export type BehavioralBucketKey =
  | "exploration"
  | "generation"
  | "verification";

export type BehavioralDiagnosticKey =
  | "low-verification"
  | "low-exploration"
  | "heavy-generation"
  | "balanced";

export interface ToolMixItem {
  name: string;
  count: number;
  pct: number;
  bucket: BehavioralBucketKey;
  meaning: string;
}

export interface BehavioralMixItem {
  key: BehavioralBucketKey;
  label: string;
  count: number;
  pct: number;
  colorClass: string;
  summary: string;
}

export interface BehavioralDiagnostic {
  key: BehavioralDiagnosticKey;
  title: string;
  body: string;
  tone: "informational" | "positive" | "concern";
}

export interface ActiveDay {
  date: string;
  promptCount: number;
}

export interface AiUsageData {
  totalPrompts: number;
  totalSessions: number;
  totalToolCalls: number;
  avgIterationsPerPrompt: number;
  toolCallsPerPrompt: number;
  avgPromptsPerSession: number;
  avgSessionLengthTools: number;
  writeRatio: number;
  globalVerificationRatio: number;
  toolMix: ToolMixItem[];
  toolDiversity: number;
  mostUsedTool: ToolMixItem | null;
  behavioralMix: BehavioralMixItem[];
  behavioralDiagnostic: BehavioralDiagnostic;
  activeDays: ActiveDay[];
  activeDaysWindowStart: string | null;
  activeDaysWindowEnd: string | null;
  uniqueDays: number;
  avgPromptsPerDay: number;
  busiestDay: string | null;
  hasTokenData: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  cacheHitRate: number | null;
  totalTokens: number;
  hasMessageData: boolean;
  promptsWithText: number;
  messageCaptureRate: number | null;
  avgPromptLength: number | null;
  shortPromptRate: number | null;
  detailedPromptRate: number | null;
  warnings: string[];
}

export type AnalyzeAiUsageCsvResult =
  | {
      ok: true;
      data: AiUsageData;
      headers: string[];
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      headers: string[];
      warnings: string[];
    };

function normalizeToolName(toolName: string): string {
  return toolName.trim().toLowerCase();
}

function toolMeaning(bucket: BehavioralBucketKey): string {
  switch (bucket) {
    case "exploration":
      return "Reads and searches that gather context before making changes.";
    case "generation":
      return "Writes and edits that change code or content.";
    case "verification":
      return "Execution steps that run, check, or review work.";
    default:
      return "";
  }
}

function classifyBehavioralBucket(toolName: string): BehavioralBucketKey {
  const normalized = normalizeToolName(toolName);
  if (!normalized) return "exploration";
  if (EXPLORATION_TOOLS.has(normalized)) return "exploration";
  if (GENERATION_TOOLS.has(normalized)) return "generation";
  if (VERIFICATION_TOOLS.has(normalized)) return "verification";

  if (
    /read|search|grep|glob|fetch|list|query|snapshot|inspect/.test(normalized)
  ) {
    return "exploration";
  }

  if (/write|edit|patch|create|update|insert|replace|notebook/.test(normalized)) {
    return "generation";
  }

  if (/bash|shell|test|lint|build|run|verify|review|ci|check/.test(normalized)) {
    return "verification";
  }

  if (normalized.startsWith("mcp__")) return "verification";
  return "generation";
}

function parseIntSafe(value: string | undefined): number {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function isoDaysAgo(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function buildBehavioralDiagnostic(
  behavioralMix: BehavioralMixItem[],
): BehavioralDiagnostic {
  const getPct = (key: BehavioralBucketKey) =>
    behavioralMix.find((item) => item.key === key)?.pct ?? 0;

  const verificationPct = getPct("verification");
  if (verificationPct < 10) {
    return {
      key: "low-verification",
      title: "Low verification",
      body:
        "Most of the tool activity changed code without enough execution or review. After larger edits, run checks before trusting the output.",
      tone: "concern",
    };
  }

  const explorationPct = getPct("exploration");
  if (explorationPct < 15) {
    return {
      key: "low-exploration",
      title: "Low exploration",
      body:
        "The assistant is changing code with limited read/search context. Ground bigger tasks with a file read or search before editing.",
      tone: "concern",
    };
  }

  const generationPct = getPct("generation");
  if (generationPct > 65) {
    return {
      key: "heavy-generation",
      title: "Heavy generation",
      body:
        "Most tool calls are writes or edits. Slow down to review the changes, especially before staging or committing.",
      tone: "informational",
    };
  }

  return {
    key: "balanced",
    title: "Balanced workflow",
    body:
      "The trace shows a healthier mix of exploration, generation, and verification. Keep that pattern when tasks get larger or riskier.",
    tone: "positive",
  };
}

/**
 * RFC 4180-compliant CSV parser.
 * Handles quoted fields, embedded commas/newlines, and doubled double-quotes.
 */
export function parseAiUsageCsvText(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const rows: Record<string, string>[] = [];
  let pos = 0;
  const len = text.length;

  function parseField(): string {
    if (pos < len && text[pos] === '"') {
      pos++;
      let value = "";
      while (pos < len) {
        if (text[pos] === '"') {
          if (pos + 1 < len && text[pos + 1] === '"') {
            value += '"';
            pos += 2;
          } else {
            pos++;
            break;
          }
        } else {
          value += text[pos];
          pos++;
        }
      }
      return value;
    }
    const start = pos;
    while (
      pos < len &&
      text[pos] !== "," &&
      text[pos] !== "\n" &&
      text[pos] !== "\r"
    ) {
      pos++;
    }
    return text.slice(start, pos).trim();
  }

  function parseRow(): string[] | null {
    if (pos >= len) return null;
    if (text[pos] === "\r") pos++;
    if (pos < len && text[pos] === "\n") pos++;
    if (pos >= len) return null;

    const row: string[] = [];
    while (true) {
      row.push(parseField());
      if (pos >= len || text[pos] === "\n" || text[pos] === "\r") break;
      if (text[pos] === ",") {
        pos++;
        continue;
      }
      break;
    }
    return row;
  }

  const headerRow = parseRow();
  if (!headerRow) {
    return { headers: [], rows };
  }

  const headers = headerRow.map((header) => header.trim());
  while (pos < len) {
    const row = parseRow();
    if (!row) break;
    if (row.length === 1 && row[0] === "") continue;
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]!] = row[i] ?? "";
    }
    rows.push(obj);
  }

  return { headers, rows };
}

export function analyzeAiUsageCsv(text: string): AnalyzeAiUsageCsvResult {
  if (!text.trim()) {
    return {
      ok: false,
      error: "The uploaded CSV is empty.",
      headers: [],
      warnings: [],
    };
  }

  const { headers, rows } = parseAiUsageCsvText(text);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Could not parse any rows from the uploaded CSV.",
      headers,
      warnings: [],
    };
  }

  const missingRequired = AI_USAGE_REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column),
  );
  if (missingRequired.length > 0) {
    return {
      ok: false,
      error: `Missing required CSV columns: ${missingRequired.join(", ")}.`,
      headers,
      warnings: [],
    };
  }

  const hasTokenColumns = TOKEN_COLUMNS.every((column) =>
    headers.includes(column),
  );
  const hasMessageColumn = headers.includes("message_text");
  const warnings: string[] = [];

  if (!hasTokenColumns) {
    warnings.push("Token metrics unavailable. Re-export with --tokens to unlock token efficiency.");
  }
  if (!hasMessageColumn) {
    warnings.push("Prompt quality metrics unavailable. Re-export with --messages to unlock prompt-quality cards.");
  }

  let totalPrompts = 0;
  let totalToolCalls = 0;
  const sessionIds = new Set<string>();
  const toolCounts: Record<string, number> = {};
  const behavioralCounts: Record<BehavioralBucketKey, number> = {
    exploration: 0,
    generation: 0,
    verification: 0,
  };

  let currentSessionId = "";
  let currentSessionPromptCount = 0;
  let currentSessionToolCount = 0;
  const iterationsPerSession: number[] = [];

  const dayPromptMap = new Map<string, number>();
  const sessionState: Record<
    string,
    {
      readAfterWriteCount: number;
      totalWriteFollowedCount: number;
      lastToolName: string;
    }
  > = {};

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  let hasAnyTokenData = false;

  let totalPromptLength = 0;
  let promptsWithText = 0;
  let shortPrompts = 0;
  let detailedPrompts = 0;

  for (const row of rows) {
    const sessionId = row.session_id?.trim() ?? "";
    const eventType = row.event_type?.trim() ?? "";
    const toolName = row.tool_name?.trim() ?? "";
    const timestamp = row.timestamp?.trim() ?? "";

    if (sessionId) sessionIds.add(sessionId);

    if (sessionId !== currentSessionId) {
      if (currentSessionId && currentSessionPromptCount > 0) {
        iterationsPerSession.push(
          currentSessionToolCount / currentSessionPromptCount,
        );
      }
      currentSessionId = sessionId;
      currentSessionPromptCount = 0;
      currentSessionToolCount = 0;
    }

    if (eventType === "user_prompt") {
      totalPrompts++;
      currentSessionPromptCount++;

      if (timestamp.length >= 10) {
        const date = timestamp.slice(0, 10);
        dayPromptMap.set(date, (dayPromptMap.get(date) ?? 0) + 1);
      }

      if (hasMessageColumn) {
        const messageText = row.message_text ?? "";
        if (messageText.trim()) {
          promptsWithText++;
          totalPromptLength += messageText.length;
          if (messageText.length < 50) shortPrompts++;
          if (messageText.length >= 200) detailedPrompts++;
        }
      }
    }

    if (eventType === "tool_call") {
      totalToolCalls++;
      currentSessionToolCount++;

      if (toolName) {
        toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
        const bucket = classifyBehavioralBucket(toolName);
        behavioralCounts[bucket] += 1;
      }
    }

    if (sessionId) {
      if (!sessionState[sessionId]) {
        sessionState[sessionId] = {
          readAfterWriteCount: 0,
          totalWriteFollowedCount: 0,
          lastToolName: "",
        };
      }
      if (eventType === "tool_call") {
        const state = sessionState[sessionId]!;
        const previous = normalizeToolName(state.lastToolName);
        const prevIsWrite =
          previous === "write" ||
          previous === "edit" ||
          previous === "multiedit" ||
          previous === "applypatch";
        if (normalizeToolName(toolName) === "read" && prevIsWrite) {
          state.readAfterWriteCount++;
        }
        if (prevIsWrite) {
          state.totalWriteFollowedCount++;
        }
        state.lastToolName = toolName || state.lastToolName;
      }
    }

    if (hasTokenColumns && eventType === "assistant_response") {
      const inputTokens = parseIntSafe(row.input_tokens);
      const outputTokens = parseIntSafe(row.output_tokens);
      const cacheCreationTokens = parseIntSafe(row.cache_creation_tokens);
      const cacheReadTokens = parseIntSafe(row.cache_read_tokens);
      if (
        inputTokens > 0 ||
        outputTokens > 0 ||
        cacheCreationTokens > 0 ||
        cacheReadTokens > 0
      ) {
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalCacheCreationTokens += cacheCreationTokens;
        totalCacheReadTokens += cacheReadTokens;
        hasAnyTokenData = true;
      }
    }
  }

  if (currentSessionId && currentSessionPromptCount > 0) {
    iterationsPerSession.push(currentSessionToolCount / currentSessionPromptCount);
  }

  const avgIterationsPerPrompt =
    iterationsPerSession.length > 0
      ? Math.round(
          (iterationsPerSession.reduce((sum, value) => sum + value, 0) /
            iterationsPerSession.length) *
            10,
        ) / 10
      : 0;

  const sessionCount = sessionIds.size;
  const toolMix = Object.entries(toolCounts)
    .sort(([, left], [, right]) => right - left)
    .map(([name, count]) => {
      const bucket = classifyBehavioralBucket(name);
      return {
        name,
        count,
        pct: clampPct(count, totalToolCalls),
        bucket,
        meaning: toolMeaning(bucket),
      } satisfies ToolMixItem;
    });

  const behavioralMix: BehavioralMixItem[] = [
    {
      key: "exploration",
      label: "Exploration",
      count: behavioralCounts.exploration,
      pct: clampPct(behavioralCounts.exploration, totalToolCalls),
      colorClass: "bg-sky-500",
      summary: "Reads and searches that gather context before edits.",
    },
    {
      key: "generation",
      label: "Generation",
      count: behavioralCounts.generation,
      pct: clampPct(behavioralCounts.generation, totalToolCalls),
      colorClass: "bg-amber-500",
      summary: "Writes and edits that change code or docs.",
    },
    {
      key: "verification",
      label: "Verification / execution",
      count: behavioralCounts.verification,
      pct: clampPct(behavioralCounts.verification, totalToolCalls),
      colorClass: "bg-emerald-500",
      summary: "Execution steps that run, check, or review work.",
    },
  ];

  const globalReadAfterWrite = Object.values(sessionState).reduce(
    (sum, state) => sum + state.readAfterWriteCount,
    0,
  );
  const globalWriteFollowed = Object.values(sessionState).reduce(
    (sum, state) => sum + state.totalWriteFollowedCount,
    0,
  );
  const globalVerificationRatio =
    globalWriteFollowed > 0
      ? Math.round((globalReadAfterWrite / globalWriteFollowed) * 1000) / 1000
      : 0;

  const allActiveDays = Array.from(dayPromptMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, promptCount]) => ({ date, promptCount }));

  const windowEnd =
    allActiveDays[allActiveDays.length - 1]?.date ?? null;
  const windowStart = windowEnd
    ? isoDaysAgo(windowEnd, AI_USAGE_ACTIVE_WINDOW_DAYS - 1)
    : null;
  const activeDays = windowStart
    ? allActiveDays.filter(
        (day) => day.date >= windowStart && day.date <= windowEnd,
      )
    : [];

  const promptsInWindow = activeDays.reduce(
    (sum, day) => sum + day.promptCount,
    0,
  );
  const uniqueDays = activeDays.length;
  const avgPromptsPerDay =
    uniqueDays > 0
      ? Math.round((promptsInWindow / uniqueDays) * 10) / 10
      : 0;
  const busiestDay =
    activeDays.length > 0
      ? activeDays.reduce((best, day) =>
          day.promptCount > best.promptCount ? day : best,
        ).date
      : null;

  const cacheTotal =
    totalInputTokens + totalCacheReadTokens + totalCacheCreationTokens;
  const cacheHitRate =
    hasAnyTokenData && cacheTotal > 0
      ? Math.round((totalCacheReadTokens / cacheTotal) * 1000) / 1000
      : null;

  const hasMessageData = promptsWithText > 0;
  const messageCaptureRate =
    totalPrompts > 0 && hasMessageColumn
      ? Math.round((promptsWithText / totalPrompts) * 1000) / 1000
      : null;

  const data: AiUsageData = {
    totalPrompts,
    totalSessions: sessionCount,
    totalToolCalls,
    avgIterationsPerPrompt,
    toolCallsPerPrompt:
      totalPrompts > 0
        ? Math.round((totalToolCalls / totalPrompts) * 10) / 10
        : 0,
    avgPromptsPerSession:
      sessionCount > 0
        ? Math.round((totalPrompts / sessionCount) * 10) / 10
        : 0,
    avgSessionLengthTools:
      sessionCount > 0
        ? Math.round((totalToolCalls / sessionCount) * 10) / 10
        : 0,
    writeRatio:
      totalToolCalls > 0
        ? Math.round(
            (((toolCounts.Write ?? 0) +
              (toolCounts.Edit ?? 0) +
              (toolCounts.MultiEdit ?? 0) +
              (toolCounts.ApplyPatch ?? 0)) /
              totalToolCalls) *
              1000,
          ) / 1000
        : 0,
    globalVerificationRatio,
    toolMix,
    toolDiversity: toolMix.length,
    mostUsedTool: toolMix[0] ?? null,
    behavioralMix,
    behavioralDiagnostic: buildBehavioralDiagnostic(behavioralMix),
    activeDays,
    activeDaysWindowStart: windowStart,
    activeDaysWindowEnd: windowEnd,
    uniqueDays,
    avgPromptsPerDay,
    busiestDay,
    hasTokenData: hasAnyTokenData,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    cacheHitRate,
    totalTokens: totalInputTokens + totalOutputTokens,
    hasMessageData,
    promptsWithText,
    messageCaptureRate,
    avgPromptLength:
      hasMessageData ? Math.round(totalPromptLength / promptsWithText) : null,
    shortPromptRate:
      hasMessageData
        ? Math.round((shortPrompts / promptsWithText) * 1000) / 1000
        : null,
    detailedPromptRate:
      hasMessageData
        ? Math.round((detailedPrompts / promptsWithText) * 1000) / 1000
        : null,
    warnings,
  };

  return { ok: true, data, headers, warnings };
}
