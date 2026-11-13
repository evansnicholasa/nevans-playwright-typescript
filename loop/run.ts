import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { composeAutomatePrompt, defaultAutomatePromptPath } from "./automate";
import {
  composeBugPrompt,
  defaultBugPromptPath,
  draftBugs,
  jiraCreatePayload,
  loadReportFile,
} from "./bugs";
import { loadCasesFile } from "./cases";
import { loadAgentFile, resolvePlan } from "./config";
import { listStepPatterns, reportCoverage, scanFeatures } from "./coverage";
import { runChain } from "./execute";
import {
  assertIssueKeyAllowed,
  assertProductIssue,
  composeStoryPrompt,
  defaultStoryPromptPath,
  loadIssueFile,
  loadLoopFile,
  productProject,
} from "./issue";
import { fetchIssue } from "./jira";

type CliValues = {
  prompt?: string;
  "prompt-file"?: string;
  issue?: string;
  "issue-file"?: string;
  "cases-file"?: string;
  "report-file"?: string;
  coverage?: boolean;
  "dry-run"?: boolean;
  auto?: boolean;
  config?: string;
};

function readPrompt(promptFile: string | undefined, prompt: string | undefined): string {
  if (prompt && promptFile) {
    throw new Error("Pass either --prompt or --prompt-file, not both.");
  }
  if (promptFile) {
    return readFileSync(promptFile, "utf8").trim();
  }
  if (prompt) {
    return prompt.trim();
  }
  throw new Error("Pass --prompt or --prompt-file.");
}

function allowedProductProject(): string {
  return productProject(loadLoopFile());
}

function loadProductCases(filePath: string) {
  const cases = loadCasesFile(filePath);
  assertIssueKeyAllowed(cases.source.key, allowedProductProject());
  return cases;
}

async function resolvePrompt(values: CliValues): Promise<string> {
  const sources = [
    values.issue,
    values["issue-file"],
    values["cases-file"],
    values["report-file"],
  ].filter(Boolean);
  if (sources.length > 1) {
    throw new Error("Pass only one of --issue, --issue-file, --cases-file, or --report-file.");
  }

  if (values["report-file"]) {
    const { drafts, skipped } = draftBugs(loadReportFile(values["report-file"]), allowedProductProject());
    const template = values.prompt
      ? values.prompt
      : readFileSync(values["prompt-file"] ?? defaultBugPromptPath(), "utf8");
    return composeBugPrompt(template, drafts, skipped);
  }

  if (values["cases-file"]) {
    const cases = loadProductCases(values["cases-file"]);
    const report = reportCoverage(cases, scanFeatures());
    const template = values.prompt
      ? values.prompt
      : readFileSync(values["prompt-file"] ?? defaultAutomatePromptPath(), "utf8");
    return composeAutomatePrompt(template, cases, report, listStepPatterns());
  }

  if (!values.issue && !values["issue-file"]) {
    return readPrompt(values["prompt-file"], values.prompt);
  }

  const allowed = allowedProductProject();
  if (values.issue) {
    assertIssueKeyAllowed(values.issue, allowed);
  }

  const issue = values["issue-file"]
    ? loadIssueFile(values["issue-file"])
    : await fetchIssue(values.issue as string);
  assertIssueKeyAllowed(issue.key, allowed);
  assertProductIssue(issue, allowed);

  const template = values.prompt
    ? values.prompt
    : readFileSync(values["prompt-file"] ?? defaultStoryPromptPath(), "utf8");
  return composeStoryPrompt(template, issue);
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "prompt-file": { type: "string" },
      prompt: { type: "string" },
      issue: { type: "string" },
      "issue-file": { type: "string" },
      "cases-file": { type: "string" },
      "report-file": { type: "string" },
      coverage: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      auto: { type: "boolean", default: false },
      config: { type: "string" },
    },
  });

  if (values.coverage) {
    if (!values["cases-file"]) {
      throw new Error("Pass --cases-file with --coverage.");
    }
    const cases = loadProductCases(values["cases-file"]);
    const report = reportCoverage(cases, scanFeatures());
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.missing.length === 0 ? 0 : 1;
  }

  const prompt = await resolvePrompt(values);
  const file = loadAgentFile(values.config);
  const plan = resolvePlan(file);
  const { exitCode, results } = await runChain({
    prompt,
    plan,
    dryRun: values["dry-run"],
    auto: values.auto,
  });

  const extra =
    values["report-file"] && values["dry-run"]
      ? (() => {
          const { drafts, skipped } = draftBugs(
            loadReportFile(values["report-file"] as string),
            allowedProductProject(),
          );
          return {
            bugs: drafts.map((draft) => ({
              method: "POST",
              path: "/rest/api/2/issue",
              body: jiraCreatePayload(draft),
            })),
            skipped,
          };
        })()
      : {};

  process.stdout.write(
    `${JSON.stringify({ primary: plan.primary, attempts: results, ...extra }, null, 2)}\n`,
  );
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
