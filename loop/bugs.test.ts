import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  composeBugPrompt,
  draftBugs,
  jiraCreatePayload,
  loadReportFile,
  parseReport,
  storyKeyFromCaseId,
} from "./bugs";

const fixture = path.join(process.cwd(), "loop", "fixtures", "failed-ord-1.json");

test("story key is the case id without the Cxx suffix", () => {
  assert.equal(storyKeyFromCaseId("ORD-1-C01"), "ORD-1");
});

test("the ORD-1 failure fixture drafts one ORD bug and skips untagged and PT tags", () => {
  const { drafts, skipped } = draftBugs(loadReportFile(fixture), "ORD");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].project, "ORD");
  assert.equal(drafts[0].parent, "ORD-1");
  assert.deepEqual(drafts[0].caseIds, ["ORD-1-C01"]);
  assert.match(drafts[0].summary, /ORD-1-C01/);
  assert.ok(skipped.some((row) => row.reason === "no product case tag"));
  assert.ok(skipped.some((row) => /build board/.test(row.reason)));
});

test("jiraCreatePayload is an ORD Bug with a parent story and never PT", () => {
  const { drafts } = draftBugs(loadReportFile(fixture), "ORD");
  const body = jiraCreatePayload(drafts[0]);
  assert.deepEqual(body.fields.project, { key: "ORD" });
  assert.deepEqual(body.fields.issuetype, { name: "Bug" });
  assert.deepEqual(body.fields.parent, { key: "ORD-1" });
  assert.throws(
    () =>
      jiraCreatePayload({
        ...drafts[0],
        project: "PT",
        parent: "PT-1",
      }),
    /build board/,
  );
});

test("Playwright JSON suites flatten to failed specs with tags", () => {
  const failed = parseReport({
    suites: [
      {
        suites: [
          {
            specs: [
              {
                title: "A customer can place an order @ORD-1-C01",
                file: "create-order.feature",
                tags: [{ name: "@ORD-1-C01" }],
                tests: [
                  {
                    results: [
                      { status: "failed", error: { message: "not visible" } },
                      { status: "passed" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(failed.length, 1);
  const { drafts } = draftBugs(failed, "ORD");
  assert.equal(drafts[0].parent, "ORD-1");
  assert.match(drafts[0].description, /not visible/);
});

test("composeBugPrompt wraps drafts as data", () => {
  const template = readFileSync(
    path.join(process.cwd(), "loop", "prompts", "failure-to-bug.md"),
    "utf8",
  );
  const result = draftBugs(loadReportFile(fixture), "ORD");
  const prompt = composeBugPrompt(template, result.drafts, result.skipped);
  assert.match(prompt, /BEGIN_DRAFTS/);
  assert.match(prompt, /ORD-1-C01/);
  assert.doesNotMatch(prompt, /opencode|anthropic|cursor/i);
});
