import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { AgentConfig, AgentConfigSchema } from "../schemas/agent-config.js";
import { ConfigCache } from "./config-cache.js";

const AGENTS_DIR = "agents";

export class AgentLoader {
  private cache: ConfigCache<AgentConfig>;
  private agentsDir: string;

  constructor(projectRoot?: string) {
    this.cache = new ConfigCache<AgentConfig>();
    this.agentsDir = projectRoot
      ? path.join(projectRoot, AGENTS_DIR)
      : path.resolve(AGENTS_DIR);
  }

  async loadAll(): Promise<Map<string, AgentConfig>> {
    const files = await this.discoverAgentFiles();
    const agents = new Map<string, AgentConfig>();

    for (const file of files) {
      try {
        const config = await this.loadSingle(file);
        if (config) {
          agents.set(config.name, config);
          this.cache.set(config.name, config);
        }
      } catch (err) {
        console.error(`Failed to load agent config from ${file}:`, err);
      }
    }

    return agents;
  }

  async loadSingle(filePath: string): Promise<AgentConfig | null> {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = this.parseFrontmatter(content);
    if (!parsed) return null;

    const validated = AgentConfigSchema.parse(parsed.attributes);
    validated.description = parsed.body.trim();
    return validated;
  }

  async getAgent(name: string): Promise<AgentConfig | undefined> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const agents = await this.loadAll();
    return agents.get(name);
  }

  async listAgentNames(): Promise<string[]> {
    const agents = await this.loadAll();
    return Array.from(agents.keys());
  }

  private async discoverAgentFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.agentsDir);
      return entries
        .filter((e) => e.endsWith(".agent.md"))
        .map((e) => path.join(this.agentsDir, e));
    } catch {
      return [];
    }
  }

  private parseFrontmatter(
    content: string
  ): { attributes: Record<string, unknown>; body: string } | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const attributes = yaml.load(match[1]) as Record<string, unknown>;
    const body = match[2];
    return { attributes, body };
  }
}
