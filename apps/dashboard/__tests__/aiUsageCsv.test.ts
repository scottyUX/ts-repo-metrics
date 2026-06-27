import { describe, expect, it } from "vitest";
import {
  AI_USAGE_ACTIVE_WINDOW_DAYS,
  analyzeAiUsageCsv,
  parseAiUsageCsvText,
} from "../lib/aiUsageCsv";

const fullCsv = `timestamp,event_type,coding_agent,tool_name,execution_time,working_dir,session_id,message_text,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,model
2026-04-15T09:00:00.000Z,user_prompt,claude_code,,,/repo,s1,"Please inspect auth flow
and propose one minimal fix.",,,,,gpt-4o
2026-04-15T09:00:01.000Z,tool_call,claude_code,Read,0.2,/repo,s1,,,,,,gpt-4o
2026-04-15T09:00:02.000Z,tool_call,claude_code,Write,0.3,/repo,s1,,,,,,gpt-4o
2026-04-15T09:00:03.000Z,tool_call,claude_code,Read,0.1,/repo,s1,,,,,,gpt-4o
2026-04-15T09:00:04.000Z,tool_call,claude_code,Bash,0.5,/repo,s1,,,,,,gpt-4o
2026-04-15T09:00:05.000Z,assistant_response,claude_code,,0.0,/repo,s1,,1200,300,100,500,gpt-4o
2026-05-20T10:00:00.000Z,user_prompt,claude_code,,,/repo,s2,"fix login",,,,,gpt-4o
2026-05-20T10:00:01.000Z,tool_call,claude_code,Grep,0.1,/repo,s2,,,,,,gpt-4o
2026-05-20T10:00:02.000Z,tool_call,claude_code,Edit,0.2,/repo,s2,,,,,,gpt-4o
2026-05-20T10:00:03.000Z,assistant_response,claude_code,,0.0,/repo,s2,,800,200,50,250,gpt-4o
2026-03-01T08:00:00.000Z,user_prompt,claude_code,,,/repo,s3,"older prompt",,,,,gpt-4o`;

describe("aiUsageCsv", () => {
  it("parses quoted multiline CSV fields", () => {
    const parsed = parseAiUsageCsvText(fullCsv);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows[0]?.message_text).toContain("inspect auth flow\nand propose");
  });

  it("computes grouped metrics, prompt quality, and token metrics", () => {
    const result = analyzeAiUsageCsv(fullCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings).toEqual([]);
    expect(result.data.totalPrompts).toBe(3);
    expect(result.data.totalToolCalls).toBe(6);
    expect(result.data.totalSessions).toBe(3);
    expect(result.data.behavioralMix.map((item) => item.pct)).toEqual([50, 33, 17]);
    expect(result.data.behavioralDiagnostic.key).toBe("balanced");
    expect(result.data.writeRatio).toBeCloseTo(0.333, 3);
    expect(result.data.globalVerificationRatio).toBe(1);
    expect(result.data.totalInputTokens).toBe(2000);
    expect(result.data.totalOutputTokens).toBe(500);
    expect(result.data.avgPromptLength).toBeGreaterThan(10);
    expect(result.data.shortPromptRate).toBeCloseTo(2 / 3, 3);
    expect(result.data.messageCaptureRate).toBe(1);
  });

  it("applies the fixed 40-day activity window", () => {
    const result = analyzeAiUsageCsv(fullCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.activeDaysWindowEnd).toBe("2026-05-20");
    expect(result.data.activeDaysWindowStart).toBe("2026-04-11");
    expect(result.data.activeDays.map((day) => day.date)).toEqual([
      "2026-04-15",
      "2026-05-20",
    ]);
    expect(result.data.uniqueDays).toBe(2);
    expect(AI_USAGE_ACTIVE_WINDOW_DAYS).toBe(40);
  });

  it("returns contract errors for missing required columns", () => {
    const badCsv = `timestamp,event_type,session_id\n2026-01-01T00:00:00.000Z,user_prompt,s1`;
    const result = analyzeAiUsageCsv(badCsv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Missing required CSV columns");
    expect(result.error).toContain("tool_name");
  });

  it("warns when optional message and token columns are absent", () => {
    const csvWithoutOptionalColumns = `timestamp,event_type,coding_agent,tool_name,execution_time,working_dir,session_id
2026-05-20T10:00:00.000Z,user_prompt,claude_code,,,/repo,s1
2026-05-20T10:00:01.000Z,tool_call,claude_code,Write,0.2,/repo,s1
2026-05-20T10:00:02.000Z,tool_call,claude_code,Bash,0.1,/repo,s1`;

    const result = analyzeAiUsageCsv(csvWithoutOptionalColumns);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(2);
    expect(result.data.hasTokenData).toBe(false);
    expect(result.data.hasMessageData).toBe(false);
    expect(result.data.behavioralDiagnostic.key).toBe("low-exploration");
  });
});

const cursorCsv = `timestamp,event_type,coding_agent,tool_name,execution_time,working_dir,session_id,message_text,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,model
2026-05-20T10:00:00.000Z,user_prompt,cursor,,,/repo,c1,"Add a helloWorld helper and run the tests.",,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:01.000Z,tool_call,cursor,Read,0.2,/repo,c1,,,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:02.000Z,tool_call,cursor,Grep,0.1,/repo,c1,,,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:03.000Z,tool_call,cursor,StrReplace,0.3,/repo,c1,,,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:04.000Z,tool_call,cursor,Shell,0.6,/repo,c1,,,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:05.000Z,tool_call,cursor,Task,1.2,/repo,c1,,,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:06.000Z,assistant_response,cursor,,0.0,/repo,c1,,1100,250,80,400,claude-3-5-sonnet-20241022
2026-05-21T09:00:00.000Z,user_prompt,cursor,,,/repo,c2,"Update the README.",,,,,claude-3-5-sonnet-20241022
2026-05-21T09:00:01.000Z,tool_call,cursor,Read,0.1,/repo,c2,,,,,,claude-3-5-sonnet-20241022
2026-05-21T09:00:02.000Z,tool_call,cursor,StrReplace,0.2,/repo,c2,,,,,,claude-3-5-sonnet-20241022
2026-05-21T09:00:03.000Z,assistant_response,cursor,,0.0,/repo,c2,,600,120,40,200,claude-3-5-sonnet-20241022`;

describe("Cursor CSV", () => {
  it("parses without column errors", () => {
    const result = analyzeAiUsageCsv(cursorCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.warnings).toEqual([]);
  });

  it("correctly buckets Cursor exploration tools", () => {
    const result = analyzeAiUsageCsv(cursorCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const toolMix = result.data.toolMix;
    const read = toolMix.find((t) => t.name === "Read");
    const grep = toolMix.find((t) => t.name === "Grep");
    expect(read?.bucket).toBe("exploration");
    expect(grep?.bucket).toBe("exploration");
  });

  it("correctly buckets StrReplace as generation", () => {
    const result = analyzeAiUsageCsv(cursorCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const strReplace = result.data.toolMix.find((t) => t.name === "StrReplace");
    expect(strReplace?.bucket).toBe("generation");
  });

  it("correctly buckets Shell and Task as verification", () => {
    const result = analyzeAiUsageCsv(cursorCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const shell = result.data.toolMix.find((t) => t.name === "Shell");
    const task = result.data.toolMix.find((t) => t.name === "Task");
    expect(shell?.bucket).toBe("verification");
    expect(task?.bucket).toBe("verification");
  });

  it("counts prompts, tool calls, and sessions correctly", () => {
    const result = analyzeAiUsageCsv(cursorCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totalPrompts).toBe(2);
    expect(result.data.totalToolCalls).toBe(7);
    expect(result.data.totalSessions).toBe(2);
  });

  it("still reports token data when synthetic assistant_response rows include tokens", () => {
    const result = analyzeAiUsageCsv(cursorCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.hasTokenData).toBe(true);
    expect(result.data.tokenUnavailableReason).toBeUndefined();
  });
});

const cursorCsvRealistic = `timestamp,event_type,coding_agent,tool_name,execution_time,working_dir,session_id,message_text,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,model
2026-05-20T10:00:00.000Z,user_prompt,cursor,,,/repo,c1,"Hello",,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:01.000Z,tool_call,cursor,Read,0.2,/repo,c1,,,,,,claude-3-5-sonnet-20241022
2026-05-20T10:00:02.000Z,assistant_response,cursor,,0.0,/repo,c1,,,,,,claude-3-5-sonnet-20241022`;

describe("realistic Cursor CSV (empty token columns)", () => {
  it("detects cursor_no_usage instead of advising --tokens re-export", () => {
    const result = analyzeAiUsageCsv(cursorCsvRealistic);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.hasTokenData).toBe(false);
    expect(result.data.tokenUnavailableReason).toBe("cursor_no_usage");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Cursor");
    expect(result.warnings[0]).not.toContain("Re-export with --tokens");
    expect(result.data.hasMessageData).toBe(true);
    expect(result.data.totalPrompts).toBe(1);
  });
});
