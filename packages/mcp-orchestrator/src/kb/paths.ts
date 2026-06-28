import path from "node:path";

export const KB_DIRECTORIES = {
  INBOX: "inbox",
  OUTBOX: "outbox",
  CONTEXT: "context",
  SESSIONS: "sessions",
} as const;

export function getKBRoot(projectRoot?: string): string {
  return projectRoot ? path.join(projectRoot, "_kb") : path.resolve("_kb");
}

export function resolveKBPath(relativePath: string, projectRoot?: string): string {
  const root = path.resolve(getKBRoot(projectRoot));
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root)) {
    throw new Error(`Path traversal denied: ${relativePath}`);
  }
  return resolved;
}
