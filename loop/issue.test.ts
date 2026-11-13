import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseCaseFile } from "./cases";
import {
  assertIssueKeyAllowed,
  assertProductIssue,
  composeStoryPrompt,
  loadIssueFile,
  loadLoopFile,
  productProject,
} from "./issue";
import { fetchIssue } from "./jira";

const fixture = path.join(process.cwd(), "loop", "fixtures", "ord-1.issue.json");

test("loop.json defaults the product project to ORD", () => {
  assert.equal(loadLoopFile().productProject, "ORD");
  assert.equal(productProject(loadLoopFile(), {}), "ORD");
  assert.equal(productProject(loadLoopFile(), { LOOP_PRODUCT_PROJECT: "SHOP" }), "SHOP");
});

test("the ORD-1 fixture is allowed; PT keys are not", () => {
  const issue = loadIssueFile(fixture);
  assert.equal(assertProductIssue(issue, "ORD").key, "ORD-1");
  assert.doesNotThrow(() => assertIssueKeyAllowed("ORD-1", "ORD"));
  assert.throws(() => assertIssueKeyAllowed("PT-38", "ORD"), /build board/);
  assert.throws(() => assertIssueKeyAllowed("KAN-1", "ORD"), /KAN/);
  assert.throws(
    () =>
      assertProductIssue(
        {
          key: "PT-38",
          fields: { summary: "runtime", project: { key: "PT" } },
        },
        "ORD",
      ),
    /build board/,
  );
  assert.throws(
    () =>
      assertProductIssue(
        {
          key: "KAN-1",
          fields: { summary: "other", project: { key: "KAN" } },
        },
        "ORD",
      ),
    /KAN/,
  );
});

test("composeStoryPrompt includes the issue and the YAML schema, not a vendor", () => {
  const template = readFileSync(
    path.join(process.cwd(), "loop", "prompts", "story-to-cases.md"),
    "utf8",
  );
  const prompt = composeStoryPrompt(template, loadIssueFile(fixture));
  assert.match(prompt, /ORD-1/);
  assert.match(prompt, /layer: ui/);
  assert.doesNotMatch(prompt, /opencode|anthropic|cursor/i);
});

test("the ORD-1 case fixture parses against the schema", () => {
  const parsed = parseCaseFile(
    readFileSync(path.join(process.cwd(), "loop", "fixtures", "ord-1.cases.yaml"), "utf8"),
  );
  assert.equal(parsed.source.key, "ORD-1");
  assert.equal(parsed.cases.length, 4);
});

test("fetchIssue parses the Jira payload and does not leak the token into the URL", async () => {
  const seen: { url: string; auth?: string } = { url: "" };
  const issue = await fetchIssue(
    "ORD-1",
    {
      JIRA_SITE: "example.atlassian.net",
      JIRA_EMAIL: "qa@example.com",
      JIRA_API_TOKEN: "secret-token",
    },
    async (url, headers) => {
      seen.url = url;
      seen.auth = headers.Authorization;
      return JSON.parse(readFileSync(fixture, "utf8"));
    },
  );
  assert.equal(issue.key, "ORD-1");
  assert.equal(seen.url, "https://example.atlassian.net/rest/api/2/issue/ORD-1");
  assert.match(seen.auth ?? "", /^Basic /);
  assert.doesNotMatch(seen.url, /secret-token/);
});
