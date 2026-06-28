# Adversarial Architecture Review

**Spine:** ARCHITECTURE-SPINE.md (262 lines, 8 ADs adopted)
**Method:** Two-implementation incompatibility test — for each finding, construct two units that obey every AD to the letter yet clash on shared-data shape, ownership, or state-mutation path.
**Verdict: FIGURE-IT-OUT — 4 structural holes found, all closable with tightened AD wording**

---

## Finding 1 (CRITICAL) — Output-forwarding mechanism is unshaped

**Hole location:** AD-5, lines 88–96

**The gap:** AD-5 mandates orchestrator output-forwarding ("Downstream agents in a DAG reference upstream outputs via the orchestrator's output-forwarding") but specifies zero mechanism for *how* the orchestrator makes upstream output available to a downstream node.

**Implementation A — Physical copy:**
- Orchestrator copies the upstream output file verbatim into `_kb/inbox/<downstream-task-id>/`.
- Downstream agent expects `_kb/inbox/` to contain its complete input — all data is pre-staged on disk.
- Agent pseudo-code: `const input = fs.readFileSync('_kb/inbox/input.json')`.

**Implementation B — Reference passing:**
- Orchestrator embeds upstream output file paths in the downstream task payload (e.g., `task.payload.inputRefs = ["_kb/outbox/upstream-abc123.json"]`).
- Downstream agent calls `kb/read` to load each referenced artifact.
- Agent pseudo-code: `const refs = task.inputRefs; const data = await kb.read(refs[0])`.

**Why both obey every AD:**
- AD-5: Both implement "orchestrator's output-forwarding." Neither reads another agent's outbox directly. Both use `_kb/`.
- AD-4: Neither uses an LLM for the forwarding decision.
- AD-1: The orchestrator remains the sole authority on routing.
- AD-3, AD-6, AD-7, AD-8: Unaffected.

**The clash:** An agent written for A crashes on B (empty inbox; `file not found`). An agent written for B hangs on A (waits for `inputRefs` that never arrive). The orchestrator and every agent must agree on a concrete protocol AD-5 does not define.

**Fix:** Add to AD-5 a concrete *data-flow rule* — e.g. "The orchestrator copies each upstream node's output artifact into a timestamped subdirectory of `_kb/sessions/<dagRunId>/` and sets `task.inputSources` to the array of paths. Every agent reads its inputs via `kb/read` on the paths in `task.inputSources`."

---

## Finding 2 (CRITICAL) — `delegate` action has no concrete protocol

**Hole location:** AD-1, lines 52–56; tool table line 229

**The gap:** AD-1 says agents "emit a `delegate` action which the orchestrator validates and routes" but does not specify the *emission mechanism*. The tool table lists `agent/delegate` as a tool, but AD-1 does not mandate it as the only mechanism.

**Implementation A — Tool-based delegation:**
- Agent calls the `agent/delegate` MCP tool with `{targetAgent, payload}`.
- The tool handler in `delegate-tool.ts` calls `SubDelegator.enqueue(targetAgent, payload)`.
- Agent code: `await mcpClient.callTool('agent/delegate', { targetAgent: 'code-review', payload })`.

**Implementation B — KB-file delegation:**
- Agent writes a delegation request to `_kb/delegations/<agentName>/<taskId>.json`.
- A background watcher in the orchestrator (`SubDelegator.poll()`) discovers the file and enqueues the task.
- Agent code: `await kb.write('_kb/delegations/code-review/task-xyz.json', requestBody)`.

**Why both obey every AD:**
- AD-1: Both emit a `delegate` action; the orchestrator validates and routes it. Agents never call each other directly.
- AD-5: Both use the KB (in B's case, the KB is the transport for the delegation request).
- AD-3, AD-4, AD-6, AD-7, AD-8: Unaffected.
- The tool table lists `agent/delegate` but AD-1 doesn't say "all delegation MUST go through this tool."

**The clash:** If the orchestrator implements only tool-based handling (A) but an agent implements file-based emission (B), the delegation disappears into a silent filesystem write — orchestrator never sees it. If the orchestrator implements both but agents use different mechanisms, the protocol is fragmented.

**Fix:** Tighten AD-1: "Agents emit a `delegate` action exclusively by calling the `agent/delegate` MCP tool. The orchestrator SHALL NOT discover delegation requests via filesystem polling or any other out-of-band mechanism." (This also eliminates the undesirable KB-as-control-plane pattern.)

---

## Finding 3 (HIGH) — Mirror input/output schema is unspecified

**Hole location:** AD-6, lines 98–104

**The gap:** AD-6 says "the mirror receives the primary's input and output" and "returns `pass` / `fail` / `needs-revision`" but defines neither the *input envelope schema* nor the *return value structure*.

**Implementation A — Flat envelope, string status:**
- Mirror receives: `{ primaryInput: object, primaryOutput: object }`.
- Mirror returns: `"pass" | "fail" | "needs-revision"` (plain string).
- On retry, orchestrator calls mirror again with `{ primaryInput, primaryOutput }` only — no feedback included.
- Mirror executor expects a `string` response, no structured feedback.

**Implementation B — Enriched envelope, object status with feedback:**
- Mirror receives: `{ primaryInput: object, primaryOutput: object, previousFeedback: string | null }`.
- Mirror returns: `{ verdict: "pass" | "fail" | "needs-revision", issues: string[], suggestions: string }`.
- Orchestrator includes prior mirror feedback in the retry call so the mirror can say "same issue as last time."
- Mirror executor destructures `{ verdict, issues, suggestions }`.

**Why both obey every AD:**
- AD-6: Both run the mirror after the primary completes. Both are synchronous and sequential. Both support retry with `maxRetries`.
- AD-5: Both receive data; direction of data flow unchanged.
- AD-1, AD-3, AD-4, AD-7, AD-8: Unaffected.

**The clash:** Mirror A crashes on B's return object (`["pass","fail","needs-revision"]` vs `{"verdict":"pass",...}`). Mirror B crashes on A's retry (expects `previousFeedback` field that never comes). The `MirrorExecutor` and every `*-auditor.agent.md` must share a schema AD-6 does not provide.

**Fix:** Add to AD-6: "The mirror receives a JSON object with shape `{ primaryInput: unknown, primaryOutput: unknown, previousFeedback: { verdict, issues, suggestions } | null }`. The mirror returns a JSON object with shape `{ verdict: "pass" | "fail" | "needs-revision", issues: string[], suggestions: string }`. The `previousFeedback` field on retry contains the prior mirror invocation's return value."

---

## Finding 4 (HIGH) — Agent frontmatter schema is ambiguously typed

**Hole location:** AD-3, lines 67–72

**The gap:** AD-3 lists frontmatter fields (`name, model, tools, permissions, mirror, trigger, dag, maxRetries`) but does not define the *structure* of the compound fields (`tools`, `mirror`, `trigger`, `dag`). The consistency conventions table gives naming patterns but no value-level schemas.

**Implementation A — `mirror` as agent name string:**
```yaml
mirror: code-review-auditor
maxRetries: 2
tools:
  - kb/read
  - kb/write
```
- `AgentLoader` expects `mirror` to be a `string` (agent filename stem).
- `MirrorExecutor` looks up the mirror agent by this string.
- `tools` is `string[]` — tool names.

**Implementation B — `mirror` as structured object:**
```yaml
mirror:
  agent: code-review-auditor
  conditions: { minConfidence: 0.8, checkCategories: ["security", "style"] }
  outputOnPass: true
maxRetries: 2
tools:
  read: { scope: "inbox|outbox|sessions" }
  write: { maxSize: 100000 }
```
- `AgentLoader` expects `mirror` to be an `object` with `agent` and `conditions`.
- `MirrorExecutor` passes conditions to the mirror agent for contextual evaluation.
- `tools` is `Record<string, ToolConfig>` — tool name to config map.

**Why both obey every AD:**
- AD-3: Both define a single `.agent.md` file with YAML frontmatter. Both carry the listed fields. Both are file-system scanned.
- AD-6: Both reference a mirror agent and use sequential execution.
- AD-4: Both support `dag:` in the frontmatter (not affected by mirror/tools shape).
- AD-1, AD-2, AD-5, AD-7, AD-8: Unaffected.

**The clash:** The `AgentLoader` and `MirrorExecutor` from implementation A cannot consume the config written for B — `mirror` parsing throws on an object, `tools` parsing throws on a record. Agent configs written for one system are invalid in the other. The entire agent roster is incompatible.

**Fix:** Add the Zod schema for `AgentConfig` directly into AD-3 (or reference `schemas/agent-config.ts` as the authoritative spec). At minimum define: `mirror: string` (agent name, resolved by AgentLoader), `tools: string[]` (MCP tool names), `trigger: { event: string, filter?: object } | null`, `dag: object` (referenced from AD-4 shape). Until the schema is part of the spine, two teams will produce incompatible `.agent.md` files.

---

## Summary of recommended AD changes

| Finding | AD affected | Change needed |
|---------|------------|---------------|
| 1 | AD-5 | Add concrete output-forwarding data-flow rule (path convention + `task.inputSources`) |
| 2 | AD-1 | Mandate `agent/delegate` MCP tool as the *only* delegation mechanism |
| 3 | AD-6 | Specify mirror input/output Zod schema inline or by reference |
| 4 | AD-3 | Embed or reference the canonical Zod `AgentConfig` schema |

---

## Edge case: DAG YAML schema (AD-4 + AD-5 intersection)

This is a fifth candidate raised to HIGH if the DAG is the primary authoring surface. The spine says "inline to `agent/run` or in the agent config's `dag:` field" but never defines the YAML schema for output-wiring between nodes. If two teams build DAG authors expecting different `depends_on` / `inputs` / `outputs` keys, the entire workflow engine fragments. However, this is partially addressed by fixing Finding 1 — once the output-forwarding mechanism is concrete, the DAG YAML becomes a passing-reference-to-that-mechanism and the schema choice is less fundamental. Recommend tightening AD-4 *after* AD-5 is fixed, in that order.
