# Getting Started

## Prerequisites

- Node.js 24+
- npm
- [OpenCode](https://opencode.ai) installed and configured
- An OpenRouter API key (or any OpenAI-compatible provider)

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

### 2. Configure OpenCode

The project ships with an `opencode.json` pre-configured. Ensure the MCP server points to the built orchestrator:

```json
{
  "model": "anthropic/claude-sonnet-4",
  "agent": {
    "orchestrator": {
      "model": "anthropic/claude-sonnet-4",
      "prompt": ".opencode/prompts/orchestrator.txt",
      "description": "Routes tasks to specialized agents"
    }
  },
  "mcp": {
    "ai-dispatch": {
      "type": "local",
      "command": ["node", "packages/mcp-orchestrator/dist/index.js", "--transport", "stdio"],
      "enabled": true
    }
  }
}
```

### 3. Connect OpenCode

Run OpenCode from the project root:

```bash
opencode
```

OpenCode will automatically launch the MCP orchestrator as a subprocess and connect to it via stdio. You should see the MCP tools become available:

```
✓ MCP server ai-dispatch connected (8 tools)
```

### 4. Verify the Connection

Check that the tools are accessible by calling `task/list`:

```bash
# From OpenCode, send:
# "List all tasks"
```

If the MCP server is running, you'll get back an empty list (or any existing tasks).

## Running Your First Agent

### Single Agent — Code Review

Send this prompt to OpenCode:

~~~
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

The orchestrator will:

1. Interpret your request and call `agent/run({ agent: "code-review", input: { diff } })`
2. The MCP server enqueues a task and starts processing
3. The server generates a review report and writes it to `_kb/outbox/review-{task-id}.md`
4. OpenCode reads the output and presents the review

### DAG — Multi-Step Workflow

~~~
Run a 3-step DAG:
Step 1: code-review on this diff
Step 2: docs-sync (depends on step 1)
Step 3: onboarding for "Jane, senior TS dev" (depends on step 1)

Diff: function get() {} → function get(): void {}
~~~

The orchestrator runs step 1 first, then steps 2 and 3 in parallel after step 1 completes.

## Next Steps

- Understand the [architecture](./architecture) in depth
- Learn about [agents](./agents) and their configuration
- Explore the [MCP tools reference](./tools)
- Try the [test prompts](./test-prompts) for each agent
