import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadAgentFile, resolvePlan } from "./config";
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

async function resolvePrompt(values: {
  prompt?: string;
  "prompt-file"?: string;
  issue?: string;
  "issue-file"?: string;
}): Promise<string> {
  if (values.issue && values["issue-file"]) {
    throw new Error("Pass either --issue or --issue-file, not both.");
  }
  if (!values.issue && !values["issue-file"]) {
    return readPrompt(values["prompt-file"], values.prompt);
  }

  const allowed = productProject(loadLoopFile());
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
      "dry-run": { type: "boolean", default: false },
      auto: { type: "boolean", default: false },
      config: { type: "string" },
    },
  });

  const prompt = await resolvePrompt(values);
  const file = loadAgentFile(values.config);
  const plan = resolvePlan(file);
  const { exitCode, results } = await runChain({
    prompt,
    plan,
    dryRun: values["dry-run"],
    auto: values.auto,
  });

  process.stdout.write(`${JSON.stringify({ primary: plan.primary, attempts: results }, null, 2)}\n`);
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
