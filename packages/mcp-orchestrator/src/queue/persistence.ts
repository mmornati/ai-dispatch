import { Task } from "../schemas/task.js";

export interface TaskPersistence {
  save(task: Task): Promise<void>;
  load(taskId: string): Promise<Task | undefined>;
  loadAll(): Promise<Task[]>;
}

export class InMemoryPersistence implements TaskPersistence {
  private store = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    this.store.set(task.id, { ...task });
  }

  async load(taskId: string): Promise<Task | undefined> {
    const task = this.store.get(taskId);
    return task ? { ...task } : undefined;
  }

  async loadAll(): Promise<Task[]> {
    return Array.from(this.store.values()).map((t) => ({ ...t }));
  }
}

export class SQLitePersistence implements TaskPersistence {
  private db: import("better-sqlite3").Database;

  constructor(dbPath: string) {
    const Database = require("better-sqlite3");
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        input TEXT,
        output TEXT,
        status TEXT NOT NULL DEFAULT 'queued',
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        parent_task_id TEXT,
        dag_run_id TEXT,
        mirror_status TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2
      )
    `);
  }

  async save(task: Task): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks
        (id, agent_name, input, output, status, error, created_at, updated_at,
         started_at, completed_at, parent_task_id, dag_run_id, mirror_status,
         retry_count, max_retries)
      VALUES
        (@id, @agentName, @input, @output, @status, @error, @createdAt, @updatedAt,
         @startedAt, @completedAt, @parentTaskId, @dagRunId, @mirrorStatus,
         @retryCount, @maxRetries)
    `);
    stmt.run({
      id: task.id,
      agentName: task.agentName,
      input: JSON.stringify(task.input),
      output: task.output ? JSON.stringify(task.output) : null,
      status: task.status,
      error: task.error ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt ?? null,
      parentTaskId: task.parentTaskId ?? null,
      dagRunId: task.dagRunId ?? null,
      mirrorStatus: task.mirrorStatus ?? null,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
    });
  }

  async load(taskId: string): Promise<Task | undefined> {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToTask(row);
  }

  async loadAll(): Promise<Task[]> {
    const rows = this.db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToTask(r));
  }

  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      agentName: row.agent_name as string,
      input: JSON.parse(row.input as string),
      output: row.output ? JSON.parse(row.output as string) : undefined,
      status: row.status as Task["status"],
      error: (row.error as string) ?? undefined,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      startedAt: (row.started_at as number) ?? undefined,
      completedAt: (row.completed_at as number) ?? undefined,
      parentTaskId: (row.parent_task_id as string) ?? undefined,
      dagRunId: (row.dag_run_id as string) ?? undefined,
      mirrorStatus: (row.mirror_status as Task["mirrorStatus"]) ?? undefined,
      retryCount: row.retry_count as number,
      maxRetries: row.max_retries as number,
    };
  }
}
