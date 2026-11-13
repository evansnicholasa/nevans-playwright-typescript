import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { stripRegionMarkers } from "./automate";
import { assertIssueKeyAllowed, projectKeyFromIssueKey } from "./issue";

const CASE_TAG = /@([A-Z][A-Z0-9]*-\d+-C\d+)/g;

const compactTestSchema = z.object({
  title: z.string().min(1),
  file: z.string().optional(),
  tags: z.array(z.string()).default([]),
  status: z.string().min(1),
  error: z.string().optional(),
});

const compactReportSchema = z.object({
  tests: z.array(compactTestSchema),
});

export type FailedTest = {
  title: string;
  file?: string;
  tags: string[];
  error?: string;
};

export type BugDraft = {
  project: string;
  type: "Bug";
  parent: string;
  caseIds: string[];
  summary: string;
  description: string;
};

export type BugSkip = {
  title: string;
  reason: string;
};

export function caseIdsFromText(text: string): string[] {
  return [...text.matchAll(CASE_TAG)].map((match) => match[1]);
}

export function storyKeyFromCaseId(caseId: string): string {
  const match = /^([A-Z][A-Z0-9]*-\d+)-C\d+$/.exec(caseId);
  if (!match) {
    throw new Error(`Not a product case id: ${caseId}`);
  }
  return match[1];
}

function tagsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string") {
      return [entry.name];
    }
    return [];
  });
}

function flattenPlaywrightSpecs(node: unknown, acc: FailedTest[]): void {
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.suites)) {
    for (const suite of record.suites) flattenPlaywrightSpecs(suite, acc);
  }
  if (Array.isArray(record.specs)) {
    for (const spec of record.specs) flattenPlaywrightSpecs(spec, acc);
  }
  if (Array.isArray(record.tests)) {
    const title = typeof record.title === "string" ? record.title : "";
    const file = typeof record.file === "string" ? record.file : undefined;
    const tags = [
      ...tagsFromUnknown(record.tags),
      ...caseIdsFromText(title).map((id) => `@${id}`),
    ];
    const tests = record.tests as Array<Record<string, unknown>>;
    const failed = tests
      .map(playwrightTestFailure)
      .filter((row): row is { error?: string } => row !== undefined);
    if (failed.length === 0) return;
    acc.push({ title, file, tags, error: failed[0].error });
  }
}

function errorMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return typeof error === "string" ? error : undefined;
}

function lastFailedResult(results: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].status === "failed" || results[i].status === "timedOut") return results[i];
  }
  return undefined;
}

/** One outcome per Playwright test: skip flakes and passes; keep unexpected failures. */
function playwrightTestFailure(test: Record<string, unknown>): { error?: string } | undefined {
  const results = Array.isArray(test.results) ? (test.results as Array<Record<string, unknown>>) : [];
  const status = test.status;
  if (status === "flaky" || status === "expected" || status === "skipped") return undefined;
  if (status !== "unexpected" && status !== undefined) return undefined;
  if (status !== "unexpected" && results.some((result) => result.status === "passed")) return undefined;
  const failed = lastFailedResult(results);
  if (!failed) return undefined;
  return { error: errorMessage(failed.error) };
}

export function parseReport(raw: unknown): FailedTest[] {
  const compact = compactReportSchema.safeParse(raw);
  if (compact.success) {
    return compact.data.tests
      .filter((test) => test.status === "failed" || test.status === "timedOut")
      .map((test) => ({
        title: test.title,
        file: test.file,
        tags: [...test.tags, ...caseIdsFromText(`${test.title} ${test.tags.join(" ")}`).map((id) => `@${id}`)],
        error: test.error,
      }));
  }
  if (raw && typeof raw === "object" && "suites" in raw) {
    const failed: FailedTest[] = [];
    flattenPlaywrightSpecs(raw, failed);
    return failed;
  }
  throw new Error("Report must be a compact { tests: [...] } fixture or a Playwright JSON report.");
}

export function loadReportFile(filePath: string): FailedTest[] {
  return parseReport(JSON.parse(readFileSync(filePath, "utf8")));
}

export function draftBugs(
  failures: FailedTest[],
  allowedProject: string,
): { drafts: BugDraft[]; skipped: BugSkip[] } {
  const drafts: BugDraft[] = [];
  const skipped: BugSkip[] = [];
  for (const failure of failures) {
    const caseIds = [...new Set(caseIdsFromText(`${failure.title} ${failure.tags.join(" ")}`))];
    if (caseIds.length === 0) {
      skipped.push({ title: failure.title, reason: "no product case tag" });
      continue;
    }
    try {
      const parent = storyKeyFromCaseId(caseIds[0]);
      assertIssueKeyAllowed(parent, allowedProject);
      const project = projectKeyFromIssueKey(parent);
      const error = (failure.error ?? "(no error message)").slice(0, 2000);
      drafts.push({
        project,
        type: "Bug",
        parent,
        caseIds,
        summary: `[${caseIds.join(", ")}] ${failure.title}`.slice(0, 255),
        description: [
          "h2. Failure",
          `*Cases:* ${caseIds.map((id) => `{{${id}}}`).join(", ")}`,
          `*Story:* {{${parent}}}`,
          failure.file ? `*File:* {{${failure.file}}}` : undefined,
          `*Scenario:* ${failure.title}`,
          "",
          "h2. Error",
          `{code}`,
          error,
          `{code}`,
        ]
          .filter((line): line is string => line !== undefined)
          .join("\n"),
      });
    } catch (error) {
      skipped.push({
        title: failure.title,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { drafts, skipped };
}

export function jiraCreatePayload(draft: BugDraft): { fields: Record<string, unknown> } {
  if (draft.project.toUpperCase() === "PT") {
    throw new Error("PT is the framework build board. Bugs go to ORD, not PT.");
  }
  return {
    fields: {
      project: { key: draft.project },
      issuetype: { name: "Bug" },
      summary: draft.summary,
      description: draft.description,
      parent: { key: draft.parent },
    },
  };
}

export function defaultBugPromptPath(): string {
  return path.join(process.cwd(), "loop", "prompts", "failure-to-bug.md");
}

export function composeBugPrompt(
  template: string,
  drafts: BugDraft[],
  skipped: BugSkip[],
): string {
  return `${template.trim()}

BEGIN_DRAFTS
${stripRegionMarkers(JSON.stringify({ drafts, skipped }, null, 2))}
END_DRAFTS`;
}
