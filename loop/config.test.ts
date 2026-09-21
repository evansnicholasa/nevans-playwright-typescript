import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  commandFor,
  isRetryableProviderError,
  loadAgentFile,
  requiredSecret,
  resolvePlan,
} from "./config";

test("checked-in agent.json parses and lists the documented fallback order", () => {
  const file = loadAgentFile();
  assert.equal(file.runtime, "opencode");
  assert.equal(file.model, "opencode/big-pickle");
  assert.deepEqual(
    file.fallback.map((c) => `${c.runtime}:${c.model}`),
    [
      "opencode:opencode/mimo-v2.5-free",
      "cursor:composer-2.5",
      "opencode:anthropic/claude-haiku-4-5",
    ],
  );
});

test("empty env overrides are ignored so a workflow_dispatch with blank inputs uses the file", () => {
  const file = loadAgentFile();
  const plan = resolvePlan(file, { AGENT_RUNTIME: "", AGENT_MODEL: "" });
  assert.deepEqual(plan.primary, { runtime: "opencode", model: "opencode/big-pickle" });
});

test("env overrides become the primary and the file default still follows as fallback", () => {
  const file = loadAgentFile();
  const plan = resolvePlan(file, {
    AGENT_RUNTIME: "cursor",
    AGENT_MODEL: "composer-2.5",
  });
  assert.deepEqual(plan.primary, { runtime: "cursor", model: "composer-2.5" });
  assert.equal(plan.chain[0].model, "composer-2.5");
  assert.ok(plan.chain.some((c) => c.model === "opencode/big-pickle"));
  assert.equal(plan.chain.filter((c) => c.model === "composer-2.5").length, 1);
});

test("command argv is runtime-specific and the prompt is not rewritten", () => {
  const prompt = "Reply with LOOP_AGENT_OK";
  assert.deepEqual(commandFor({ runtime: "opencode", model: "opencode/big-pickle" }, prompt).argv, [
    "opencode",
    "run",
    "--model",
    "opencode/big-pickle",
    "--auto",
    prompt,
  ]);
  assert.deepEqual(commandFor({ runtime: "cursor", model: "composer-2.5" }, prompt).argv, [
    "agent",
    "-p",
    prompt,
    "--model",
    "composer-2.5",
  ]);
});

test("secret selection follows runtime, then Anthropic model prefix", () => {
  assert.equal(requiredSecret({ runtime: "cursor", model: "composer-2.5" }), "CURSOR_API_KEY");
  assert.equal(
    requiredSecret({ runtime: "opencode", model: "opencode/big-pickle" }),
    "OPENCODE_API_KEY",
  );
  assert.equal(
    requiredSecret({ runtime: "opencode", model: "anthropic/claude-haiku-4-5" }),
    "ANTHROPIC_API_KEY",
  );
});

test("quota and rate-limit text is retryable; a normal stack trace is not", () => {
  assert.equal(isRetryableProviderError("Free usage exceeded, add credits"), true);
  assert.equal(isRetryableProviderError("too many requests, please try again"), true);
  assert.equal(isRetryableProviderError("HTTP 429"), true);
  assert.equal(isRetryableProviderError("TypeError: Cannot read properties of undefined"), false);
});

test("an invalid runtime in a config file is rejected", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "loop-agent-"));
  const filePath = path.join(dir, "agent.json");
  writeFileSync(filePath, JSON.stringify({ runtime: "claude-code", model: "x" }));
  assert.throws(() => loadAgentFile(filePath));
});
