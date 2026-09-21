import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const runtimes = ["opencode", "cursor"] as const;
export type AgentRuntime = (typeof runtimes)[number];

export const candidateSchema = z.object({
  runtime: z.enum(runtimes),
  model: z.string().min(1),
});

export type AgentCandidate = z.infer<typeof candidateSchema>;

const fileSchema = candidateSchema.extend({
  fallback: z.array(candidateSchema).default([]),
});

export type AgentFileConfig = z.infer<typeof fileSchema>;

export type ResolvedAgentPlan = {
  primary: AgentCandidate;
  chain: AgentCandidate[];
};

const QUOTA_PATTERNS = [
  /free usage exceeded/i,
  /too many requests/i,
  /rate limit/i,
  /\b429\b/,
  /insufficient[_ ]quota/i,
  /credit balance/i,
  /add credits/i,
  /resource has been exhausted/i,
];

export function defaultConfigPath(): string {
  return path.join(process.cwd(), "loop", "agent.json");
}

export function loadAgentFile(filePath = defaultConfigPath()): AgentFileConfig {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return fileSchema.parse(raw);
}

export function candidateFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Partial<AgentCandidate> {
  const runtime = env.AGENT_RUNTIME?.trim();
  const model = env.AGENT_MODEL?.trim();
  return {
    ...(runtime ? { runtime: z.enum(runtimes).parse(runtime) } : {}),
    ...(model ? { model } : {}),
  };
}

export function resolvePlan(
  file: AgentFileConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAgentPlan {
  const override = candidateFromEnv(env);
  const primary: AgentCandidate = {
    runtime: override.runtime ?? file.runtime,
    model: override.model ?? file.model,
  };
  return {
    primary,
    chain: dedupe([primary, { runtime: file.runtime, model: file.model }, ...file.fallback]),
  };
}

function dedupe(candidates: AgentCandidate[]): AgentCandidate[] {
  const seen = new Set<string>();
  const out: AgentCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.runtime}:${candidate.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

export function isRetryableProviderError(text: string): boolean {
  return QUOTA_PATTERNS.some((pattern) => pattern.test(text));
}

export function requiredSecret(candidate: AgentCandidate): string {
  if (candidate.runtime === "cursor") return "CURSOR_API_KEY";
  if (candidate.model.startsWith("anthropic/")) return "ANTHROPIC_API_KEY";
  return "OPENCODE_API_KEY";
}

export function commandFor(
  candidate: AgentCandidate,
  prompt: string,
): { argv: string[]; display: string } {
  const argv =
    candidate.runtime === "opencode"
      ? ["opencode", "run", "--model", candidate.model, "--auto", prompt]
      : ["agent", "-p", prompt, "--model", candidate.model];
  return { argv, display: argv.map(quote).join(" ") };
}

function quote(part: string): string {
  if (/^[a-zA-Z0-9_./:@+=-]+$/.test(part)) return part;
  return JSON.stringify(part);
}
