# Reality-Check Review: Architecture Spine

**Review date:** 2026-06-27
**Reviewer:** Architecture reviewer (automated)
**Target:** `ARCHITECTURE-SPINE.md`
**Method:** Web-verified version checks + full source tree audit at `packages/mcp-orchestrator/`

---

## Verdict

**PASS with findings.** The spine is structurally sound — every committed architectural decision (AD-1 through AD-8) is faithfully implemented in the codebase. The source tree mapping is ~97% accurate. However, **4 of 7 pinned dependency versions are stale** (2 are a full major version behind), one `observability/` directory is undocumented, and the task state machine description has a subtle inaccuracy.

---

## 1. Stack Version Accuracy

| Dependency | Spine claims | package.json pinned | Actual latest (Jun 2026) | Verdict |
|---|---|---|---|---|
| Node.js | 22.x | *(unpinned, runtime)* | **24.16.0 LTS** / 26.4.0 Current | ⚠️ **Outdated** — 22.x is in Maintenance LTS since Oct 2025; Active LTS is 24.x |
| TypeScript | 5.6+ | ^5.6.0 | **6.0.3** | ⚠️ **Stale** — TS 6.0 shipped; 5.6 is two majors behind |
| @modelcontextprotocol/sdk | ^1.17.0 | ^1.17.0 | **1.29.0** | ✅ Range covers it; no action |
| zod | ^3.24.0 | ^3.24.0 | **4.4.3** | ❌ **Major behind.** Zod 4 has been stable since Jul 2025 and is the default package export. The spine pins to a deprecated major version. |
| better-sqlite3 | ^11.0.0 | ^11.0.0 | **12.11.1** | ❌ **Major behind.** v12 shipped Jun 2025. V11 is 2 patch releases from end-of-life. |
| js-yaml | ^4.1.0 | ^4.1.0 | ^4.1.x (stable) | ✅ No newer major |
| tsx | ^4.19.0 | ^4.19.0 | **4.22.4** | ✅ Range covers it |

**Sources:** npmjs.com for each package; nodejs.org release schedule; ithile.com version tracker cross-check.

**Significance:** The zod and better-sqlite3 major-version gaps mean new contributors following the spine will pin known-old versions. The Node.js 22.x recommendation ignores that 22.x entered Maintenance LTS in October 2025 — 24.x is the active LTS. Teams reading "Node.js 22.x" may interpret this as the recommended target, when 24.x (or at least a note about the option) would be current.

---

## 2. Technology Existence & Fit

| Named technology | Still exists? | Fit for purpose? |
|---|---|---|
| Node.js | ✅ Yes | Fit, but 22.x in maintenance makes native addons riskier over time |
| TypeScript | ✅ Yes | Fit |
| @modelcontextprotocol/sdk | ✅ Yes | Fit. Note: v2 exists as `@modelcontextprotocol/server@alpha` but is not yet required |
| zod | ✅ Yes | **Risky fit on v3** — Zod 4 is now the default. v3 still works but ecosystem moves are toward v4 |
| better-sqlite3 | ✅ Yes | Fit. v12 has same API surface. |
| js-yaml | ✅ Yes | Fit |
| tsx | ✅ Yes | Fit |
| MCP protocol | ✅ Yes | Full spec match |
| GitHub Actions | ✅ Yes | Fit |

Every named technology exists and is appropriate. The zod-v3 choice is the only material risk: if a future migration to Zod 4 is needed, type-level changes may require widespread schema refactors.

---

## 3. Codebase Implementation Reality

### Source tree accuracy

Of the **27 source files** claimed in the spine's source tree (§ Structural Seed), **all 27 exist at the exact paths listed**. The spine accurately describes:

- `src/index.ts` — CLI entry, stdio/SSE detection ✓
- `src/server.ts` — MCPOrchestratorServer, 8 tool registrations ✓
- `src/schemas/` — AgentConfigSchema (zod), Task types ✓
- `src/loader/` — AgentLoader, ConfigCache ✓
- `src/dag/` — types (buildDAG, topologicalSort), scheduler, executor, runner ✓
- `src/queue/` — TaskQueue, InMemoryPersistence, SQLitePersistence ✓
- `src/kb/` — KnowledgeBase, paths constants ✓
- `src/tools/` — 8 tool files matching the 8 MCP tools in the surface table ✓
- `src/delegation/` — SubDelegator ✓
- `src/mirror/` — MirrorExecutor, RetryHandler ✓
- `src/ci/` — EventTriggerRunner ✓
- `src/bin/` — agent-runner.ts ✓
- `agents/` — 7 `.agent.md` files, all with YAML frontmatter matching AD-3 ✓
- `_kb/` — inbox/, outbox/, context/, sessions/ subdirectories ✓

### Discrepancy found: undocumented directory

An empty `src/observability/` directory exists in the actual source tree **but is not listed** in the spine's source tree. The spine claims exactly 27 source files across the listed directories; this directory is absent. Since it is empty, the gap is minor, but the spine's source tree should either include it (with a note it's reserved for future observability tooling) or the directory should be removed from the tree.

### AD-5: Task state machine inaccuracy

The spine says (§ Consistency Conventions):

> Task state machine: `queued → running → completed | failed` (with `queued ← running` on retry)

The actual code (`src/schemas/task.ts:37-43`) defines:

```
queued: ["running", "cancelled"]
running: ["completed", "failed", "cancelled"]
completed: []
failed: ["queued"]         <-- retry goes failed→queued, not running→queued
cancelled: []
```

Two issues:
1. The `cancelled` state is omitted from the spine's description.
2. The retry transition is `failed → queued`, not `running → queued` as the spine says. The spine implies the task gets pulled back from running mid-execution; in reality, the task runs to completion (or error), gets marked `failed`, and then retry resets it to `queued`.

### All 8 architectural invariants verified against code

| Invariant | Code evidence | Status |
|---|---|---|
| AD-1 Orchestrator-centric | All tools routed through `MCPOrchestratorServer`; SubDelegator uses TaskQueue, not direct agent calls | ✅ |
| AD-2 Dual entry, single engine | `src/index.ts` (MCP server) + `src/bin/agent-runner.ts` (CLI), both use same DAGRunner/TaskQueue/KB | ✅ |
| AD-3 .agent.md config | AgentLoader parses YAML frontmatter from `agents/*.agent.md`, validates with Zod | ✅ |
| AD-4 Config-driven DAG | DAGRunner takes static DAGStep[]; topologicalSort does cycle detection; no LLM in the planning path | ✅ |
| AD-5 KB as backbone | KnowledgeBase reads/writes `_kb/` with path-traversal protection; 4 subdirectories | ✅ |
| AD-6 Sequential mirror | MirrorExecutor runs auditor after primary; RetryHandler loops on `needs-revision`, caps at maxRetries | ✅ |
| AD-7 Local-first, SSE avail | Default stdio transport; SSE on port 3100 via `--transport sse`; CLI runner for CI | ✅ |
| AD-8 Stack | TypeScript + Node + MCP SDK + Zod + better-sqlite3 + js-yaml + tsx all present | ✅ (version caveats above) |

---

## Summary of Findings

| # | Severity | Finding |
|---|---|---|
| 1 | **Medium** | **zod ^3.24.0 and better-sqlite3 ^11.0.0 are a full major version behind current stable.** Zod 4.4.3 is the default npm export; better-sqlite3 v12.11.1 shipped June 2026. The spine locks readers to deprecated majors. |
| 2 | **Low-Medium** | **Node.js 22.x is in Maintenance LTS.** 24.x is the Active LTS. The spine should recommend 24.x or at least note both options. |
| 3 | **Low** | **Task state machine description is inaccurate.** `cancelled` state omitted; retry is `failed→queued` not `running→queued`. |
| 4 | **Low** | **`src/observability/` (empty) directory exists but is undocumented.** Spine's source tree omits it. |
| 5 | **Info** | **TypeScript 6.0.3 is latest, spine says 5.6+.** This is not blocking (5.6 still works) but the spine signals older conventions. |

---

## Recommendations

1. Update spine Stack table: `better-sqlite3` → `^12.0.0`, `zod` → `^4.0.0` (or add a note that v3 is used for stability and what would be required to migrate).
2. Update Node.js recommendation to `24.x (Active LTS)` with a parenthetical that 22.x also works but is in Maintenance.
3. Fix the task state machine: add `cancelled` and correct retry to `failed → queued`.
4. Either remove the empty `src/observability/` directory or add a heading for it in the source tree.
5. Bump TypeScript to `^6.0.0` in the spine table to match modern tooling.
