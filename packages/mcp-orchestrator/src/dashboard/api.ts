import type { TaskQueue } from "../queue/task-queue.js";
import type { KnowledgeBase } from "../kb/layout.js";
import type { AgentLoader } from "../loader/agent-loader.js";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface DashboardDeps {
  taskQueue: TaskQueue;
  kb: KnowledgeBase;
  agentLoader: AgentLoader;
}

export async function handleAPIRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DashboardDeps
): Promise<boolean> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  const json = (data: unknown, code = 200) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  const err = (msg: string, code = 400) => json({ error: msg }, code);

  try {
    if (path === "/api/tasks") {
      const status = url.searchParams.get("status") || undefined;
      const dagRunId = url.searchParams.get("dagRunId") || undefined;
      const tasks = await deps.taskQueue.listTasks(
        status || dagRunId ? { status: status as any, dagRunId } : undefined
      );
      return json({ tasks }), true;
    }

    if (path === "/api/tasks/counts") {
      const all = await deps.taskQueue.listTasks();
      const counts = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
      for (const t of all) counts[t.status]++;
      return json(counts), true;
    }

    if (path === "/api/tasks/recent") {
      const all = await deps.taskQueue.listTasks();
      all.sort((a, b) => b.createdAt - a.createdAt);
      return json({ tasks: all.slice(0, 20) }), true;
    }

    if (path === "/api/kb") {
      const tree = await walkKbTree(deps.kb, "");
      return json(tree), true;
    }

    if (path === "/api/kb/read") {
      const filePath = url.searchParams.get("path");
      if (!filePath) return err("path query param required"), true;
      const content = await deps.kb.read(filePath);
      if (content === null) return err("File not found", 404), true;
      return json({ content, path: filePath }), true;
    }

    if (path === "/api/agents") {
      const agents = await deps.agentLoader.loadAll();
      const list = Array.from(agents.values()).map((a) => ({
        name: a.name,
        model: a.model,
        tools: a.tools,
        mirror: a.mirror || null,
        trigger: a.trigger || null,
        maxRetries: a.maxRetries,
      }));
      return json({ agents: list }), true;
    }

    if (path === "/api/dag-runs") {
      const sessions = await deps.kb.list("sessions");
      const runs: Array<{ id: string; definition: unknown }> = [];
      for (const s of sessions) {
        const id = s.replace("/", "");
        const def = await deps.kb.read(`sessions/${id}/definition.json`);
        runs.push({ id, definition: def ? JSON.parse(def) : null });
      }
      return json({ runs }), true;
    }

    if (path === "/api/health") {
      return json({ status: "ok", uptime: process.uptime() }), true;
    }
  } catch (e) {
    return err((e as Error).message, 500), true;
  }

  return false;
}

interface KbEntry {
  name: string;
  type: "dir" | "file";
  size?: number;
  children?: KbEntry[];
}

async function walkKbTree(kb: KnowledgeBase, relPath: string): Promise<KbEntry[]> {
  const entries = await kb.list(relPath);
  const result: KbEntry[] = [];

  for (const entry of entries) {
    const isDir = entry.endsWith("/");
    const name = isDir ? entry.slice(0, -1) : entry;
    const fullRel = relPath ? `${relPath}/${name}` : name;

    if (isDir) {
      result.push({
        name,
        type: "dir",
        children: await walkKbTree(kb, fullRel),
      });
    } else {
      let size: number | undefined;
      try {
        const content = await kb.read(fullRel);
        size = content ? content.length : 0;
      } catch {
        size = 0;
      }
      result.push({ name, type: "file", size });
    }
  }

  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return result;
}
