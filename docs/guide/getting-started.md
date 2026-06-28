# Getting Started

## Prerequisites

- Node.js 24+
- npm
- [OpenCode](https://opencode.ai) installed and configured
- An OpenRouter API key — each agent uses its own model via OpenRouter

## Installation

### 1. Clone and Install

```bash
git clone https://github.com/mmornati/ai-dispatch.git
cd ai-dispatch
cd packages/mcp-orchestrator
npm install
npm run build
cd ../..
```

### 2. Set Up the API Key

Copy the example env file and add your OpenRouter key:

```bash
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY=sk-or-...
```

The MCP server reads `.env` at startup. You can also set `OPENROUTER_API_KEY` as an environment variable.

### 3. Configure OpenCode

The project ships with an `opencode.json` pre-configured. No additional setup needed.

### 4. Connect OpenCode

Run OpenCode from the project root:

```bash
opencode
```

The orchestrator agent loads by default and connects to the MCP server automatically. You're ready to go.

### 5. Verify the Connection

Check that the tools are accessible by calling `task/list`:

```bash
# From OpenCode, send:
# "List all tasks"
```

If the MCP server is running, you'll get back an empty list (or any existing tasks).

## Running Your First Dispatch

Simply describe what you need in natural language. The orchestrator agent understands your intent and dispatches to the right specialist agent automatically.

### Example: Code Review — What Happens Under the Hood

Send this to OpenCode:

~~~
Can you review this code for security issues?

```ts
import { jwtVerify } from "jose";
import { execSync } from "child_process";

export async function validate(token: string) {
  execSync("rm -rf /");
  const result = await jwtVerify(token, secret);
}
~~~
```

Here is exactly what happens, step by step.

---

#### Step 1 — Orchestrator routes the request

The orchestrator agent (running **deepseek/deepseek-v4-flash**) receives your prompt. Its system prompt (`orchestrator.txt`) tells it to recognize the domain and dispatch via MCP:

```
You are the AI Dispatch Orchestrator.
When a user asks for code review / security audit → dispatch to code-review.
Always call agent/run with the appropriate agent.
```

The orchestrator calls the MCP tool:

```json
// MCP call: agent/run
{
  "agent": "code-review",
  "input": {
    "diff": "import { jwtVerify } from \"jose\";\nimport { execSync } from \"child_process\";\n\nexport async function validate(token: string) {\n  execSync(\"rm -rf /\");\n  const result = await jwtVerify(token, secret);\n}"
  }
}
```

The MCP server returns a task ID and the orchestrator starts polling `task/status`.

---

#### Step 2 — MCP server loads the agent config

The server reads `agents/code-review.agent.md` and parses its YAML frontmatter:

```yaml
name: code-review
model:
  id: anthropic/claude-sonnet-4
  params:
    temperature: 0.3
mirror: code-review-auditor
maxRetries: 2
```

The markdown body after the frontmatter becomes the **LLM system prompt**. This is what gets sent to the model.

---

#### Step 3 — First LLM call (code-review agent)

The `LLMProvider` sends this to OpenRouter:

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer sk-or-...
```

**System prompt** (from `code-review.agent.md` body):

```
# Code Review Agent

Reviews pull requests for code quality, security, and style.

## Capabilities
- Analyzes code diffs for potential bugs and security vulnerabilities
- Checks adherence to project coding standards
- Validates test coverage
- Produces structured review report with severity levels

## Expected Input (from KB inbox or direct payload)
{
  "prUrl": "https://github.com/org/repo/pull/42",
  "diff": "...",
  "files": ["src/file1.ts", "src/file2.ts"]
}

## Output
Writes review report with sections:
- Summary
- Critical Issues
- Suggestions
- Style Notes
- Test Coverage Assessment
```

**User message** (your prompt + code):

```
Can you review this code for security issues?

import { jwtVerify } from "jose";
import { execSync } from "child_process";

export async function validate(token: string) {
  execSync("rm -rf /");
  const result = await jwtVerify(token, secret);
}
```

**Model requested**: `anthropic/claude-sonnet-4` (temperature 0.3)

The LLM analyzes the code and returns a structured report. The server writes it to `_kb/outbox/code-review-{task-id}.md`:

```markdown
# Code Review Report

## Summary
The code contains one critical security vulnerability — arbitrary command execution.

## Critical Issues
1. **Remote Code Execution via execSync** — severity: **critical**
   - **File:** <inline>, line 7
   - **Issue:** `execSync("rm -rf /")` executes an arbitrary system command.
   - **Risk:** Full filesystem compromise — deletes all files on disk.
   - **Fix:** Remove `execSync` and use safe filesystem APIs. Validate all command inputs.

## Suggestions
- Import only what you need (`jwtVerify` is good, `execSync` is dangerous).
- Add input validation for the token parameter before processing.
- Consider using a type-safe error handling pattern.

---

*Reviewed by code-review agent (model: claude-4-sonnet-20250522, task: abc-123)*
```

---

#### Step 4 — Mirror audit (second LLM call)

Because `code-review` has `mirror: code-review-auditor`, the server runs an inline audit. It loads `agents/code-review-auditor.agent.md` and sends its body as the system prompt to a **second** LLM call:

**System prompt** (from `code-review-auditor.agent.md`):

```
# Code Review Auditor (Mirror Agent)

Validates the output of the code-review agent for completeness and accuracy.

## Audit Criteria
- All critical issues are properly described with line references
- False positive rate is reasonable
- Severity levels are correctly assigned
- Security issues are not missed
- Report is actionable and clearly written

## Output
You MUST respond with ONLY a valid JSON object (no markdown, no code fences):
{ "status": "pass" | "fail" | "needs-revision", "feedback": "..." }
```

**User message** — the primary task's input and output, bundled for the auditor:

```json
{
  "type": "audit",
  "primaryAgent": "code-review",
  "primaryInput": { "diff": "..." },
  "primaryOutput": {
    "output": "# Code Review Report\n\n## Summary\n...",
    "model": "claude-4-sonnet-20250522",
    "agentName": "code-review"
  }
}
```

**Mirror LLM response** (parsed from the model's output):

```json
{ "status": "pass", "feedback": "Audit passed. Critical issue correctly identified with line reference and severity. The report is clear and actionable. No false positives detected." }
```

The server stores the audit result on the task. Polling `task/status` now shows:

```json
{
  "id": "abc-123",
  "status": "completed",
  "progress": "Complete",
  "mirrorStatus": "pass",
  "output": {
    "output": "# Code Review Report\n\n## Summary\n...",
    "model": "claude-4-sonnet-20250522",
    "agentName": "code-review",
    "mirrorStatus": "pass",
    "mirrorFeedback": "{\n  \"status\": \"pass\",\n  \"feedback\": \"Audit passed. Critical issue correctly identified...\"\n}"
  }
}
```

---

#### Step 5 — Result presented to you

The orchestrator reads the KB file via `kb/read("outbox/code-review-abc-123.md")` and presents the review report in the chat. You see:

> # Code Review Report
>
> ## Critical Issues
> 1. **Remote Code Execution via execSync** — severity: **critical**
>    ...
>
> ⚡ Auto-audited — mirror status: **pass**

---

### Summary of LLM Calls Made

| Call | Agent | Model | Temperature | Cost Tier |
|------|-------|-------|-------------|-----------|
| 1 | `code-review` | `claude-sonnet-4` | 0.3 | Mid ( ~$3/M tokens) |
| 2 | `code-review-auditor` | `claude-sonnet-4` | 0.2 | Mid ( ~$3/M tokens) |

The orchestrator itself (deepseek, ~$0.09/M tokens) handled the routing — it costs ~33x less than the code-review LLM calls.

### Multi-Step Workflow

For more complex requests, the orchestrator creates a DAG automatically:

~~~
I need a new onboarding plan for Jane, a senior TypeScript developer joining next week. Also check if the docs need updating after this API change:

```ts
function get(): void {}
```
~~~

The orchestrator recognizes this involves two domains and dispatches a DAG:

```json
{
  "agent": "workflow",
  "dag": [
    { "id": "docs", "agent": "docs-sync", "input": "API changed: function get() ..." },
    { "id": "onboard", "agent": "onboarding",
      "input": "Jane, senior TypeScript dev, joining next week",
      "depends_on": ["docs"] }
  ]
}
```

This runs **docs-sync** first (via `gpt-4o-mini`, cheap model), then **onboarding** in parallel (also `gpt-4o-mini`). The orchestrator reads both outputs from `_kb/outbox/` and consolidates them into a single response.

## Next Steps

- Understand the [architecture](./architecture) in depth
- Learn about [agents](./agents) and their configuration
- Explore the [MCP tools reference](./tools)
- Try the [test prompts](./test-prompts) for each agent
