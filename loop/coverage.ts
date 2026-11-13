import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CaseFile } from "./cases";

export type ScenarioRef = {
  file: string;
  scenario: string;
  tags: string[];
};

export type CoverageRow = {
  id: string;
  title: string;
  layer: string;
  coveredBy: ScenarioRef[];
};

export type CoverageReport = {
  source: string;
  covered: CoverageRow[];
  missing: CoverageRow[];
};

export function findScenarioTags(featureText: string): Array<{ scenario: string; tags: string[] }> {
  const lines = featureText.split(/\r?\n/);
  let featureTags: string[] = [];
  let pending: string[] = [];
  const out: Array<{ scenario: string; tags: string[] }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("@")) {
      pending.push(...trimmed.split(/\s+/).filter((token) => token.startsWith("@")));
      continue;
    }
    if (/^Feature:/i.test(trimmed)) {
      featureTags = pending;
      pending = [];
      continue;
    }
    const scene = /^\s*Scenario(?: Outline)?:\s*(.+)/.exec(line);
    if (scene) {
      out.push({
        scenario: scene[1].trim(),
        tags: [...featureTags, ...pending],
      });
      pending = [];
    }
  }
  return out;
}

export function walkFiles(dir: string, suffix: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(suffix)) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

export function listFeatureFiles(featuresDir = path.join(process.cwd(), "features")): string[] {
  return walkFiles(featuresDir, ".feature");
}

export function scanFeatures(featuresDir = path.join(process.cwd(), "features")): ScenarioRef[] {
  return listFeatureFiles(featuresDir).flatMap((file) =>
    findScenarioTags(readFileSync(file, "utf8")).map((scene) => ({
      file: path.relative(featuresDir, file).replaceAll("\\", "/"),
      scenario: scene.scenario,
      tags: scene.tags,
    })),
  );
}

export function reportCoverage(cases: CaseFile, scenarios: ScenarioRef[]): CoverageReport {
  const covered: CoverageRow[] = [];
  const missing: CoverageRow[] = [];
  for (const testCase of cases.cases) {
    const tag = `@${testCase.id}`;
    const row: CoverageRow = {
      id: testCase.id,
      title: testCase.title,
      layer: testCase.layer,
      coveredBy: scenarios.filter((scene) => scene.tags.includes(tag)),
    };
    if (row.coveredBy.length) covered.push(row);
    else missing.push(row);
  }
  return { source: cases.source.key, covered, missing };
}

export function listStepPatterns(stepsDir = path.join(process.cwd(), "src", "steps")): string[] {
  const patterns = new Set<string>();
  const matcher = /(Given|When|Then)\(\s*(["'])([^"'\\]*)\2/g;
  for (const file of walkFiles(stepsDir, ".ts")) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(matcher)) {
      patterns.add(`${match[1]} ${match[3]}`);
    }
  }
  return [...patterns].sort();
}
