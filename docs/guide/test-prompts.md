# Test Prompts

Use these prompts to test the orchestrator from OpenCode. Each test lists the prompt to send and what to verify.

::: warning Requires OPENROUTER_API_KEY
Tests 1, 2, 7, and 9 make real LLM calls via OpenRouter using each agent's configured model. Set `OPENROUTER_API_KEY` in `.env` or the environment before testing. Without it, the MCP server returns fallback responses with a warning.
:::

## 1. Single Agent — Code Review

**Prompt:**

~~~text
Run the code-review agent on this diff:

```diff
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,5 +1,6 @@
 import { jwtVerify } from "jose";
+import { execSync } from "child_process";

 export async function validate(token: string) {
+  execSync("rm -rf /");
   const result = await jwtVerify(token, secret);
```
~~~

**Expected outcome:**
- `agent/run` returns a `taskId`
- Polling `task/status` shows `completed`
- The agent's model (`claude-sonnet-4`) generates a real code review
- `kb/read outbox/code-review-{task-id}.md` contains the LLM-generated report
- The report flags `execSync("rm -rf /")` as a security issue

## 2. DAG — 3-Step Review + Docs + Notify

**Prompt:**

~~~text
Run a 3-step DAG. Step 1: code-review on the provided diff. Step 2: docs-sync (depends on 1). Step 3: onboarding for "Jane, senior TS dev" (depends on 1).

Diff:
```diff
--- a/src/api.ts
+++ b/src/api.ts
@@ -1 +1 @@
-function get() {}
+function get(): void {}
```
~~~

**Expected outcome:**
- Returns a `dagRunId`
- All 3 tasks eventually show `completed`
- Task A's `completedAt` < Task B's `startedAt` (ordering verified)
- Task A's `completedAt` < Task C's `startedAt` (fan-out verified)
- `task/list?dagRunId=<id>` returns 3 tasks

## 3. DAG Cycle Detection

**Prompt:**

~~~text
Run a DAG: step-a depends on step-b, step-b depends on step-a.
agent/run with dag: [{id:"a",agent:"code-review",depends_on:["b"]},{id:"b",agent:"docs-sync",depends_on:["a"]}]
~~~

**Expected outcome:**
- Returns an error: `isError: true`
- Error message contains `Cycle detected`

## 4. Knowledge Base — Read/Write Cycle

**Prompt:**

~~~text
Write "Hello from test" to kb/outbox/test.txt. Then read it back. Then list the outbox directory.
~~~

**Expected outcome:**
- `kb/write` returns `{ status: "written" }`
- `kb/read outbox/test.txt` returns `Hello from test`
- `kb/list outbox/` includes `test.txt`

## 5. Knowledge Base — Path Traversal Blocked

**Prompt:**

~~~text
Read ../../../etc/passwd from kb.
~~~

**Expected outcome:**
- Returns an error with `isError: true`
- Error mentions `not found` or `Path traversal`

## 6. Task State Machine — Invalid Transition

**Prompt:**

~~~text
Run agent "code-review" with dummy input. Then try to mark the completed task as "running" again.
~~~

**Expected outcome:**
- The orchestrator rejects the transition `completed → running`
- Error thrown

## 7. Task List with Filter

**Prompt:**

~~~text
Run agent "onboarding" with input {"name":"Test","experience":"junior"}. Then list all tasks with status "completed".
~~~

**Expected outcome:**
- `agent/run` returns a `taskId`
- After the task completes, `task/list?status=completed` returns an array containing that task

## 8. Agent Not Found

**Prompt:**

~~~text
Run agent "nonexistent-agent" with input {}.
~~~

**Expected outcome:**
- Returns an error with `isError: true`
- Error message: `Agent "nonexistent-agent" not found`

## 9. Mirror Protocol — Quality Gate

**Prompt:**

~~~text
Run the code-review agent on this suspicious diff:

```diff
--- a/src/db.ts
+++ b/src/db.ts
@@ -1 +1 @@
-import { Pool } from "pg";
+import { Pool } from "mysql";
```
~~~

**Expected outcome:**
- Primary task completes
- `task/status` includes `mirrorStatus` field
- Output includes mirror's feedback

## 10. CI/CD CLI Runner

**Command (terminal, not OpenCode):**

```bash
node packages/mcp-orchestrator/dist/bin/agent-runner.js \
  --event "test:custom" \
  --payload '{"msg":"hello"}'
```

**Expected outcome:**
- The runner starts and loads agent configs
- No error thrown (even if no agent matches the `test:custom` event)
- Exit code 0

## Verification Checklist

| # | Check | How |
|---|-------|-----|
| 1 | Task transitions through states | `task/status <id>` returns `queued → running → completed` |
| 2 | Output is accessible | `kb/read outbox/<artifact>` returns content |
| 3 | Error on bad input | Tool returns `isError: true` with descriptive message |
| 4 | DAG ordering preserved | Timestamps: dependency completes before dependent starts |
| 5 | KB path traversal blocked | Attempt to escape `_kb/` returns error |
