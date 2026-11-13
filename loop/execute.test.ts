import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlan, type AgentFileConfig } from "./config";
import { runChain } from "./execute";
import type { Spawner } from "./spawn";

const file: AgentFileConfig = {
  runtime: "opencode",
  model: "opencode/big-pickle",
  fallback: [
    { runtime: "opencode", model: "opencode/mimo-v2.5-free" },
    { runtime: "cursor", model: "composer-2.5" },
  ],
};

test("missing Cursor secret skips that candidate; OpenCode free models still run", async () => {
  const calls: string[][] = [];
  const spawn: Spawner = async (argv) => {
    calls.push(argv);
    return { code: 1, stdout: "HTTP 429", stderr: "" };
  };
  const { exitCode, results } = await runChain({
    prompt: "ping",
    plan: resolvePlan(file, {}),
    env: {},
    spawn,
  });
  assert.equal(exitCode, 1);
  assert.equal(results[0].skipped, undefined);
  assert.equal(results[1].skipped, undefined);
  assert.equal(results[2].skipped, "missing CURSOR_API_KEY");
  assert.equal(calls.length, 2);
});

test("quota text on stdout advances the chain; a hard error stops it", async () => {
  const spawn: Spawner = async (argv) => {
    if (argv.includes("opencode/big-pickle")) {
      return { code: 1, stdout: "Free usage exceeded, add credits", stderr: "" };
    }
    if (argv.includes("opencode/mimo-v2.5-free")) {
      return { code: 1, stdout: "", stderr: "TypeError: boom" };
    }
    return { code: 0, stdout: "ok", stderr: "" };
  };
  const { exitCode, results } = await runChain({
    prompt: "ping",
    plan: resolvePlan(file, {}),
    env: { CURSOR_API_KEY: "x" },
    spawn,
  });
  assert.equal(exitCode, 1);
  assert.equal(results.length, 2);
  assert.equal(results[1].candidate.model, "opencode/mimo-v2.5-free");
});

test("dry-run records the chain and does not spawn", async () => {
  const spawn: Spawner = async () => {
    throw new Error("spawn must not run in dry-run");
  };
  const { exitCode, results } = await runChain({
    prompt: "ping",
    plan: resolvePlan(file, {}),
    dryRun: true,
    spawn,
  });
  assert.equal(exitCode, 0);
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.dryRun));
});
