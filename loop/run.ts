import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadAgentFile, resolvePlan } from "./config";
import { runChain } from "./execute";

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

async function main(argv = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "prompt-file": { type: "string" },
      prompt: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      auto: { type: "boolean", default: false },
      config: { type: "string" },
    },
  });

  const prompt = readPrompt(values["prompt-file"], values.prompt);
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
