# What Is AI Dispatch?

**AI Dispatch** is an MCP-based orchestration system for OpenCode that routes tasks to specialized AI agents. Instead of relying on a single monolithic agent, it dispatches work to purpose-built agents — each with its own model, system prompt, and tool permissions.

The system is built on the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) and integrates natively with OpenCode through its MCP server interface.

## Key Concepts

- **Agents** — Specialized workers defined by markdown configuration files (`agents/*.agent.md`). Each agent has a designated model, temperature, tool permissions, and optional mirror auditor.
- **Tasks** — Atomic units of work. A task tracks its state through a strict lifecycle: `queued → running → completed/failed`.
- **DAGs** — Directed Acyclic Graphs of tasks with explicit dependency ordering, parallel fan-out, and cycle-safe validation.
- **Mirror Protocol** — A quality gate that automatically audits every agent output and supports retry-on-revision cycles.
- **Knowledge Base** — A shared filesystem under `_kb/` with inbox, outbox, context, and session directories. All agent inputs and outputs flow through the KB.

## Project Structure

```
ai-dispatch/
├── agents/                        # Agent definitions (.agent.md)
│   ├── code-review.agent.md
│   ├── code-review-auditor.agent.md
│   ├── docs-sync.agent.md
│   ├── incident-response.agent.md
│   ├── meeting-prep.agent.md
│   ├── onboarding.agent.md
│   └── system-builder.agent.md
├── packages/
│   └── mcp-orchestrator/          # MCP server package
│       ├── src/                   # TypeScript source
│       │   ├── server.ts          # MCP server + task handler
│       │   ├── tools/             # 8 MCP tool definitions
│       │   ├── queue/             # Task queue + persistence
│       │   ├── dag/               # DAG executor + scheduler
│       │   ├── mirror/            # Mirror executor + retry handler
│       │   ├── loader/            # Agent config loader
│       │   ├── kb/                # Knowledge base filesystem
│       │   ├── delegation/        # Agent sub-delegation
│       │   ├── auth/              # JWT/OAuth2 auth (SSE)
│       │   └── ci/                # Event-triggered runner
│       └── dist/                  # Compiled JavaScript
├── _kb/                           # Knowledge base (runtime)
│   ├── inbox/
│   ├── outbox/
│   ├── context/
│   └── sessions/
├── .opencode/
│   ├── prompts/
│   │   └── orchestrator.txt       # System prompt for the orchestrator
│   └── skills/
│       └── orchestrate.md         # Orchestrator skill definition
├── opencode.json                  # OpenCode configuration
└── docs/                          # This documentation site
```

## Use Cases

| Scenario | Agent | Example Input |
|----------|-------|--------------|
| Code review | `code-review` | A git diff with suspicious code changes |
| Security audit | `code-review-auditor` | Review report to validate findings |
| Documentation sync | `docs-sync` | API changes that need doc updates |
| Incident response | `incident-response` | Production error logs |
| Meeting prep | `meeting-prep` | Agenda and participant list |
| Onboarding | `onboarding` | New hire name and experience level |
| Agent creation | `system-builder` | Description of a new agent needed |

## How It Fits Together

```
OpenCode CLI/IDE
  └─> MCP Protocol (stdio)
       └─> MCP Orchestrator Server
            ├─> AgentLoader   ──  agents/*.agent.md
            ├─> TaskQueue     ──  in-memory queue + persistence
            ├─> DAGRunner     ──  multi-step orchestration
            ├─> MirrorExecutor ── quality gate
            └─> KnowledgeBase ──  _kb/ filesystem
```
