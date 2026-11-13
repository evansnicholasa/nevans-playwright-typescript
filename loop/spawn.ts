import { spawn } from "node:child_process";

export type SpawnResult = { code: number; stdout: string; stderr: string };

export type Spawner = (argv: string[], env: NodeJS.ProcessEnv) => Promise<SpawnResult>;

/** Quote one argv token for `cmd.exe /s /c` so `&`, `|`, `%` stay data. */
export function quoteCmd(arg: string): string {
  return `"${arg.replace(/"/g, '""')}"`;
}

export function spawnArgv(
  argv: string[],
  platform = process.platform,
  comspec = process.env.ComSpec ?? "cmd.exe",
): { command: string; args: string[] } {
  if (argv.length === 0) {
    throw new Error("spawnArgv requires a command.");
  }
  if (platform === "win32") {
    return { command: comspec, args: ["/d", "/s", "/c", argv.map(quoteCmd).join(" ")] };
  }
  return { command: argv[0], args: argv.slice(1) };
}

export function spawnOnce(argv: string[], env: NodeJS.ProcessEnv): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const { command, args } = spawnArgv(argv);
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsVerbatimArguments: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}
