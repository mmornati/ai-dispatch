# Rubric Walker Review — Architecture Spine

**Review date:** 2026-06-27
**Spine:** Multi-Agent Model Delegation System (feature altitude)
**Paradigm:** Orchestrator-based Task Routing

---

## Checklist Findings

### 1. Fixes the real divergence points for the level below — misses none

**Verdict: Mostly covered with 2 gaps.**

The spine identifies and fixes the major divergence points:
- Peer-to-peer agent coordination vs. orchestrator-centric (AD-1)
- Local vs. CI code path bifurcation (AD-2)
- Monolithic vs. file-per-agent registration (AD-3)
- LLM-in-the-loop vs. static DAG (AD-4)
- Ad-hoc data passing vs. KB backbone (AD-5)
- Unreviewed output vs. mirror protocol (AD-6)
- Deployment topology (AD-7)
- Stack fragmentation (AD-8)

**Finding 1 (Medium) — No AD for general execution error handling.**
AD-6 governs mirror-related retries. AD-3 mentions `maxRetries` in frontmatter. But there is no architectural invariant governing what happens when an agent execution fails *non-mirror reasons* (LLM timeout, tool crash, network error, invalid response). The task state machine (`queued → running → completed | failed`) implies failure ends the task, but retry semantics (who retries, under what conditions, backoff strategy) are not codified. Two implementers could build different retry behaviors, leading to inconsistent reliability.

**Finding 2 (Medium) — No AD for DAG execution concurrency model.**
The source tree references `scheduleDAG (batches by level)` and `getReadyNodes`, suggesting level-based parallelism. But there is no invariant about whether level nodes run sequentially or concurrently, max concurrent DAG runs, or queue fairness. This is a divergence point: one implementation could be serial, another fully concurrent, affecting throughput and determinism of results.

**Finding 3 (Low) — No AD for KB path traversal security.**
The source listing mentions `path traversal protection` in `layout.ts`, but this security-critical behavior is not elevated to an architectural invariant. A contributor unaware of this could bypass it in a new KB operation or change the protection strategy.

---

### 2. Every AD's Rule is enforceable and actually prevents its stated divergence

**Verdict: 7/8 solid; 1 has an enforcement gap.**

| AD | Enforceable? | Prevents divergence? |
|---|---|---|
| AD-1 | Yes — code review can enforce no agent-to-agent imports; `delegate` tool is the only escape hatches. | Yes |
| AD-2 | Yes — single code path, shared instances. | Yes |
| AD-3 | Yes — filesystem scan vs. registry; easy to verify. | Yes |
| AD-4 | Yes — DAG executor has no LLM dependency. | Yes |
| **AD-5** | **Partial** — The sub-rule "downstream agents reference upstream outputs via the orchestrator's output-forwarding (not by reading another agent's outbox)" is hard to enforce mechanically. Nothing prevents a rogue agent from doing `kb/read` on another agent's outbox path. This is a rule that lives in convention, not in an enforceable gate. | **Risks divergence** — downstream agents could couple to outbox shapes. |
| AD-6 | Yes — synchronous, sequential, specific protocol. | Yes |
| AD-7 | Yes — `--transport` flag, switch on same server. | Yes |
| AD-8 | Yes — pinned deps, lint/CI can enforce. | Yes |

**Finding 4 (Medium) — AD-5's output-forwarding rule is unenforceable.**
The invariant "downstream agents read upstream outputs only via orchestrator output-forwarding" cannot be mechanically enforced because agents have KB read access (including `kb/read` tool). A downstream agent can bypass the orchestrator's forwarding by reading another agent's outbox directly. Either remove this sub-rule (accept agents may read any KB path) or add an access control mechanism on KB paths per agent.

---

### 3. Nothing under Deferred could let two units diverge

**Verdict: Clean.**

All 8 deferred decisions are properly bounded:
- TaskAnalyzer is bounded by AD-4 (executor stays config-driven).
- Pull-based queue, DLQ, structured logging, metrics, auth, self-healing, model pipeline are all additive — they don't change existing invariants.
- Each has a concrete "revisit when" trigger.

No finding.

---

### 4. Named tech is verified-current (or flagged as assumption)

**Verdict: Outdated — 3 of 7 versions need updating; none flagged as assumptions.**

Stack versions verified against npm registry (2026-06-27):

| Dependency | Spine version | Current latest | Status |
|---|---|---|---|
| Node.js | 22.x | 22.x (LTS) | **OK** |
| TypeScript | 5.6+ | 6.0.3 | **Outdated** — 6.x is current; pinning to 5.x constrains language features available |
| @modelcontextprotocol/sdk | ^1.17.0 | 1.29.0 | **OK** (in range) |
| zod | ^3.24.0 | 4.4.3 | **Outdated** — zod 4.x is current; 3.x is previous major |
| better-sqlite3 | ^11.0.0 | 12.11.1 | **Outdated** — v12 is current; v11 may have unpatched issues |
| js-yaml | ^4.1.0 | 5.2.0 | **Outdated** — v5 is current (ESM-only); evaluate migration cost |
| tsx | ^4.19.0 | 4.22.4 | **OK** (in range) |

**Finding 5 (Medium) — Stack versions are stale, not flagged as assumptions.**
Three of seven packages (zod, better-sqlite3, js-yaml) are one major version behind. TypeScript is two major versions behind. None are marked as assumptions / deliberate choices. This creates risk: when a new developer joins and installs dependencies, npm may pull a version incompatible with the spine's assumptions (e.g., js-yaml 5.x is ESM-only, which could break a CJS codebase). Each version should either be updated or documented as a deliberate pin with rationale.

---

### 5. Ratifies rather than contradicts a brownfield codebase

**Verdict: Not applicable — greenfield.**

`binds: []` and `sources: []` are empty. No existing codebase to ratify or contradict. The project is greenfield.

**Finding 6 (Info) — Empty `binds` and `sources` metadata.**
For a greenfield project this is acceptable, but the lack of grounding in any existing artifacts (even brainstorming outputs) means the spine is not formally connected to its originating context. The `companions` field references the brainstorming outputs but `sources` is empty — consider adding the brainstorming or spec file as a source if one drove the architecture.

---

### 6. If a spec drove it, it covers that spec's capabilities

**Verdict: Not verifiable — no spec referenced.**

The spine's `sources: []` is empty. Companion documents are brainstorming outputs. Without a spec or PRD, it's impossible to verify coverage. However, the spine does include a "Capability → Architecture Map" table that maps capabilities to modules and ADs, which shows systematic coverage of known requirements.

**Finding 7 (Low) — No formal spec reference.**
If a PRD or product brief exists, add it to `sources:`. If not, consider whether the capability map is complete — it has 10 rows, but there may be unlisted capabilities (error recovery, observability, agent permissions, testing).

---

### 7. Every dimension the altitude owns is decided, deferred, or an open question

**Verdict: Silent on 2 dimensions — finding.**

Dimensions a feature-level architecture should own:

| Dimension | Status |
|---|---|
| Task routing & execution | **Decided** (AD-1, AD-2, AD-4) |
| Agent configuration & discovery | **Decided** (AD-3) |
| Inter-agent data flow | **Decided** (AD-5) |
| Output quality assurance | **Decided** (AD-6) |
| Deployment topology | **Decided** (AD-7) |
| Stack & dependencies | **Decided** (AD-8) |
| Error handling & retry | **Partial** (AD-6 covers mirror retries; general execution errors not addressed) |
| Logging & observability | **Deferred** (items 4, 5 in deferred table) |
| AuthN/AuthZ | **Deferred** (item 6) |
| DAG concurrency model | **SILENT** — no AD, no deferred entry, no open question |
| KB security / access control | **SILENT** — no AD about agent-level KB permissions or path traversal |
| Environment configuration | **SILENT** — no AD about dev/staging/prod, environment variables, config injection |
| Packaging & distribution | **SILENT** — no AD about how the system is packaged (npm package? Docker image? npx command?) |
| Developer workflow (add agent, debug, test) | **SILENT** — no AD about development experience |

**Finding 8 (High) — Concurrency model is a silent dimension.**
The DAG executor's concurrency model (how many level-nodes run in parallel, max concurrent DAG runs, queue fairness) is completely unaddressed. This directly affects system behavior, resource use, and determinism. Add an AD or at minimum a deferred entry with rationale and revisit condition.

**Finding 9 (High) — Operational/environmental envelope is underspecified.**
Three silent dimensions at feature altitude:
- **Packaging** — How does a user install this? npm global? npx? Docker? This affects the CI/CD integration story and the SSE deployment model.
- **Environment configuration** — No AD about how the system is configured for different environments (dev, CI, production SSE server). No mention of env vars, config files, or CLI flags beyond `--transport`.
- **KB access control** — AD-5's unenforceable sub-rule (finding 4) is a symptom of this gap. If agents can read any KB path, there's no security boundary. If there's intended to be one, it needs an AD.

---

## Summary Table

| # | Severity | Finding | Checklist Item |
|---|---|---|---|
| 8 | High | Concurrency model (DAG parallelism, max runs, queue fairness) is silent — no AD, no deferred entry | 7 |
| 9 | High | Operational/environmental envelope is underspecified: packaging, environment config, KB access control all silent | 7 |
| 4 | Medium | AD-5 output-forwarding sub-rule is unenforceable — agents with `kb/read` can bypass orchestrator forwarding | 2 |
| 5 | Medium | Stack versions stale (zod ^3.24 vs v4, better-sqlite3 ^11 vs v12, js-yaml ^4.1 vs v5, TS 5.6+ vs v6); none flagged as assumptions | 4 |
| 1 | Medium | No AD for general execution error handling (non-mirror retries, backoff, failure policy) | 1 |
| 2 | Medium | No AD for DAG execution concurrency model (serial vs parallel per level) | 1 |
| 3 | Low | KB path traversal security mentioned in source comments but not elevated to an AD | 1 |
| 7 | Low | No formal spec reference in `sources:` — capability coverage not verifiable | 6 |
| 6 | Info | Empty `binds` and `sources` for a greenfield project — acceptable but leaves ungrounded | 5 |

---

## Recommendations (ordered by impact)

1. **Add AD for DAG concurrency model** — Define whether level nodes run sequentially or concurrently, max concurrent DAG runs, queue semantics. If deferred, state why and when to revisit.
2. **Add ADs for operational envelope** — At minimum: packaging strategy (npm/Docker/npx), environment configuration mechanism, and KB access control model.
3. **Update stack versions** — Migrate to zod 4.x, better-sqlite3 12.x, evaluate js-yaml 5.x (ESM implications), consider TypeScript 6.x. Rationalize any pins you keep.
4. **Fix AD-5 enforcement gap** — Either remove the output-forwarding sub-rule or implement agent-scoped KB permissions.
5. **Elevate KB path traversal to an AD** — Security invariants should not live only in source comments.
6. **Add general error handling AD** — Codify retry policy, failure categorization, backoff strategy for execution failures.
7. **Link to a spec** — If a PRD/brief exists, add it to `sources:`. If not, the capability map is a decent substitute but should be validated for completeness.
