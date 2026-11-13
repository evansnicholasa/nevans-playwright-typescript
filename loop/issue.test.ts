import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseCaseFile } from "./cases";
import {
  assertIssueKeyAllowed,
  assertProductIssue,
  composeStoryPrompt,
  flattenAdf,
  loadIssueFile,
  loadLoopFile,
  parseIssue,
  productProject,
} from "./issue";
import { assertJiraSite, fetchIssue } from "./jira";

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
  assert.throws(
    () =>
      assertProductIssue(
        {
          key: "PT-38",
          fields: { summary: "spoof", project: { key: "ORD" } },
        },
        "ORD",
      ),
    /build board/,
  );
});

test("composeStoryPrompt includes the issue and the YAML schema, not a vendor", () => {
  const template = readFileSync(
    path.join(process.cwd(), "loop", "prompts", "story-to-cases.md"),
    "utf8",
  );
  const prompt = composeStoryPrompt(template, loadIssueFile(fixture));
  assert.match(prompt, /ORD-1/);
  assert.match(prompt, /BEGIN_ISSUE/);
  assert.match(prompt, /END_ISSUE/);
  assert.match(prompt, /layer: ui/);
  assert.doesNotMatch(prompt, /opencode|anthropic|cursor/i);
});

test("ADF descriptions flatten to text", () => {
  const issue = parseIssue({
    key: "ORD-1",
    fields: {
      project: { key: "ORD" },
      summary: "Place an order",
      description: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "As a customer I place an order." }],
          },
        ],
      },
    },
  });
  assert.match(flattenAdf(issue.fields.description), /As a customer I place an order/);
  assert.match(composeStoryPrompt("template", issue), /As a customer I place an order/);
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

test("JIRA_SITE must be an https *.atlassian.net host", () => {
  assert.equal(assertJiraSite("job-tracker.atlassian.net"), "job-tracker.atlassian.net");
  assert.throws(() => assertJiraSite("evil.example"), /atlassian\.net/);
  assert.throws(() => assertJiraSite("http://job-tracker.atlassian.net"), /atlassian\.net/);
});

test("fetchIssue refuses a non-Atlassian site before sending the token", async () => {
  await assert.rejects(
    () =>
      fetchIssue(
        "ORD-1",
        {
          JIRA_SITE: "evil.example",
          JIRA_EMAIL: "qa@example.com",
          JIRA_API_TOKEN: "secret-token",
        },
        async () => {
          throw new Error("fetch must not run");
        },
      ),
    /atlassian\.net/,
  );
});
