# Brainstorm Intent: Multi-Agent Model Delegation System

## 1. Project & Goal

**Multi-Agent Model Delegation System** — An open, cross-platform orchestration system where a cheap model delegates BMAD tasks to specialized sub-agents with different models and tools.

## 2. Chosen Direction

Build from the local entry point first: **OpenCode agents + MCP server for the Copilot app**. Same orchestration engine powers both local (in-IDE) and CI/CD headless runners. Two-phase chain: Task Analyzer (decompose) → Router (fan-out) → Sub-agents (execute) → Consolidator (merge). Support recursive delegation.

## 3. Key Architectural Decisions

- **Purely config-driven DAG** — no LLM call for planning; agents configured in `.md` files with triggers, tools, and model chains.
- **Agent Mirror Protocol** — agents expose a mirror interface so peers and orchestrators can inspect capabilities, status, and invoke them uniformly.
- **Inversion of Control Flow** — agents pull tasks from a shared queue; there is no central scheduler. CI/CD triggers an agent directly, and agents sub-delegate autonomously.
- **Shared knowledge base** (filesystem artifacts) instead of redundant context-passing between agents.
- **Model pipeline per agent** — chains of models optimized per sub-task (cheap for scaffolding, capable for logic, cheap for docs).
- **Recursive delegation** — each agent can autonomously sub-delegate parts of its task.

## 4. Constraints

- Orchestration must live inside the IDE/Copilot/OpenCode ecosystem, not external infrastructure.
- DAG approach must support fully autonomous event-triggered CI/CD operation.
- Agent configs (`.md` files) must work identically in IDE and headless CI runners.
- Initial focus: SW development use cases only (code review, docs sync, meeting prep, onboarding, incident response). Other domains deferred.

## 5. User Directions

- Keep orchestration in the IDE/Copilot ecosystem, not external infra.
- DAG must work in CI/CD for autonomous event-triggered agents.
- Support recursive delegation — agents sub-delegate autonomously.
- Shared knowledge base (filesystem) over context-passing.
- Start with SW development use cases; defer other domains.

## 6. Next Steps (Priority Order)

1. **Spec** — Distill into a SPEC kernel with companions for precise machine-contract.
2. **Architecture** — Produce architecture spine: config schema, Agent Mirror Protocol, DAG runner, MCP server, CI/CD bridge.
3. **PRD** — Write product requirements scoped to SW development domain.
4. **Epics & Stories** — Break into buildable epics (Agent Mirror, DAG engine, MCP server, CI bridge, shared KB).
5. **Prototype** — End-to-end thin slice: one agent config, local MCP trigger, single DAG step, filesystem artifact output.
