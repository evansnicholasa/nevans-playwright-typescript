import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { CaseFile } from "./cases";
import type { CoverageReport } from "./coverage";

export function defaultAutomatePromptPath(): string {
  return path.join(process.cwd(), "loop", "prompts", "cases-to-gherkin.md");
}

export function composeAutomatePrompt(
  template: string,
  cases: CaseFile,
  report: CoverageReport,
  steps: string[],
): string {
  return `${template.trim()}

BEGIN_CASES
${stringifyYaml(cases).trim()}
END_CASES

BEGIN_COVERAGE
${JSON.stringify(report, null, 2)}
END_COVERAGE

BEGIN_STEPS
${steps.join("\n")}
END_STEPS`;
}
