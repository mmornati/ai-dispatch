import { Task, CreateTaskInput, TaskStatus, VALID_TRANSITIONS } from "../schemas/task.js";
import { TaskPersistence } from "./persistence.js";
import { v4 as uuid } from "uuid";

export type TaskHandler = (task: Task) => Promise<unknown>;

export class TaskQueue {
  private tasks = new Map<string, Task>();
  private waiting = new Map<string, Array<(task: Task) => void>>();
  private handler?: TaskHandler;
  private persistence: TaskPersistence;
  private processing = false;
  private processPending = false;

  constructor(persistence: TaskPersistence) {
    this.persistence = persistence;
  }

  setHandler(handler: TaskHandler) {
    this.handler = handler;
  }

  async enqueue(input: CreateTaskInput): Promise<Task> {
    const task: Task = {
      id: uuid(),
      agentName: input.agentName,
      input: input.input,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentTaskId: input.parentTaskId,
      dagRunId: input.dagRunId,
      retryCount: 0,
      maxRetries: input.maxRetries ?? 2,
    };

    this.tasks.set(task.id, task);
    await this.persistence.save(task);
    this.scheduleProcess();
    return task;
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId);
  }

  async updateStatus(
    taskId: string,
    newStatus: TaskStatus,
    extra?: Partial<Task>
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${task.status} -> ${newStatus} (allowed: ${allowed.join(", ")})`
      );
    }

    task.status = newStatus;
    task.updatedAt = Date.now();

    if (newStatus === "running") task.startedAt = Date.now();
    if (newStatus === "completed" || newStatus === "failed")
      task.completedAt = Date.now();

    if (extra) Object.assign(task, extra);

    await this.persistence.save(task);
    this.notifyWaiters(task);
  }

  async waitForCompletion(
    taskId: string,
    timeoutMs = 300_000
  ): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status === "completed" || task.status === "failed") return task;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanupWaiter(taskId, resolve);
        reject(new Error(`Task ${taskId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handlers = this.waiting.get(taskId) || [];
      handlers.push((t) => {
        clearTimeout(timeout);
        resolve(t);
      });
      this.waiting.set(taskId, handlers);
    });
  }

  async setTaskMeta(taskId: string, meta: Partial<Task>): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    Object.assign(task, meta);
    task.updatedAt = Date.now();
    await this.persistence.save(task);
    this.notifyWaiters(task);
  }

  async listTasks(filter?: {
    status?: TaskStatus;
    dagRunId?: string;
  }): Promise<Task[]> {
    const all = Array.from(this.tasks.values());
    return all.filter((t) => {
      if (filter?.status && t.status !== filter.status) return false;
      if (filter?.dagRunId && t.dagRunId !== filter.dagRunId) return false;
      return true;
    });
  }

  private scheduleProcess(): void {
    if (this.processing) {
      this.processPending = true;
      return;
    }
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.processPending = false;

    try {
      const queued = Array.from(this.tasks.values()).filter(
        (t) => t.status === "queued"
      );

      if (queued.length === 0) return;

      const promises = queued.map((task) =>
        this.runTask(task).catch((err) => {
          console.error(`Task ${task.id} failed:`, err);
        })
      );

      await Promise.all(promises);
    } finally {
      this.processing = false;
      if (this.processPending) {
        setImmediate(() => this.processNext());
      }
    }
  }

  private async runTask(task: Task): Promise<void> {
    await this.updateStatus(task.id, "running");

    try {
      const result = await this.handler!(task);
      await this.updateStatus(task.id, "completed", { output: result });
    } catch (err) {
      const message = (err as Error).message;
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.updatedAt = Date.now();
        await this.persistence.save(task);
        await this.updateStatus(task.id, "queued");
        this.scheduleProcess();
      } else {
        await this.updateStatus(task.id, "failed", { error: message });
      }
    }
  }

  private notifyWaiters(task: Task) {
    const handlers = this.waiting.get(task.id);
    if (handlers) {
      handlers.forEach((h) => h(task));
      this.waiting.delete(task.id);
    }
  }

  private cleanupWaiter(taskId: string, handler: (task: Task) => void) {
    const handlers = this.waiting.get(taskId);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
      if (handlers.length === 0) this.waiting.delete(taskId);
    }
  }
}
