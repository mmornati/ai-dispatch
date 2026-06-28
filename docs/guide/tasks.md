# Task Lifecycle

Tasks are the atomic unit of work in the system. Every `agent/run` call creates a task that flows through a strict state machine.

## State Machine

```
                    ┌─────────┐
                    │ queued  │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
          ┌───▼───┐  ┌──▼───┐      │
          │running│  │cancelled│    │
          └───┬───┘  └───────┘      │
              │                     │
        ┌─────┼─────┐               │
        │     │     │               │
    ┌───▼──┐ ┌─▼────┐              │
    │compl.│ │failed│              │
    └──────┘ └──┬───┘              │
                │                  │
                ▼                  │
           ┌─────────┐             │
           │ queued  │◄────────────┘
           │ (retry) │
           └─────────┘
```

Valid transitions are enforced by the `VALID_TRANSITIONS` map:

| From | To |
|------|----|
| `queued` | `running`, `cancelled` |
| `running` | `completed`, `failed`, `cancelled` |
| `completed` | (terminal — no outgoing) |
| `failed` | `queued` (only for retry) |
| `cancelled` | (terminal — no outgoing) |

## Task Schema

```typescript
interface Task {
  id: string;                // UUID v4
  agentName: string;         // e.g. "code-review"
  input: unknown;            // Payload from agent/run
  output?: unknown;          // Result from handler
  status: TaskStatus;        // "queued" | "running" | "completed" | "failed" | "cancelled"
  error?: string;            // Error message if failed
  createdAt: number;         // Unix timestamp (ms)
  updatedAt: number;
  startedAt?: number;        // Set when transitioning to "running"
  completedAt?: number;      // Set when transitioning to "completed" or "failed"
  parentTaskId?: string;     // For delegation chains
  dagRunId?: string;         // For DAG tasks
  mirrorStatus?: "pending" | "pass" | "fail" | "needs-revision";
  retryCount: number;
  maxRetries: number;        // Default 2
}
```

## The TaskQueue

The `TaskQueue` is the central scheduling engine. It manages an in-memory `Map<string, Task>` and processes tasks asynchronously.

### Enqueue

When `taskQueue.enqueue(input)` is called:

1. Creates a `Task` with a UUID, sets `status: "queued"`
2. Stores it in the in-memory map
3. Persists via the persistence layer (in-memory or SQLite)
4. Calls `scheduleProcess()` to trigger processing

### Processing

`processNext()` runs in a loop:

1. Filters all tasks with `status: "queued"`
2. Runs them concurrently via `Promise.all`
3. For each task, `runTask()`:
   - Transitions to `running`
   - Calls the registered `handler(task)` — this is the agent execution logic
   - On success: transitions to `completed` with the handler's output
   - On failure: retries (if `retryCount < maxRetries`) or transitions to `failed`

```typescript
async runTask(task: Task) {
  await this.updateStatus(task.id, "running");
  try {
    const result = await this.handler!(task);
    await this.updateStatus(task.id, "completed", { output: result });
  } catch (err) {
    if (task.retryCount < task.maxRetries) {
      task.retryCount++;
      await this.updateStatus(task.id, "queued");  // Retry
    } else {
      await this.updateStatus(task.id, "failed", { error: err.message });
    }
  }
}
```

### Wait for Completion

`waitForCompletion(taskId, timeoutMs)` returns a Promise that resolves when the task reaches a terminal state:

```typescript
const task = await taskQueue.waitForCompletion(taskId);
// task.status is now "completed" or "failed"
```

### Task List

`listTasks(filter)` supports filtering by `status` and/or `dagRunId`:

```typescript
const completedTasks = await taskQueue.listTasks({ status: "completed" });
const dagTasks = await taskQueue.listTasks({ dagRunId: "dag-123" });
```

## Persistence

Two persistence backends are available:

| Backend | Class | Use Case |
|---------|-------|----------|
| **In-Memory** | `InMemoryPersistence` | Default — ephemeral per session |
| **SQLite** | `SQLitePersistence` | Durable state across restarts |

The SQLite backend uses `better-sqlite3` with a `tasks` table. Input/output is serialized as JSON.

## Concurrency

The task queue processes all queued tasks concurrently in each `processNext` cycle. This means:

- **Single tasks**: Processed immediately upon enqueue
- **Bursts**: Multiple tasks enqueued together are processed in parallel
- **DAG fan-out**: When a DAG has multiple ready nodes, they execute concurrently

The `processing` flag prevents re-entrant processing, while `processPending` ensures any tasks enqueued during processing are picked up afterward.
