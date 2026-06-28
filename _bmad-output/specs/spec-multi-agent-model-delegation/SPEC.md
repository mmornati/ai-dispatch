---
id: SPEC-multi-agent-dispatch
companions:
  - ../planning-artifacts/architecture/architecture-ai-dispatch-2026-06-27/ARCHITECTURE-SPINE.md
sources:
  - ../brainstorming/brainstorm-multi-agent-model-delegation-2026-06-27/brainstorm-intent.md
  - ../brainstorming/brainstorm-multi-agent-model-delegation-2026-06-27/task-list.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Multi-Agent Model Delegation System

## Why

A developer running multi-agent workflows from their IDE or CI/CD pipeline should be able to route tasks to specialized agent configurations using different AI models per task — without building external infrastructure or leaving the editor. The MCP ecosystem (Copilot App, VS Code Agent mode, OpenCode, Copilot CLI) lacks a lightweight orchestration layer that ties agent configs to DAG workflows with quality gates. This spec addresses that gap: a local-first MCP orchestrator that dispatches to config-defined agents, executes DAGs, audits outputs via a mirror protocol, and shares state through a filesystem knowledge base.

## Capabilities

- **CAP-1 — Single agent task execution**
  - **intent:** A caller can invoke any registered agent by name with an input payload and receive a task ID for tracking.
  - **success:** Calling `agent/run` with `{ agent: "code-review", input: { ... } }` returns a task ID. Polling `task/status` with that ID eventually reports `completed` with output.

- **CAP-2 — Multi-step DAG workflow**
  - **intent:** A caller can define a DAG of dependent task steps; the orchestrator executes them in topological order with fan-out for parallel branches.
  - **success:** Calling `agent/run` with a `dag` array of 3+ steps with `depends_on` produces the correct execution order (verified by timestamps or output chain). Cycle detection rejects invalid DAGs with an error.

- **CAP-3 — Sub-delegation**
  - **intent:** An executing agent can delegate a sub-task to another registered agent via the `agent/delegate` tool; the orchestrator validates the target and enqueues the sub-task.
  - **success:** An agent running a task calls `agent/delegate` with `{ agent: "docs-sync", input: {...} }`. The orchestrator creates a new task linked to the parent. Results flow back through the parent task's completion.

- **CAP-4 — Mirror audit**
  - **intent:** An agent config can designate a mirror agent that validates the primary agent's output before it reaches downstream consumers.
  - **success:** Running an agent with `mirror: code-review-auditor` results in the mirror receiving `{ type: "audit", primaryAgent, primaryInput, primaryOutput }` and returning `pass` / `fail` / `needs-revision`. On `needs-revision`, the primary retries with mirror feedback. On `fail`, the task is marked failed.

- **CAP-5 — Shared knowledge base**
  - **intent:** Agents read input and write output to a filesystem knowledge base at `_kb/`, enabling crash recovery, audit trails, and decoupled communication.
  - **success:** Writing a file to `_kb/outbox/report.md` via `kb/write` makes it immediately readable by any agent via `kb/read`. The `_kb/` directory survives orchestrator restart.

- **CAP-6 — Dual entry point**
  - **intent:** The same orchestration engine is accessible from IDE (MCP protocol via stdio or SSE) and from CI/CD (CLI runner triggered by GitHub events).
  - **success:** Running `agent-runner --event github:pull_request.opened` triggers the same DAG execution path as invoking `agent/run` from Copilot Agent mode.

## Constraints

- The orchestrator must live inside the IDE/Copilot/OpenCode ecosystem — no external daemon or cloud dependency for local use.
- Same engine serves MCP and CI/CD entry points — no behavioral divergence between local and automated runs.
- Agent configs are `.agent.md` files with validated YAML frontmatter — work identically in IDE and CI.
- DAG engine is config-driven: no LLM call in the planning loop. The task graph is defined statically in YAML.
- DAG executor runs all ready nodes in parallel, unbounded — no artificial concurrency limit.
- Agents communicate through the filesystem knowledge base (`_kb/`), not inline context passing.
- Mirror protocol is sequential (primary → auditor → optional retry), not parallel.
- Stack: TypeScript on Node.js LTS, MCP SDK, Zod v4, better-sqlite3 v12, js-yaml v5.
- SSE transport supports OAuth2 (Bearer token with configurable provider). Stdio transport has no auth.

## Non-goals

- Non-software-development domains (healthcare, finance, operations) — current scope is SW dev use cases only.
- LLM-assisted task decomposition — the DAG is always statically defined for MVP.
- Pull-based task queues — agents do not poll; the orchestrator pushes work.
- Metrics, structured logging, or observability dashboards.
- Multi-tenant or multi-user MCP access (OAuth2 is single-user auth only).
- Self-healing agent team formation (promoting alternatives on mirror failure).

## Success signal

A developer defines a `code-review.agent.md` with a mirror auditor, invokes it from VS Code Agent mode via `agent/run`, the orchestrator executes a 3-step DAG (review → docs → notify), the mirror validates the output, and the developer inspects the review report in `_kb/outbox/` — without leaving the editor or starting any external service. The same workflow runs unattended from a GitHub Actions PR trigger.

## Assumptions

- The MCP SDK v1.x API remains stable until the v2 SDK (targeting July 28, 2026) reaches production readiness.
- Agents will be invoked via Copilot's `github-copilot` provider model routing — the orchestrator does not call LLMs directly.
- The filesystem knowledge base provides sufficient durability for local-first use; no real-time sync or distributed storage required.

## Open Questions

- Concurrency: should the DAG executor limit parallel node execution, or run all ready nodes simultaneously? Currently unbounded.
- Authentication: when SSE transport is used beyond localhost, what auth scheme is appropriate?
- Zod v4 migration: the codebase uses ^3.24 but current is ^4.4.3 — migrate during the MCP SDK v2 window?
