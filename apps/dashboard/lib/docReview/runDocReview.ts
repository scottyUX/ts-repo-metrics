import type OpenAI from "openai";
import type { RepoReport } from "@/lib/reportTypes";
import { DOC_REVIEW_VERSION, type DocReviewResult } from "./types";
import { discoverDocs } from "./discoverDocs";
import { extractAllText, fileTextByPath } from "./extractText";
import { classifyDocs } from "./classifyDocs";
import { markDuplicateClassifications, docKey } from "./docKey";
import { reviewDoc } from "./reviewDoc";
import { runConsistencyChecks } from "./runConsistencyChecks";
import { isDocsPoolPath } from "./constants";

const REVIEW_GAP_MS = 300;

function detectedLanguagesFromReport(report: RepoReport | null | undefined): string[] {
  return (report?.github?.languages ?? []).map((l) => l.language);
}

export async function runDocReview(opts: {
  owner: string;
  repo: string;
  githubToken: string;
  resultId: string;
  openai: OpenAI;
  engineReport?: RepoReport | null;
  signal?: AbortSignal;
}): Promise<DocReviewResult> {
  const { owner, repo, githubToken, resultId, openai, engineReport, signal } =
    opts;
  const warnings: string[] = [];
  const totalStart = Date.now();

  const emptyResult = (): DocReviewResult => ({
    docReviewVersion: DOC_REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    resultId,
    folder_found: false,
    discovery: { docsPool: [], repoWide: [], skippedImages: [] },
    classifications: [],
    reviews: {},
    consistency: { warnings: [] },
    warnings,
  });

  let discoveryMs = 0;
  let classifyMs = 0;
  let reviewMs = 0;

  const discoveryStart = Date.now();
  const discovery = await discoverDocs(owner, repo, githubToken, signal);
  discoveryMs = Date.now() - discoveryStart;
  warnings.push(...discovery.warnings);

  const folder_found = discovery.docsPool.length > 0;

  if (discovery.files.length === 0) {
    if (!folder_found) {
      warnings.push("No documentation folder or .md/.pdf files found.");
    }
    return {
      ...emptyResult(),
      folder_found,
      discovery: {
        docsPool: discovery.docsPool,
        repoWide: discovery.repoWide,
        skippedImages: discovery.skippedImages,
      },
      warnings,
      timings: {
        discoveryMs,
        classifyMs: 0,
        reviewMs: 0,
        totalMs: Date.now() - totalStart,
      },
    };
  }

  const { files: extracted, warnings: extractWarnings } = await extractAllText(
    owner,
    repo,
    discovery.files,
    githubToken,
    signal,
  );
  warnings.push(...extractWarnings);

  const textMap = fileTextByPath(extracted);

  const classifyStart = Date.now();
  let classified = await classifyDocs(
    extracted,
    discovery.docsPool,
    discovery.repoWide,
    openai,
  );
  classifyMs = Date.now() - classifyStart;

  classified = markDuplicateClassifications(classified);

  const reviews: DocReviewResult["reviews"] = {};
  const reviewStart = Date.now();
  const langs = detectedLanguagesFromReport(engineReport ?? null);

  for (const doc of classified) {
    if (doc.docType === "unknown") continue;
    if (signal?.aborted) {
      warnings.push("pipeline_timeout");
      break;
    }

    await new Promise((r) => setTimeout(r, REVIEW_GAP_MS));

    try {
      const result = await reviewDoc(doc, textMap, langs, openai, signal);
      reviews[doc.path] = result;
    } catch (err) {
      reviews[doc.path] = {
        path: doc.path,
        docKey: docKey(doc),
        docType: doc.docType,
        duplicate: doc.duplicate,
        error: err instanceof Error ? err.message : "review_failed",
      };
    }
  }
  reviewMs = Date.now() - reviewStart;

  const consistency = runConsistencyChecks(classified, engineReport ?? null);

  return {
    docReviewVersion: DOC_REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    resultId,
    folder_found,
    discovery: {
      docsPool: discovery.docsPool,
      repoWide: discovery.repoWide,
      skippedImages: discovery.skippedImages,
    },
    classifications: classified,
    reviews,
    consistency,
    warnings,
    timings: {
      discoveryMs,
      classifyMs,
      reviewMs,
      totalMs: Date.now() - totalStart,
    },
  };
}

export { isDocsPoolPath };
