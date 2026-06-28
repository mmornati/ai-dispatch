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

Each agent writes to `outbox/` with a consistent pattern:

| Agent | Output Pattern |
|-------|---------------|
| `code-review` | `review-{task-id}.md` |
| `onboarding` | `onboarding-{name}.md` |
| `incident-response` | `incident-{task-id}.md` |
| `meeting-prep` | `meeting-prep-{type}-{date}.md` |
| `docs-sync` | `docs-update-{task-id}.md` |
| `system-builder` | `system-builder-{task-id}.md` |

### Sample Output: Code Review Report

```markdown
# Code Review Report

## Summary
Analyzed diff and found 1 critical issue.

## Critical Issues
1. **Remote Code Execution via execSync** — severity: **critical**
   - **File:** src/auth.ts, line 19
   - **Issue:** `execSync('rm -rf /')` executes arbitrary system commands.
   - **Risk:** Full filesystem compromise.
   - **Fix:** Remove `execSync` and use safe filesystem APIs.

---

*Reviewed by code-review agent (task: abc-123)*
```

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
  ├─> Produces result (code review report)
  │
  ├─> kb.write("outbox/review-{id}.md", report)
  │     └─> Filesystem: _kb/outbox/review-abc-123.md
  │
  └─> Returns result to task queue
  │
  ▼
OpenCode reads via kb/read("outbox/review-abc-123.md")
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
