# Mirror Protocol

The Mirror Protocol is a quality gate that automatically audits every agent's output. Agents configured with a `mirror` field have their results verified by a designated auditor agent.

## Concept

When an agent completes its work, the mirror auditor reviews the output against predefined criteria:

- Are all critical issues properly described with line references?
- Are severity levels correctly assigned?
- Are security issues comprehensively identified?
- Is the report actionable and clearly written?

## Architecture

```
Primary Agent (e.g., code-review)
  │
  ├─> Produces output (review report)
  │
  ├─> Standalone path (inline):
  │     └─> handleTask() recursively calls mirror agent's handler
  │           └─> Returns { status, feedback }
  │
  └─> DAG path (via RetryHandler):
        └─> MirrorExecutor.executeMirror(primaryTask)
              ├─> taskQueue.enqueue(mirrorTask)
              ├─> taskQueue.waitForCompletion(mirrorTask)
              └─> taskQueue.setTaskMeta(primaryTask, { mirrorStatus })
```

## Inline Mirror (Standalone Tasks)

For non-DAG tasks, the mirror runs **inline** within `handleTask` — instead of enqueuing another task (which would deadlock `processNext`), it calls the LLM directly with the mirror agent's system prompt and model:

```typescript
// In handleTask (server.ts)
const result = await this.llm.chat({
  model: config.model.id,
  systemPrompt: config.description,
  userMessage, // The original task input
});

// After primary completes, run mirror inline
if (config.mirror && !task.dagRunId && this.llm.available) {
  const mirrorConfig = await this.agentLoader.getAgent(mirrorName);

  const mirrorResult = await this.llm.chat({
    model: mirrorConfig.model.id,          // e.g. claude-sonnet-4
    systemPrompt: mirrorConfig.description, // e.g. auditor's system prompt
    userMessage: JSON.stringify(mirrorInput, null, 2),
  });

  // Parse LLM response for status
  const parsed = JSON.parse(mirrorResult.content);
  result.mirrorStatus = parsed.status;     // "pass" | "fail" | "needs-revision"
  result.mirrorFeedback = parsed.feedback;
}
```

The mirror agent's `description` field instructs the LLM to return structured JSON with `status` and `feedback`. The JSON is parsed to determine whether the primary output passes, needs revision, or fails.

## DAG Mirror (via RetryHandler)

For DAG tasks, the `RetryHandler` manages the mirror with retry support:

```typescript
async runWithMirror(task, agentLoader, mirrorExecutor, taskQueue) {
  let currentTask = task;

  while (currentTask.retryCount <= currentTask.maxRetries) {
    const mirrorResult = await mirrorExecutor.executeMirror(currentTask);

    if (mirrorResult.status === "pass") break;

    if (mirrorResult.status === "needs-revision" && currentTask.retryCount < currentTask.maxRetries) {
      currentTask = await taskQueue.enqueue({
        agentName: currentTask.agentName,
        input: {
          ...currentTask.input,
          _retryAttempt: currentTask.retryCount + 1,
          _mirrorFeedback: mirrorResult.feedback,
        },
        parentTaskId: currentTask.parentTaskId,
        dagRunId: currentTask.dagRunId,
      });
      currentTask = await taskQueue.waitForCompletion(currentTask.id);
    } else {
      await taskQueue.updateStatus(currentTask.id, "failed", {
        error: `Mirror audit failed: ${mirrorResult.feedback}`,
      });
      throw new Error(`Mirror audit failed: ${mirrorResult.feedback}`);
    }
  }

  return currentTask;
}
```

## Mirror Agent Configuration

Mirror agents are standard `.agent.md` files. The `code-review-auditor` agent is the built-in example:

```yaml
---
name: code-review-auditor
model:
  id: anthropic/claude-sonnet-4
  provider: openrouter
  params:
    temperature: 0.2
tools:
  - kb/read
permissions:
  filesystem:
    - _kb/
---
# Code Review Auditor (Mirror Agent)

Validates the output of the code-review agent for completeness and accuracy.

## Expected Input
{
  "type": "audit",
  "primaryAgent": "code-review",
  "primaryInput": "...",
  "primaryOutput": "..."
}

## Output
{ "status": "pass" | "fail" | "needs-revision", "feedback": "..." }
```

## Mirror Status Lifecycle

```
Primary task completes (status: "completed")
  │
  ├─> Mirror result: "pass"
  │     └─> mirrorStatus set to "pass"
  │
  ├─> Mirror result: "needs-revision"
  │     └─> mirrorStatus set to "needs-revision"
  │     └─> Primary task re-enqueued with feedback
  │
  └─> Mirror result: "fail"
        └─> mirrorStatus set to "fail"
        └─> Primary task set to "failed" with error
```

## Task Status Output

When a task has been audited, `task/status` includes:

```json
{
  "id": "abc-123",
  "status": "completed",
  "mirrorStatus": "pass",
  "output": {
    "report": "...",
    "mirrorStatus": "pass",
    "mirrorFeedback": "Audit passed: critical issue correctly identified..."
  }
}
```

## Why Inline for Standalone?

The task queue's `processNext` processes tasks in batches. If a mirror task were enqueued inside `processNext`, it would be added to the queue but couldn't be processed until `processNext` finished its current batch. Since the primary task's `runTask` (which runs inside `processNext`) is waiting for the mirror, this would cause a **deadlock**.

The inline approach avoids this by running the mirror synchronously as a recursive function call, bypassing the queue entirely. For DAG tasks, the `RetryHandler` runs outside of `processNext` (after `waitForCompletion` returns), so it can safely enqueue mirror tasks.
