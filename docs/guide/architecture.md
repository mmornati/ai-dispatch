# Architecture Overview

The AI Model Delegation system is an **MCP server** that provides task orchestration, agent routing, and knowledge management services to OpenCode. It is written in TypeScript (Node 24, ESM) and uses `@modelcontextprotocol/sdk` to expose its capabilities.

## Transport Layer

The server supports two transport modes:

| Transport | Flag | Use Case |
|-----------|------|----------|
| **stdio** | `--transport stdio` (default) | OpenCode integration — the server runs as a child process |
| **SSE** | `--transport sse --port 3100` | Remote access via HTTP with optional OAuth2 auth |

## Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  MCPOrchestratorServer                    │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │ AgentLoader  │  │  TaskQueue   │  │ KnowledgeBase │   │
│  │ (agents/*    │  │  (in-memory  │  │ (_kb/         │   │
│  │  .agent.md)  │  │   + persist) │  │  filesystem)  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘   │
│         │                 │                  │            │
│         ▼                 ▼                  ▼            │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │
│  │  DAGRunner  │  │ MirrorExec   │  │  SubDelegator │   │
│  │ (dag/*)     │  │ (mirror/*)   │  │ (delegation/) │   │
│  └─────────────┘  └──────────────┘  └───────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              8 MCP Tools (tools/*)               │    │
│  │  agent/run  agent/delegate  task/status          │    │
│  │  task/list  kb/read  kb/write  kb/list  kb/search│    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │  Auth (optional, SSE only)                    │       │
│  │  Authenticator (JWT/OAuth2)                   │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Data Flow: Prompt → Result

```
User prompt
  │
  ▼
OpenCode orchestrator agent (guided by prompts/orchestrator.txt)
  │  Identifies domain (code review, docs, etc.)
  │  Chooses mode (single agent / DAG / delegation)
  │
  ▼
Calls MCP tool: agent/run({ agent, input, dag? })
  │
  ▼
MCPOrchestratorServer (CallToolRequestSchema handler)
  │
  ├─> Single agent path:
  │     ├─> AgentLoader.getAgent(name)  → config from .agent.md
  │     ├─> TaskQueue.enqueue()          → Task{ status: "queued" }
  │     ├─> processNext()                → runTask()
  │     │     ├─> updateStatus("running")
  │     │     ├─> handleTask()           → agent logic
  │     │     │     ├─> kb.write(outbox) → output artifact
  │     │     │     └─> Mirror inline    → audit (if configured)
  │     │     └─> updateStatus("completed")
  │     └─> Return { taskId, status }
  │
  └─> DAG path:
        ├─> DAGRunner.validateDAG()      → cycle check
        ├─> DAGRunner.runDAG()
        │     ├─> buildDAG()             → DAGDefinition
        │     ├─> DAGExecutor.execute()
        │     │     ├─> tick() loop
        │     │     │     ├─> getReadyNodes()
        │     │     │     └─> executeNode()
        │     │     │           ├─> TaskQueue.enqueue()
        │     │     │           ├─> waitForCompletion()
        │     │     │           └─> RetryHandler.runWithMirror()
        │     │     └─> All done → set run status
        │     └─> Persist definition to _kb/sessions/
        └─> Return { dagRunId, nodeStatuses }
  │
  ▼
OpenCode polls task/status / task/list
  │
  ▼
OpenCode reads results via kb/read("outbox/...")
  │
  ▼
Consolidated result presented to user
```

## State Management

The system uses **in-memory state** by default with an optional **SQLite persistence** layer. All task state transitions go through the `TaskQueue` state machine, which enforces the valid lifecycle:

```
queued ──► running ──► completed
  │                      │
  ├──► cancelled         └──► failed ──► queued (retry)
```

DAG runs maintain their own `DAGRun` state with per-node status tracking (`pending → running → completed/failed/skipped`).

## Knowledge Base

The filesystem at `_kb/` serves as the system's shared state and communication channel:

| Directory | Purpose |
|-----------|---------|
| `inbox/` | Input payloads for agents |
| `outbox/` | Agent outputs (reviews, docs, plans) |
| `context/` | Persistent shared state |
| `sessions/` | Per-workflow scratch space (DAG definitions) |

Path traversal is strictly blocked at the filesystem layer.
