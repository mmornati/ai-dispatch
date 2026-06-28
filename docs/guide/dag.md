# DAG Execution

A Directed Acyclic Graph (DAG) enables multi-step agent workflows with explicit dependency ordering, parallel fan-out, and cycle-safe validation.

## DAG Step Schema

Each step in a DAG is defined as:

```typescript
interface DAGStep {
  id: string;                  // Unique step identifier
  agent: string;               // Agent name to execute
  input?: string;              // Input payload (passed as string)
  depends_on?: string[];       // IDs of steps that must complete first
  continue_on_error?: boolean; // If true, don't fail the DAG on this step
}
```

### Example: 3-Step DAG

```json
[
  { "id": "a", "agent": "code-review", "input": "diff data..." },
  { "id": "b", "agent": "docs-sync", "input": "docs input...", "depends_on": ["a"] },
  { "id": "c", "agent": "onboarding", "input": "Jane, senior TS dev", "depends_on": ["a"] }
]
```

This creates a graph where `A` runs first, then `B` and `C` run in parallel after `A` completes.

## Execution Flow

```
User sends DAG request
  │
  ▼
createRunAgentTool handler (dag path)
  │
  ├─> dagRunner.validateDAG(steps)
  │     └─> topologicalSort(dag)
  │           └─> DFS with cycle detection
  │                 ├─> If cycle found → return error "Cycle detected at node: {id}"
  │                 └─> If valid → continue
  │
  ├─> dagRunner.runDAG(steps)
  │     ├─> buildDAG(steps)
  │     │     ├─> Auto-generates dag-{timestamp} ID
  │     │     └─> Identifies entry points (no depends_on)
  │     │
  │     ├─> kb.write("sessions/{dagId}/definition.json", steps)
  │     │     └─> Persists DAG definition for traceability
  │     │
  │     └─> DAGExecutor.execute(dag)
  │           ├─> Creates DAGRun { status: "running", nodeStatuses: all "pending" }
  │           │
  │           └─> tick(dag, run)  [recursive loop]
  │                 ├─> getReadyNodes(dag, run)
  │                 │     └─> Nodes whose dependencies are all "completed" or "skipped"
  │                 │
  │                 ├─> executeNode(dag, run, nodeId)
  │                 │     ├─> taskQueue.enqueue({ agentName, input: { nodeId, dagRunId, input } })
  │                 │     ├─> taskQueue.waitForCompletion(task.id)
  │                 │     ├─> RetryHandler.runWithMirror(task)  [mirror + retry loop]
  │                 │     └─> setNodeStatus("completed" | "failed")
  │                 │
  │                 ├─> If no ready nodes and all terminal → set run status
  │                 └─> Else → tick() recurses
  │
  └─> Returns { dagRunId, status, nodeStatuses }
```

## Scheduling Algorithm

The `scheduleDAG` function groups nodes into execution batches by their depth level:

```typescript
function scheduleDAG(dag: DAGDefinition): ExecutionBatch[] {
  const sorted = topologicalSort(dag);
  const nodeLevel = new Map();

  for (const nodeId of sorted) {
    const node = dag.nodes.get(nodeId);
    let level = 0;
    if (node.dependsOn.length > 0) {
      level = Math.max(...node.dependsOn.map(d => nodeLevel.get(d) ?? 0)) + 1;
    }
    nodeLevel.set(nodeId, level);
    // Group by level
  }
  return batches;  // Each batch runs in parallel
}
```

For the 3-step example above:
- **Level 0**: `A` (no dependencies)
- **Level 1**: `B`, `C` (both depend on `A`)

All nodes at the same level execute concurrently.

## Cycle Detection

The topological sort performs DFS with cycle detection:

```
visiting = new Set()
visited = new Set()

function dfs(nodeId):
  if nodeId in visiting → throw "Cycle detected at node: {id}"
  if nodeId in visited → return
  visiting.add(nodeId)
  for each dependency:
    dfs(dependency)
  visiting.delete(nodeId)
  visited.add(nodeId)
```

When `agent/run` receives a DAG with cycles:

```json
// Input: a depends on b, b depends on a
[
  { "id": "a", "agent": "code-review", "depends_on": ["b"] },
  { "id": "b", "agent": "docs-sync", "depends_on": ["a"] }
]
```

**Result:**
```json
{
  "isError": true,
  "content": [{ "type": "text", "text": "DAG validation failed: Cycle detected in DAG at node: a" }]
}
```

## Mirror + Retry in DAGs

After a DAG node's primary task completes, the `RetryHandler` runs the mirror:

1. Calls `MirrorExecutor.executeMirror(primaryTask)` — enqueues a mirror task
2. Waits for the mirror task to complete
3. If mirror returns `"pass"` → done, node completes
4. If mirror returns `"needs-revision"` and `retryCount < maxRetries` → re-queue primary with feedback
5. If mirror returns `"fail"` → node fails

The DAG executor uses `waitForCompletion` for both the primary task and the mirror task, ensuring ordering is maintained.

## Error Handling

- **`continue_on_error`**: If set on a node, the DAG continues even if that node fails. The failed node is marked as `"failed"` but doesn't block dependent nodes.
- **Hard failures**: Nodes without `continue_on_error` that fail cause the entire DAG to fail.
- **Skipped nodes**: If a dependency fails and the node doesn't have `continue_on_error`, it's marked `"skipped"`.
