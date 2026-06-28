# MCP Tools Reference

The MCP orchestrator exposes 8 tools that OpenCode (and any MCP-compatible client) can invoke. Each tool follows the MCP tool schema with typed inputs and structured responses.

## 1. `agent/run`

Run an agent or a multi-step DAG.

**Input Schema:**

```json
{
  "agent": "string",       // Agent name (required)
  "input": {},             // Payload for the agent (optional)
  "dag": [                 // Multi-step DAG definition (optional)
    {
      "id": "string",
      "agent": "string",
      "input": "string",
      "depends_on": ["string"]
    }
  ]
}
```

**Behavior:**

- If `dag` is provided: validates the DAG (cycle detection), runs it, returns `{ dagRunId, status, nodeStatuses }`
- If `agent` only: looks up the agent, enqueues a task, returns `{ taskId, agentName, status }`

**Examples:**

```bash
# Single agent
agent/run({ "agent": "code-review", "input": { "diff": "..." } })
# → { "taskId": "abc-123", "agentName": "code-review", "status": "queued" }

# DAG
agent/run({ "agent": "flow", "dag": [{ "id": "a", "agent": "code-review" }] })
# → { "dagRunId": "dag-123", "status": "running", "nodeStatuses": { "a": "pending" } }
```

## 2. `agent/delegate`

Sub-delegate a task to another agent within a task chain.

**Input Schema:**

```json
{
  "agent": "string",          // Target agent name
  "input": {},                // Payload
  "parentTaskId": "string"    // Parent task for traceability
}
```

**Behavior:**

- Verifies the target agent exists
- Checks delegation depth (< 5 levels)
- Enqueues a child task linked to `parentTaskId`
- Returns `{ taskId, agentName, status }`

## 3. `task/status`

Check the current status of a task.

**Input Schema:**

```json
{
  "taskId": "string"
}
```

**Response:**

```json
{
  "id": "abc-123",
  "agentName": "code-review",
  "status": "completed",
  "error": null,
  "retryCount": 0,
  "createdAt": 1782579040104,
  "startedAt": 1782579040104,
  "completedAt": 1782579040105,
  "mirrorStatus": "pass",
  "output": { "report": "..." }
}
```

## 4. `task/list`

List tasks with optional filters.

**Input Schema:**

```json
{
  "status": "completed",        // Optional filter
  "dagRunId": "dag-123"         // Optional filter
}
```

**Response:**

```json
[
  { "id": "abc-123", "agentName": "code-review", "status": "completed", "createdAt": 1782579040104 },
  { "id": "def-456", "agentName": "docs-sync", "status": "completed", "createdAt": 1782579040200 }
]
```

## 5. `kb/read`

Read a file from the knowledge base.

**Input Schema:**

```json
{
  "path": "string"    // Relative path within _kb/
}
```

**Behavior:**

- Resolves the path relative to `_kb/` root
- **Path traversal is blocked** — attempts to use `../../` return an error
- Returns content as text

**Example:**

```
kb/read({ "path": "outbox/review-abc-123.md" })
# → "# Code Review Report\n\n...content..."
```

## 6. `kb/write`

Write a file to the knowledge base.

**Input Schema:**

```json
{
  "path": "string",       // Relative path within _kb/
  "content": "string"     // File content
}
```

**Behavior:**

- Creates parent directories automatically
- Path traversal is blocked
- Returns `{ path, status: "written" }`

## 7. `kb/list`

List entries in a knowledge base directory.

**Input Schema:**

```json
{
  "path": "string"    // Optional, defaults to _kb/ root
}
```

**Response:**

```
review-abc-123.md
review-def-456.md
sessions/
context/
```

Directories are suffixed with `/`.

## 8. `kb/search`

Search the knowledge base for files containing a pattern or matching a filename.

**Input Schema:**

```json
{
  "pattern": "string",     // Text to search for
  "path": "string"         // Subdirectory to search (optional)
}
```

**Behavior:**

- Recursively walks the KB subtree
- Returns paths of files where content contains the pattern string OR the filename matches
- Returns an empty array if no matches

## Tool Registration

All tools are registered in `server.ts` using the MCP SDK:

```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Array.from(this.tools.values()).map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = this.tools.get(request.params.name);
  if (!tool) throw new Error(`Unknown tool: ${request.params.name}`);
  return await tool.handler(request.params.arguments);
});
```

## Error Handling

All tools follow a consistent error convention:

```json
{
  "content": [{ "type": "text", "text": "Agent \"nonexistent\" not found" }],
  "isError": true
}
```

Common errors:
- **Agent not found**: `Agent "{name}" not found`
- **DAG cycle**: `DAG validation failed: Cycle detected in DAG at node: {id}`
- **Path traversal**: `Path traversal detected` (thrown by KB, caught as MCP error)
- **Invalid transition**: `Invalid transition: completed -> running (allowed: )` (internal)
