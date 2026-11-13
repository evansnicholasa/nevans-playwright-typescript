import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { caseFileExampleYaml } from "./cases";

const issueSchema = z.object({
  key: z.string().min(1),
  fields: z.object({
    summary: z.string().min(1),
    description: z.union([z.string(), z.record(z.unknown()), z.null()]).optional(),
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
  assertIssueKeyAllowed(issue.key, allowedProject);
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

export function flattenAdf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.map(flattenAdf).join("");
  if (typeof node === "object") {
    const block = node as { type?: string; text?: string; content?: unknown[] };
    const inner = (block.content ?? []).map(flattenAdf).join("");
    const text = `${block.text ?? ""}${inner}`;
    if (block.type === "paragraph" || block.type === "heading") {
      return `${text}\n`;
    }
    return text;
  }
  return "";
}

export function issueDescription(issue: ProductIssue): string {
  const raw = issue.fields.description;
  if (raw == null) return "(no description)";
  const text = (typeof raw === "string" ? raw : flattenAdf(raw)).trim();
  return text || "(no description)";
}

function fenceIssueBody(text: string): string {
  const sanitized = text.replace(/BEGIN_ISSUE/g, "").replace(/END_ISSUE/g, "");
  return `BEGIN_ISSUE\n${sanitized}\nEND_ISSUE`;
}

export function parseIssue(raw: unknown): ProductIssue {
  return issueSchema.parse(raw);
}

export function loadIssueFile(filePath: string): ProductIssue {
  return parseIssue(JSON.parse(readFileSync(filePath, "utf8")));
}

export function composeStoryPrompt(template: string, issue: ProductIssue): string {
  return `${template.trim()}

## Issue
- key: ${issue.key}
- summary: ${issue.fields.summary}

${fenceIssueBody(issueDescription(issue))}

## Output schema
Write one YAML document and nothing else. Do not wrap it in a markdown fence.

${caseFileExampleYaml}`;
}

export function defaultStoryPromptPath(): string {
  return path.join(process.cwd(), "loop", "prompts", "story-to-cases.md");
}
