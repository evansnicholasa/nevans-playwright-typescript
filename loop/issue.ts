import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { caseFileExampleYaml } from "./cases";

const issueSchema = z.object({
  key: z.string().min(1),
  fields: z.object({
    summary: z.string().min(1),
    description: z.string().nullable().optional(),
    project: z.object({
      key: z.string().min(1),
    }),
  }),
});

export type ProductIssue = z.infer<typeof issueSchema>;

const loopFileSchema = z.object({
  productProject: z.string().min(1),
});

export type LoopFileConfig = z.infer<typeof loopFileSchema>;

export function defaultLoopConfigPath(): string {
  return path.join(process.cwd(), "loop", "loop.json");
}

export function loadLoopFile(filePath = defaultLoopConfigPath()): LoopFileConfig {
  return loopFileSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

export function productProject(
  file: LoopFileConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.LOOP_PRODUCT_PROJECT?.trim() || file.productProject;
}

export function projectKeyFromIssueKey(issueKey: string): string {
  const match = /^([A-Z][A-Z0-9]*)-\d+$/.exec(issueKey.trim().toUpperCase());
  if (!match) {
    throw new Error(`Not a Jira issue key: ${issueKey}`);
  }
  return match[1];
}

export function assertIssueKeyAllowed(issueKey: string, allowedProject: string): void {
  const project = projectKeyFromIssueKey(issueKey);
  if (project === "PT") {
    throw new Error(
      "PT is the framework build board. The loop reads product stories from ORD, not PT.",
    );
  }
  if (project !== allowedProject.toUpperCase()) {
    throw new Error(
      `Issue ${issueKey} is in ${project}; configured product project is ${allowedProject}.`,
    );
  }
}

export function assertProductIssue(
  issue: ProductIssue,
  allowedProject: string,
): ProductIssue {
  const project = issue.fields.project.key.toUpperCase();
  if (project === "PT") {
    throw new Error(
      "PT is the framework build board. The loop reads product stories from ORD, not PT.",
    );
  }
  if (project !== allowedProject.toUpperCase()) {
    throw new Error(
      `Issue ${issue.key} is in ${project}; configured product project is ${allowedProject}.`,
    );
  }
  return issue;
}

export function parseIssue(raw: unknown): ProductIssue {
  return issueSchema.parse(raw);
}

export function loadIssueFile(filePath: string): ProductIssue {
  return parseIssue(JSON.parse(readFileSync(filePath, "utf8")));
}

export function composeStoryPrompt(template: string, issue: ProductIssue): string {
  const description = issue.fields.description?.trim() || "(no description)";
  return `${template.trim()}

## Issue
- key: ${issue.key}
- summary: ${issue.fields.summary}

${description}

## Output schema
Write one YAML document and nothing else. Do not wrap it in a markdown fence.

${caseFileExampleYaml}`;
}

export function defaultStoryPromptPath(): string {
  return path.join(process.cwd(), "loop", "prompts", "story-to-cases.md");
}
