# Build Plan: Multi-Agent Model Delegation System (Local First)

> Derived from brainstorming session 2026-06-27.
> Architecture: standalone MCP orchestration server, DAG-based task decomposition, markdown agent configs, shared filesystem knowledge base, recursive delegation, model pipelines, Agent Mirror Protocol.
> Priority scale: P0 = must have for MVP, P1 = important for usability, P2 = polish / future.

---

## Phase 1 — Foundation: Orchestration MCP Server & Agent Configs

### T1.1 — Scaffold orchestration MCP server project (P0)
- **What:** Standalone Node.js/TypeScript MCP server (`@modelcontextprotocol/sdk`) with zero dependency on OpenCode. Exposes `agent/run`, `agent/status`, `task/list` tools.
- **Dependencies:** None
- **Files:** `packages/mcp-orchestrator/package.json`, `src/index.ts`, `src/server.ts`, `tsconfig.json`

### T1.2 — Define Agent Config schema and validation (P0)
- **What:** Zod schema + TypeScript types for markdown-frontmatter agent configs. Fields: `name`, `model` (id, provider, params), `tools` (allowed tool list), `permissions` (filesystem scopes, network), `trigger` (optional: event/filter for CI/CD). Config-driven DAG only — no LLM call for planning.
- **Dependencies:** T1.1
- **Files:** `packages/mcp-orchestrator/src/schemas/agent-config.ts`, `src/schemas/task.ts`

### T1.3 — Write first agent configs (markdown) (P0)
- **What:** Hand-authored `.agent.md` files for initial SW dev use cases: `code-review.agent.md`, `docs-sync.agent.md`, `onboarding.agent.md`, `incident-response.agent.md`. Each defines model, tools, permissions.
- **Dependencies:** T1.2
- **Files:** `agents/code-review.agent.md`, `agents/docs-sync.agent.md`, `agents/onboarding.agent.md`, `agents/incident-response.agent.md`

### T1.4 — Agent config loader (P0)
- **What:** Load agent configs from `agents/` directory, parse YAML frontmatter, validate against Zod schema, cache in memory. Support glob patterns for agent discovery.
- **Dependencies:** T1.2
- **Files:** `packages/mcp-orchestrator/src/loader/agent-loader.ts`, `src/loader/config-cache.ts`

### T1.5 — Register MCP tools: `agent/run`, `task/status`, `task/list` (P0)
- **What:** Expose three MCP tools. `agent/run` accepts agent name + input payload, returns task ID. `task/status` polls DAG progress. `task/list` shows queued/running/completed tasks.
- **Dependencies:** T1.1, T1.4
- **Files:** `packages/mcp-orchestrator/src/tools/run-agent.ts`, `src/tools/task-status.ts`, `src/tools/task-list.ts`

### T1.6 — MCP transport: stdio + SSE (P0)
- **What:** Support both stdio (for OpenCode, VS Code) and SSE (for Copilot App, remote MCP hosts). Configurable via env/CLI args.
- **Dependencies:** T1.5
- **Files:** `packages/mcp-orchestrator/src/transport.ts` (config changes), `src/index.ts` (CLI args)

---

## Phase 2 — DAG Engine & Task Lifecycle

### T2.1 — DAG task graph data structure (P0)
- **What:** Implement a DAG with nodes (task steps) and edges (dependencies). Support topological sort for execution order. Config-driven only — no LLM planning call. DAG can be defined in agent config under `dag:` field (list of steps, each with `agent`, `input`, `depends_on`).
- **Dependencies:** T1.2
- **Files:** `packages/mcp-orchestrator/src/dag/graph.ts`, `src/dag/scheduler.ts`, `src/dag/types.ts`

### T2.2 — DAG executor (P0)
- **What:** Execute DAG nodes in topological order. Each node calls its assigned agent. Fan-out for parallel branches. Collect outputs. Fail-fast or continue-on-error (configurable per DAG).
- **Dependencies:** T2.1, T1.5
- **Files:** `packages/mcp-orchestrator/src/dag/executor.ts`, `src/dag/runner.ts`

### T2.3 — Task queue with persistence (P0)
- **What:** In-memory + optional SQLite-backed queue for pending tasks. Task lifecycle states: `queued -> running -> completed | failed`. Includes timeout and retry logic.
- **Dependencies:** T2.2
- **Files:** `packages/mcp-orchestrator/src/queue/task-queue.ts`, `src/queue/persistence.ts`

### T2.4 — Task Analyzer step (config-driven decomposition) (P1)
- **What:** When a DAG is not fully specified, provide a `TaskAnalyzer` step that reads a high-level goal and decomposes it into sub-tasks by matching against known agent capabilities (keyword/tag matching, no LLM). Falls back to a single "generic" agent.
- **Dependencies:** T2.1, T1.4
- **Files:** `packages/mcp-orchestrator/src/analyzer/decomposer.ts`, `src/analyzer/matcher.ts`

---

## Phase 3 — Shared Knowledge Base (Filesystem Artifacts)

### T3.1 — Knowledge base directory layout & conventions (P0)
- **What:** Define directory structure under `_kb/` for shared artifacts: `_kb/inbox/` (input), `_kb/outbox/` (output), `_kb/context/` (persistent shared state), `_kb/sessions/{task-id}/` (per-task scratch). Agents write outputs as markdown/JSON files, subsequent agents read from same paths.
- **Dependencies:** None
- **Files:** `packages/mcp-orchestrator/src/kb/layout.ts`, `src/kb/paths.ts`

### T3.2 — Knowledge base read/write MCP tools (P0)
- **What:** Tools `kb/read`, `kb/write`, `kb/list`, `kb/search` (grep over kb dir). Agents use these tools instead of passing large context inline. Eliminates redundant context passing.
- **Dependencies:** T3.1
- **Files:** `packages/mcp-orchestrator/src/tools/kb-read.ts`, `src/tools/kb-write.ts`, `src/tools/kb-list.ts`, `src/tools/kb-search.ts`

### T3.3 — Auto-attach relevant KB context to agent invocations (P1)
- **What:** Before invoking an agent, scan `_kb/context/` for files matching the agent's input tags. Attach matching context as system prompt supplements.
- **Dependencies:** T3.2
- **Files:** `packages/mcp-orchestrator/src/kb/context-attacher.ts`

---

## Phase 4 — Recursive Delegation & Model Pipelines

### T4.1 — Sub-delegation protocol for agents (P0)
- **What:** Any agent can emit a `delegate` action during execution (via tool `agent/delegate`). Orchestrator validates the target agent exists, creates a sub-DAG, and merges results back. Prevents infinite loops with max-depth guard.
- **Dependencies:** T2.2
- **Files:** `packages/mcp-orchestrator/src/delegation/sub-delegator.ts`, `src/tools/delegate-tool.ts`

### T4.2 — Model pipeline per agent (P1)
- **What:** An agent can define `modelPipeline` in its config: a chain of model steps for internal sub-tasks (e.g., cheap model for scaffolding -> Sonnet for logic -> cheap model for docs). Each step has its own model id and instructions. Orchestrator runs pipeline steps sequentially within a single agent invocation.
- **Dependencies:** T1.2, T1.4
- **Files:** `packages/mcp-orchestrator/src/pipeline/pipeline-runner.ts`, `src/schemas/pipeline.ts`

### T4.3 — Reverse hierarchy: pull-based task queue for agents (P2)
- **What:** Agents poll for available tasks instead of orchestrator pushing. Use filesystem watch + lock files. Enables agents to be long-lived daemons.
- **Dependencies:** T2.3, T3.1
- **Files:** `packages/mcp-orchestrator/src/queue/pull-queue.ts`, `src/queue/lock-manager.ts`

---

## Phase 5 — Agent Mirror Protocol (Quality Gates)

### T5.1 — Mirror agent: "auditor" mode (P0)
- **What:** For any agent invocation, optionally designate a "mirror" agent (defined in `mirror:` field of agent config). Mirror agent receives the same input + the primary agent's output, and validates it. Auditor reports `pass`/`fail`/`needs-revision`.
- **Dependencies:** T1.5, T4.1
- **Files:** `packages/mcp-orchestrator/src/mirror/mirror-executor.ts`, `src/mirror/validation.ts`

### T5.2 — Auto-retry on mirror failure (P0)
- **What:** If mirror agent returns `needs-revision`, orchestrator feeds failure report back to primary agent for revision. Configurable max retries (default 2). Circuit breaks if all retries exhausted.
- **Dependencies:** T5.1
- **Files:** `packages/mcp-orchestrator/src/mirror/retry-handler.ts`

### T5.3 — Self-healing team formation (P2)
- **What:** If primary agent consistently fails mirror validation, orchestrator can promote a different agent that matches the task's capability requirements. Learned preference stored in `_kb/context/team-preferences.md`.
- **Dependencies:** T5.2
- **Files:** `packages/mcp-orchestrator/src/healing/team-orchestrator.ts`, `src/kb/preferences.ts`

---

## Phase 6 — CI/CD Event Entry Point

### T6.1 — Event trigger agent runner (P1)
- **What:** CLI entry point that reads an event type (e.g., `github:pull_request.opened`), matches against `trigger:` field in agent configs, and launches the DAG. Designed to be called from GitHub Actions, GitLab CI, etc. Supports JSON/CLI arg input.
- **Dependencies:** T1.4, T2.2
- **Files:** `packages/mcp-orchestrator/src/ci/trigger-runner.ts`, `src/ci/event-matcher.ts`, `src/bin/agent-runner.ts`

### T6.2 — GitHub Actions integration example (P1)
- **What:** Example reusable GitHub Action workflow that installs the orchestrator, configures agents, and triggers on PR events, issue comments, pushes.
- **Dependencies:** T6.1
- **Files:** `.github/actions/agent-delegation/action.yml`, `.github/workflows/agent-review.yml`

### T6.3 — CI output artifacts to KB (P1)
- **What:** CI run outputs (logs, diffs, reports) are written to `_kb/sessions/{run-id}/` for traceability. MCP host can inspect CI artifacts via `kb/read`.
- **Dependencies:** T6.1, T3.1
- **Files:** `packages/mcp-orchestrator/src/ci/artifact-writer.ts`

---

## Phase 7 — Dogfooding & Stabilization

### T7.1 — Self-referential agent config: use system to build system (P1)
- **What:** Author an agent config `system-builder.agent.md` that uses the orchestrator itself to implement new agent configs. This is the dogfooding loop.
- **Dependencies:** All above
- **Files:** `agents/system-builder.agent.md`

### T7.2 — Integration test suite (P1)
- **What:** Test the full flow: start orchestrator, define a DAG, run code-review agent, check KB artifacts, verify mirror validation. Use Vitest + MCP client test utilities.
- **Dependencies:** T2.2, T3.1, T5.1
- **Files:** `packages/mcp-orchestrator/tests/integration/full-flow.test.ts`, `tests/integration/dag-execution.test.ts`, `tests/integration/mirror.test.ts`

### T7.3 — Error handling & observability (P2)
- **What:** Structured logging (pino), task error classification (transient vs permanent), dead-letter queue for failed tasks, metrics for task duration / retry count / mirror pass rate.
- **Dependencies:** T2.3, T5.2
- **Files:** `packages/mcp-orchestrator/src/observability/logger.ts`, `src/observability/metrics.ts`, `src/queue/dead-letter.ts`

### T7.4 — Documentation & README (P2)
- **What:** Architecture overview, quickstart (5 min setup), agent config authoring guide, CI/CD integration guide, example use cases.
- **Dependencies:** All above
- **Files:** `README.md`, `docs/architecture.md`, `docs/agent-config.md`, `docs/ci-setup.md`, `docs/use-cases.md`

---

## Execution Order

1. Phase 1 (T1.1–T1.6) — must complete first, this is the spine
2. Phase 2 (T2.1–T2.3) — must complete after Phase 1; T2.4 is P1, can start after T2.1
3. Phase 3 (T3.1–T3.2) — independent of Phase 2, can run in parallel; T3.3 is P1
4. Phase 4 (T4.1) — depends on Phase 2; T4.2–T4.3 are P1/P2
5. Phase 5 (T5.1–T5.2) — depends on Phase 2 + Phase 4
6. Phase 6 (T6.1–T6.3) — depends on Phase 1 + Phase 2
7. Phase 7 (T7.1–T7.4) — once everything else is stable

**Initial P0 scope:** T1.1, T1.2, T1.3, T1.4, T1.5, T1.6, T2.1, T2.2, T2.3, T3.1, T3.2, T4.1, T5.1, T5.2 (14 tasks)
