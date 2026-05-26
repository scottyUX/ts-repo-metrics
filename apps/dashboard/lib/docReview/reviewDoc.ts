import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ClassifiedDoc, DocumentReview } from "./types";
import { sliceDocChunk } from "./extractText";
import {
  DOD_CONTEXT,
  HOLISTIC_DOC_TYPES,
  RUBRICS,
  STRUCTURED_DOC_TYPES,
  codeStandardsContext,
} from "./rubrics";
import { normalizeReviewByDocType } from "./validate";
import { docKey } from "./docKey";

const STRUCTURED_SYSTEM_PROMPT = `You are a senior software engineer reviewing a student team's project documentation
for a university software engineering course. Your role is to give honest,
constructive feedback — the kind you would give a junior engineer on your team.

You will receive a document and a checklist of required criteria. For each criterion:
- Return true if the criterion is clearly present and meets the requirement
- Return false if it is missing, incomplete, or clearly insufficient
- When in doubt, err on the side of true — do not penalize students for ambiguity

After the checklist, write a coach paragraph (2–4 sentences):
- Lead with a genuine strength — something the team did well
- End with one specific, actionable improvement
- Be concrete: quote or reference specific parts of the document
- Use "your team" not "the student" or "you"
- Do not comment on spelling, grammar, or writing style
- Do not use grade language ("this would earn a B", "pass/fail")
- Do not mention criteria the team has already met

IMPORTANT — what you must NOT do:
- Do not invent criteria not in the checklist
- Do not mark a criterion false unless you are confident it is absent
- Do not reference other teams or compare to other submissions
- Do not speculate about why something is missing`;

const HOLISTIC_SYSTEM_PROMPT = `You are a senior software engineer reviewing a student team's project documentation
for a university software engineering course.

Write a brief peer review (3–5 sentences total) in two parts:

Strengths: What does this document do well? Be specific — quote or paraphrase
actual content. One to two sentences.

Suggestions: What one or two concrete improvements would make this document
more useful for the team? Be specific enough that the team knows exactly what
to change. One to two sentences per suggestion.

Tone rules:
- Write as a colleague, not an evaluator
- Use "your team" not "the student" or "you"
- Do not use grade language
- Do not comment on spelling or grammar
- Do not suggest adding content that serves no practical purpose
- For code_standards: comment on whether standards are specific enough to be enforceable
- For definition_of_done: comment on whether criteria are testable and specific`;

export const REVIEWER_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_more_content",
      description:
        "Read the next chunk of the document if the initial content was truncated.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path of the document" },
          chunkIndex: {
            type: "number",
            description: "Chunk number (1 = chars 12000–24000, 2 = 24000–36000)",
          },
        },
        required: ["path", "chunkIndex"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_review",
      description: "Submit the completed review. Call this once when done.",
      parameters: {
        type: "object",
        properties: {
          checklist: {
            type: "object",
            additionalProperties: { type: "boolean" },
          },
          strengths: { type: "string" },
          improvements: { type: "string" },
          coach: { type: "string" },
          user_story_count: {
            type: "number",
            description: "Total number of user stories found in the document. Only populate for sprint_plan documents.",
          },
        },
      },
    },
  },
];

const MAX_REVIEW_ITERATIONS = 5;
const REVIEW_TIMEOUT_MS = 30_000;

function buildReviewMessage(doc: ClassifiedDoc, rubric: string): string {
  return [
    `Document type: ${doc.docType}`,
    doc.sprintNumber ? `Sprint number: ${doc.sprintNumber}` : "",
    `File: ${doc.path}`,
    doc.truncated
      ? "⚠️ Document was truncated at 12,000 characters. Use read_more_content if needed."
      : "",
    "",
    "=== RUBRIC ===",
    rubric,
    "",
    "=== DOCUMENT CONTENT ===",
    doc.text ??
      "[Text extraction failed — mark all criteria false and note in coach paragraph]",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHolisticReviewMessage(doc: ClassifiedDoc, context: string): string {
  return [
    `Document type: ${doc.docType}`,
    doc.language ? `Language: ${doc.language}` : "",
    context,
    "",
    "=== DOCUMENT CONTENT ===",
    doc.text ??
      "[Text extraction failed — provide a note in both strengths and improvements]",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function reviewDoc(
  doc: ClassifiedDoc,
  fileTextByPath: Map<string, string>,
  detectedLanguages: string[],
  openai: OpenAI,
  signal?: AbortSignal,
): Promise<DocumentReview> {
  const base: DocumentReview = {
    path: doc.path,
    docKey: docKey(doc),
    docType: doc.docType,
    duplicate: doc.duplicate,
    sprintNumber: doc.sprintNumber,
    language: doc.language,
  };

  if (doc.docType === "unknown") {
    return { ...base, error: "skipped_unknown" };
  }

  const isHolistic = HOLISTIC_DOC_TYPES.has(doc.docType);
  const isStructured = STRUCTURED_DOC_TYPES.has(doc.docType);

  if (!isHolistic && !isStructured) {
    return { ...base, error: "unsupported_doc_type" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  const rubric = RUBRICS[doc.docType]?.prompt ?? "";
  const userContent = isHolistic
    ? buildHolisticReviewMessage(
        doc,
        doc.docType === "definition_of_done"
          ? DOD_CONTEXT
          : codeStandardsContext(detectedLanguages),
      )
    : buildReviewMessage(doc, rubric);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: isHolistic ? HOLISTIC_SYSTEM_PROMPT : STRUCTURED_SYSTEM_PROMPT,
    },
    { role: "user", content: userContent },
  ];

  const start = Date.now();

  try {
    for (let i = 0; i < MAX_REVIEW_ITERATIONS; i++) {
      const completion = await openai.chat.completions.create(
        {
          model: "gpt-4o",
          temperature: isHolistic ? 0.3 : 0,
          max_tokens: isHolistic ? 512 : 1024,
          messages,
          tools: REVIEWER_TOOLS,
          tool_choice: "auto",
        },
        { signal: combinedSignal },
      );

      const choice = completion.choices[0];
      if (!choice?.message) break;
      messages.push(choice.message);

      const toolCalls = choice.message.tool_calls;
      if (!toolCalls?.length) break;

      for (const call of toolCalls) {
        if (call.type !== "function") continue;
        const fn = call.function;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }

        if (fn.name === "read_more_content") {
          const path = String(args.path ?? doc.path);
          const chunkIndex = Number(args.chunkIndex ?? 1);
          const full = fileTextByPath.get(path);
          const chunk = full ? sliceDocChunk(full, chunkIndex) : "";
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: chunk.length > 0 ? chunk : "[No more content — end of document]",
          });
          continue;
        }

        if (fn.name === "submit_review") {
          const normalized = normalizeReviewByDocType(doc.docType, args);
          if (normalized.kind === "invalid") {
            return {
              ...base,
              error: normalized.reason,
              reviewMs: Date.now() - start,
            };
          }
          if (normalized.kind === "structured") {
            const userStoryCount =
              typeof args.user_story_count === "number"
                ? args.user_story_count
                : null;
            return {
              ...base,
              structured: { ...normalized.payload, userStoryCount },
              reviewMs: Date.now() - start,
            };
          }
          return {
            ...base,
            holistic: normalized.payload,
            reviewMs: Date.now() - start,
          };
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "Unknown tool.",
        });
      }
    }

    return { ...base, error: "no_submit_review", reviewMs: Date.now() - start };
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"));
    return {
      ...base,
      error: isTimeout ? "timeout" : "review_failed",
      reviewMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}
