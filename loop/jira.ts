import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseIssue, type ProductIssue } from "./issue";

const SETTINGS = ["JIRA_SITE", "JIRA_EMAIL", "JIRA_API_TOKEN"] as const;

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export function assertJiraSite(site: string): string {
  const withScheme = site.includes("://") ? site : `https://${site}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("JIRA_SITE must be an https Atlassian host (*.atlassian.net).");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port !== "" ||
    !host.endsWith(".atlassian.net") ||
    host === "atlassian.net"
  ) {
    throw new Error("JIRA_SITE must be an https Atlassian host (*.atlassian.net).");
  }
  return host;
}

export function jiraEnv(env: NodeJS.ProcessEnv = process.env): {
  site: string;
  email: string;
  token: string;
} {
  const fromFile = existsSync(path.join(homedir(), ".config", "jira-cli", "jira.env"))
    ? parseEnvFile(path.join(homedir(), ".config", "jira-cli", "jira.env"))
    : {};
  const site = env.JIRA_SITE?.trim() || fromFile.JIRA_SITE;
  const email = env.JIRA_EMAIL?.trim() || fromFile.JIRA_EMAIL;
  const token = env.JIRA_API_TOKEN?.trim() || fromFile.JIRA_API_TOKEN;
  const missing = SETTINGS.filter((key) => {
    if (key === "JIRA_SITE") return !site;
    if (key === "JIRA_EMAIL") return !email;
    return !token;
  });
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")} for --issue. Set them in the environment, or pass --issue-file.`,
    );
  }
  return {
    site: assertJiraSite(site as string),
    email: email as string,
    token: token as string,
  };
}

export async function fetchIssue(
  issueKey: string,
  env: NodeJS.ProcessEnv = process.env,
  getJson: typeof defaultGetJson = defaultGetJson,
): Promise<ProductIssue> {
  const { site, email, token } = jiraEnv(env);
  const url = `https://${site}/rest/api/2/issue/${encodeURIComponent(issueKey)}`;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const raw = await getJson(url, { Authorization: `Basic ${auth}`, Accept: "application/json" });
  return parseIssue(raw);
}

export async function defaultGetJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Jira HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as unknown;
}
