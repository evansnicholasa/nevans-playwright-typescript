import {
  commandFor,
  isRetryableProviderError,
  requiredSecret,
  type AgentCandidate,
  type ResolvedAgentPlan,
} from "./config";
import { spawnOnce, type Spawner } from "./spawn";

export type RunResult = {
  candidate: AgentCandidate;
  dryRun: boolean;
  command: string;
  secret?: string;
  skipped?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
};

export type RunChainOptions = {
  prompt: string;
  plan: ResolvedAgentPlan;
  env?: NodeJS.ProcessEnv;
  dryRun?: boolean;
  auto?: boolean;
  spawn?: Spawner;
};

export async function runChain(options: RunChainOptions): Promise<{
  exitCode: number;
  results: RunResult[];
}> {
  const env = options.env ?? process.env;
  const spawn = options.spawn ?? spawnOnce;
  const results: RunResult[] = [];

  for (const candidate of options.plan.chain) {
    const { argv, display } = commandFor(candidate, options.prompt, { auto: options.auto });
    const secret = requiredSecret(candidate);
    const result: RunResult = {
      candidate,
      dryRun: Boolean(options.dryRun),
      command: display,
      secret,
    };

    if (options.dryRun) {
      results.push(result);
      continue;
    }

    if (secret && !env[secret]) {
      result.skipped = `missing ${secret}`;
      results.push(result);
      continue;
    }

    try {
      const spawned = await spawn(argv, env);
      result.exitCode = spawned.code;
      result.stdout = spawned.stdout;
      result.stderr = spawned.stderr;
      results.push(result);
      if (spawned.code === 0) {
        return { exitCode: 0, results };
      }
      const combined = `${spawned.stdout}\n${spawned.stderr}\nexit ${spawned.code}`;
      if (!isRetryableProviderError(combined)) {
        return { exitCode: spawned.code, results };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.exitCode = 1;
      result.stderr = message;
      results.push(result);
      if (!isRetryableProviderError(message) && !/ENOENT/i.test(message)) {
        return { exitCode: 1, results };
      }
    }
  }

  return { exitCode: options.dryRun ? 0 : 1, results };
}
