# Knowledge Base

The Knowledge Base (KB) is a filesystem-based shared state at `<project-root>/_kb/`. All agent inputs, outputs, and session data flow through the KB.

## Directory Layout

```
_kb/
├── inbox/       # Input payloads for agents
├── outbox/      # Agent outputs (the primary persistence layer)
├── context/     # Persistent shared state, preferences
└── sessions/    # Per-workflow scratch space
    └── dag-{timestamp}/
        └── definition.json   # DAG step definitions
```

## Directory Purposes

| Directory | Purpose | Written By | Read By |
|-----------|---------|------------|---------|
| `inbox/` | Agent task inputs | MCP tools, external systems | Agent handlers |
| `outbox/` | Agent outputs (reviews, plans, docs) | Agent handlers | OpenCode, external tools |
| `context/` | Long-lived shared state | Agents | Agents |
| `sessions/` | Workflow scratch space (DAG defs) | DAGRunner | Debugging, traceability |

## Agent Output Naming Convention

Every agent writes its LLM-generated output to `outbox/{agent-name}-{task-id}.md`:

| Agent | Output Pattern |
|-------|---------------|
| `code-review` | `outbox/code-review-{task-id}.md` |
| `code-review-auditor` | `outbox/code-review-auditor-{task-id}.md` |
| `docs-sync` | `outbox/docs-sync-{task-id}.md` |
| `onboarding` | `outbox/onboarding-{task-id}.md` |
| `incident-response` | `outbox/incident-response-{task-id}.md` |
| `meeting-prep` | `outbox/meeting-prep-{task-id}.md` |
| `system-builder` | `outbox/system-builder-{task-id}.md` |

### Sample Output

The actual output comes from the LLM call, not hardcoded mock data. For example, a code review agent (`claude-sonnet-4`) might generate:

```markdown
# Code Review Report

## Summary
The diff introduces a remote code execution vulnerability via `execSync`.

## Findings
- **Critical**: `execSync("rm -rf /")` on line 19 allows arbitrary command execution.
  - **Risk**: Full filesystem compromise.
  - **Fix**: Remove the call or use `child_process.execFile` with sanitized arguments.
```

Each agent's markdown description guides the LLM's output format, so the actual content and structure vary based on the input and the model used.

## API

The `KnowledgeBase` class (`kb/layout.ts`) provides:

```typescript
class KnowledgeBase {
  constructor(projectRoot: string);

  // Ensure standard subdirectories exist
  async ensureDirs(): Promise<void>;

  // Read a file (returns null if not found)
  async read(relativePath: string): Promise<string | null>;

  // Write a file (creates parent dirs automatically)
  async write(relativePath: string, content: string): Promise<string>;

  // List directory entries (trailing / for subdirs)
  async list(relativePath?: string): Promise<string[]>;

  // Recursively search for pattern in content or filename
  async search(pattern: string, relativePath?: string): Promise<string[]>;

  // Get session path helper
  sessionPath(sessionId: string): string;

  // Get root path
  getRoot(): string;
}
```

## Security: Path Traversal Protection

All KB operations validate that resolved paths stay within the `_kb/` directory:

```typescript
async read(relativePath: string) {
  const fullPath = path.join(this.root, relativePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(this.root))) {
    throw new Error("Path traversal detected");
  }
  // ...read file
}
```

This means:
- `kb/read({ "path": "../secret.txt" })` → ❌ Rejected
- `kb/read({ "path": "outbox/review-123.md" })` → ✅ Allowed
- `kb/write({ "path": "../../etc/cronjob", "content": "..." })` → ❌ Rejected

## How the KB Is Used in a Request Flow

```
User prompt
  │
  ▼
Orchestrator calls agent/run({ agent: "code-review", input: { diff } })
  │
  ▼
handleTask processes the agent:
  │
  ├─> Reads agent config from agents/code-review.agent.md
  │
  ├─> Calls OpenRouter with agent's model (claude-sonnet-4)
  │     └─> System prompt = agent's markdown description
  │     └─> User message = diff input
  │
  ├─> kb.write("outbox/code-review-{id}.md", llmResponse)
  │     └─> Filesystem: _kb/outbox/code-review-abc-123.md
  │
  └─> Returns result to task queue
  │
  ▼
OpenCode reads via kb/read("outbox/code-review-abc-123.md")
  │
  ▼
Result presented to user
```

For DAG flows, the DAG definition is also persisted:

```
dagRunner.runDAG(steps)
  │
  └─> kb.write("sessions/{dagId}/definition.json", steps)
        └─> Filesystem: _kb/sessions/dag-1712345678/definition.json
```
