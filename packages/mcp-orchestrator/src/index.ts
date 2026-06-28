#!/usr/bin/env node
import { MCPOrchestratorServer, OrchestratorConfig } from "./server.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function loadEnvFile(envPath: string): void {
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  } catch {
    // .env file not found or unreadable — skip
  }
}

const transport = getArg("--transport") === "sse" ? "sse" : "stdio";
const port = parseInt(getArg("--port") ?? "3100", 10);

function findProjectRoot(startPath: string): string {
  let current = resolve(startPath);
  while (current !== "/") {
    if (
      existsSync(resolve(current, "_bmad", "config.toml")) ||
      existsSync(resolve(current, "agents")) ||
      existsSync(resolve(current, "opencode.json"))
    ) {
      return current;
    }
    current = resolve(current, "..");
  }
  return startPath;
}

const projectRoot = findProjectRoot(process.cwd());
loadEnvFile(resolve(projectRoot, ".env"));

const config: OrchestratorConfig = {
  transport,
  port,
  projectRoot,
};

const authEnabled = hasFlag("--auth-enabled") || getArg("--auth") === "enabled";
if (authEnabled || getArg("--auth-jwks-url") || getArg("--auth-secret-key")) {
  config.auth = {
    enabled: authEnabled || !!getArg("--auth-jwks-url") || !!getArg("--auth-secret-key"),
    issuer: getArg("--auth-issuer"),
    audience: getArg("--auth-audience"),
    jwksUrl: getArg("--auth-jwks-url"),
    secretKey: getArg("--auth-secret-key"),
  };
}

const server = new MCPOrchestratorServer(config);

process.on("SIGINT", async () => {
  await server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await server.stop();
  process.exit(0);
});

server.start().catch((err) => {
  console.error("Failed to start orchestrator:", err);
  process.exit(1);
});
