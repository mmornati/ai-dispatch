import * as fs from "node:fs/promises";
import * as path from "node:path";

const KB_ROOT = "_kb";

export class KnowledgeBase {
  private root: string;

  constructor(projectRoot?: string) {
    this.root = projectRoot ? path.join(projectRoot, KB_ROOT) : path.resolve(KB_ROOT);
  }

  getRoot(): string {
    return this.root;
  }

  async ensureDirs(): Promise<void> {
    const dirs = [
      "inbox",
      "outbox",
      "context",
      "sessions",
    ];
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.root, dir), { recursive: true });
    }
  }

  async read(relativePath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.root, relativePath);
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(this.root))) {
        throw new Error("Path traversal detected");
      }
      return await fs.readFile(resolved, "utf-8");
    } catch {
      return null;
    }
  }

  async write(relativePath: string, content: string): Promise<string> {
    const fullPath = path.join(this.root, relativePath);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(this.root))) {
      throw new Error("Path traversal detected");
    }
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, "utf-8");
    return resolved;
  }

  async list(relativePath: string = ""): Promise<string[]> {
    try {
      const fullPath = path.join(this.root, relativePath);
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(this.root))) {
        throw new Error("Path traversal detected");
      }
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries.map((e) =>
        e.isDirectory() ? `${e.name}/` : e.name
      );
    } catch {
      return [];
    }
  }

  async search(pattern: string, relativePath: string = ""): Promise<string[]> {
    const results: string[] = [];
    const searchDir = path.join(this.root, relativePath);
    const resolved = path.resolve(searchDir);

    if (!resolved.startsWith(path.resolve(this.root))) {
      throw new Error("Path traversal detected");
    }

    async function walk(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (entry.isFile()) {
            const content = await fs.readFile(fullPath, "utf-8");
            if (content.includes(pattern) || entry.name.includes(pattern)) {
              results.push(path.relative(resolved, fullPath));
            }
          }
        }
      } catch {
        // skip unreadable
      }
    }

    await walk(searchDir);
    return results;
  }

  sessionPath(sessionId: string): string {
    return `sessions/${sessionId}`;
  }
}
