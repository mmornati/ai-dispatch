export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface Task {
  id: string;
  agentName: string;
  input: unknown;
  output?: unknown;
  status: TaskStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  parentTaskId?: string;
  dagRunId?: string;
  mirrorStatus?: "pending" | "pass" | "fail" | "needs-revision";
  retryCount: number;
  maxRetries: number;
  progress?: string;
}

export interface CreateTaskInput {
  agentName: string;
  input: unknown;
  parentTaskId?: string;
  dagRunId?: string;
  maxRetries?: number;
}

export enum TaskLifecycle {
  QUEUED = "queued",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["queued"],
  cancelled: [],
};
