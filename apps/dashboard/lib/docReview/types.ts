export const DOC_REVIEW_VERSION = "1.0.0";

export type DocType =
  | "release_plan"
  | "sprint_plan"
  | "sprint_report"
  | "test_plan"
  | "definition_of_done"
  | "code_standards"
  | "unknown";

export interface DiscoveredFile {
  path: string;
  pool: "docs" | "repoWide";
  size?: number;
}

export interface DiscoveryResult {
  found: boolean;
  docsPool: string[];
  repoWide: string[];
  files: DiscoveredFile[];
  /** Image paths under docs folders (png/jpg) — listed but not reviewed */
  skippedImages?: string[];
}

export interface FileWithText {
  path: string;
  /** Initial slice (up to 12k chars) for reviewer turn 1. */
  text: string | null;
  /** Full extracted text for read_more_content (never log). */
  fullText?: string | null;
  bytes: number;
  truncated: boolean;
  error?: string;
}

export interface ClassifiedDoc {
  path: string;
  docType: DocType;
  sprintNumber?: number | null;
  language?: string | null;
  text?: string | null;
  truncated?: boolean;
  duplicate?: boolean;
}

export interface StructuredReviewPayload {
  checklist: Record<string, boolean>;
  coach: string;
  userStoryCount?: number | null;
}

export interface HolisticReviewPayload {
  strengths: string;
  improvements: string;
}

export interface DocumentReview {
  path: string;
  docKey: string;
  docType: DocType;
  duplicate?: boolean;
  sprintNumber?: number | null;
  language?: string | null;
  structured?: StructuredReviewPayload;
  holistic?: HolisticReviewPayload;
  error?: string;
  reviewMs?: number;
}

export interface ConsistencyWarning {
  code: string;
  message: string;
  severity: "info" | "warning";
}

export interface DocReviewTimings {
  discoveryMs: number;
  classifyMs: number;
  reviewMs: number;
  totalMs: number;
}

export interface DocReviewResult {
  docReviewVersion: string;
  generatedAt: string;
  resultId: string;
  folder_found: boolean;
  discovery: {
    docsPool: string[];
    repoWide: string[];
    skippedImages?: string[];
  };
  classifications: ClassifiedDoc[];
  reviews: Record<string, DocumentReview>;
  consistency: { warnings: ConsistencyWarning[] };
  warnings: string[];
  timings?: DocReviewTimings;
  error?: string;
}
