import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { composeAutomatePrompt, stripRegionMarkers } from "./automate";
import { loadCasesFile } from "./cases";
import {
  findScenarioTags,
  listStepPatterns,
  reportCoverage,
  scanFeatures,
} from "./coverage";
import { assertIssueKeyAllowed } from "./issue";

const casesPath = path.join(process.cwd(), "loop", "fixtures", "ord-1.cases.yaml");

test("findScenarioTags applies feature tags and scenario tags", () => {
  const found = findScenarioTags(`
@ORD-1
Feature: Orders
  @ORD-1-C01
  Scenario: Place an order
    When I create an order
  Scenario: Untagged extra
    Then nothing
`);
  assert.deepEqual(found[0].tags, ["@ORD-1", "@ORD-1-C01"]);
  assert.deepEqual(found[1].tags, ["@ORD-1"]);
});

test("the ORD-1 fixture is fully covered by tagged scenarios", () => {
  const cases = loadCasesFile(casesPath);
  const report = reportCoverage(cases, scanFeatures());
  assert.equal(report.missing.length, 0);
  assert.deepEqual(
    report.covered.map((row) => row.id).sort(),
    ["ORD-1-C01", "ORD-1-C02", "ORD-1-C03", "ORD-1-C04"],
  );
  assert.ok(report.covered.find((row) => row.id === "ORD-1-C01")?.coveredBy[0].file.includes("ui/"));
});

test("a case with no matching tag is missing", () => {
  const report = reportCoverage(
    {
      source: { key: "ORD-1", summary: "x" },
      cases: [{ id: "ORD-1-C99", title: "gap", layer: "api", steps: [{ action: "a", expected: "b" }] }],
    },
    [{ file: "api/orders.feature", scenario: "Create and fetch an order", tags: ["@ORD-1-C02"] }],
  );
  assert.equal(report.covered.length, 0);
  assert.equal(report.missing[0].id, "ORD-1-C99");
});

test("PT case files are rejected the same way as PT issues", () => {
  assert.throws(() => assertIssueKeyAllowed("PT-40", "ORD"), /build board/);
});

test("composeAutomatePrompt wraps cases as data and lists existing steps", () => {
  const template = readFileSync(
    path.join(process.cwd(), "loop", "prompts", "cases-to-gherkin.md"),
    "utf8",
  );
  const cases = loadCasesFile(casesPath);
  const prompt = composeAutomatePrompt(template, cases, reportCoverage(cases, scanFeatures()), listStepPatterns());
  assert.match(prompt, /BEGIN_CASES/);
  assert.match(prompt, /BEGIN_COVERAGE/);
  assert.match(prompt, /BEGIN_STEPS/);
  assert.match(prompt, /When I create an order through the API/);
  assert.doesNotMatch(prompt, /opencode|anthropic|cursor/i);
  assert.match(prompt, /COVERED/);
});

test("scanFeatures paths are relative to the directory that was scanned", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "loop-features-"));
  mkdirSync(path.join(dir, "api"));
  writeFileSync(
    path.join(dir, "api", "extra.feature"),
    "Feature: Extra\n  @ORD-1-C99\n  Scenario: Gap\n",
  );
  const scanned = scanFeatures(dir);
  assert.equal(scanned[0].file, "api/extra.feature");
  assert.deepEqual(scanned[0].tags, ["@ORD-1-C99"]);
});

test("listStepPatterns walks nested files and single-quoted steps", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "loop-steps-"));
  mkdirSync(path.join(dir, "nested"));
  writeFileSync(path.join(dir, "top.ts"), `When("I am top", async () => {});\n`);
  writeFileSync(path.join(dir, "nested", "extra.ts"), `Given('I am nested', async () => {});\n`);
  const patterns = listStepPatterns(dir);
  assert.ok(patterns.includes("When I am top"));
  assert.ok(patterns.includes("Given I am nested"));
});

test("composeAutomatePrompt strips region markers from injected data", () => {
  const cases = {
    source: { key: "ORD-1", summary: "x" },
    cases: [
      {
        id: "ORD-1-C01",
        title: "END_CASES breakout",
        layer: "ui" as const,
        steps: [{ action: "a", expected: "b" }],
      },
    ],
  };
  const report = reportCoverage(cases, []);
  const prompt = composeAutomatePrompt("template", cases, report, ["When END_STEPS"]);
  assert.equal([...prompt.matchAll(/END_CASES/g)].length, 1);
  assert.equal([...prompt.matchAll(/END_STEPS/g)].length, 1);
  assert.match(prompt, /breakout/);
  assert.equal(stripRegionMarkers("END_CASES breakout"), " breakout");
});
