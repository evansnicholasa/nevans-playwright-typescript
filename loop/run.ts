import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  commandFor,
  isRetryableProviderError,
  loadAgentFile,
  requiredSecret,
  resolvePlan,
  type AgentCandidate,
} from "./config";

type RunResult = {
  candidate: AgentCandidate;
  dryRun: boolean;
  command: string;
  secret: string;
  skipped?: string;
  exitCode?: number;
  stderr?: string;
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

function spawnOnce(argv: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "prompt-file": { type: "string" },
      prompt: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      config: { type: "string" },
    },
  });

  const prompt = readPrompt(values["prompt-file"], values.prompt);
  const file = loadAgentFile(values.config);
  const plan = resolvePlan(file);
  const results: RunResult[] = [];

  for (const [index, candidate] of plan.chain.entries()) {
    const { argv: commandArgv, display } = commandFor(candidate, prompt);
    const secret = requiredSecret(candidate);
    const result: RunResult = {
      candidate,
      dryRun: Boolean(values["dry-run"]),
      command: display,
      secret,
    };

    if (values["dry-run"]) {
      results.push(result);
      continue;
    }

    if (!process.env[secret]) {
      result.skipped = `missing ${secret}`;
      results.push(result);
      if (isLast(index, plan.chain)) {
        break;
      }
      continue;
    }

    try {
      const spawned = await spawnOnce(commandArgv, process.env);
      result.exitCode = spawned.code;
      result.stderr = spawned.stderr;
      results.push(result);
      if (spawned.code === 0) {
        printSummary(plan.primary, results);
        return 0;
      }
      if (!isRetryableProviderError(`${spawned.stderr}\nexit ${spawned.code}`)) {
        printSummary(plan.primary, results);
        return spawned.code;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.exitCode = 1;
      result.stderr = message;
      results.push(result);
      if (!isRetryableProviderError(message) && !/ENOENT/i.test(message)) {
        printSummary(plan.primary, results);
        return 1;
      }
    }
  }

  printSummary(plan.primary, results);
  if (values["dry-run"]) {
    return 0;
  }
  return 1;
}

function isLast(index: number, chain: AgentCandidate[]): boolean {
  return index === chain.length - 1;
}

function printSummary(primary: AgentCandidate, results: RunResult[]): void {
  process.stdout.write(
    `${JSON.stringify({ primary, attempts: results }, null, 2)}\n`,
  );
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
