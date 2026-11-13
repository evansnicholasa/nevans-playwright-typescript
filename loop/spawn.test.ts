import assert from "node:assert/strict";
import test from "node:test";
import { quoteCmd, spawnArgv } from "./spawn";

test("quoteCmd wraps the token and doubles inner quotes so cmd.exe does not split", () => {
  assert.equal(quoteCmd("opencode"), `"opencode"`);
  assert.equal(quoteCmd(`say "hi" & dir`), `"say ""hi"" & dir"`);
});

test("spawnArgv never sets a shell; Windows goes through quoted cmd /c", () => {
  assert.deepEqual(spawnArgv(["opencode", "run", "a & b"], "linux"), {
    command: "opencode",
    args: ["run", "a & b"],
  });
  assert.deepEqual(spawnArgv(["opencode", "run", "a & b"], "win32", "cmd.exe"), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", `"opencode" "run" "a & b"`],
  });
});
