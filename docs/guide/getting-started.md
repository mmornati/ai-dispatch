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

### Single Task

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

The orchestrator will:

1. Recognize this as a code review request
2. Route it to the `code-review` agent
3. The MCP server calls OpenRouter with the agent's model (`claude-sonnet-4`), using the agent's system prompt
4. The LLM response is written to `_kb/outbox/code-review-{task-id}.md`
5. OpenCode presents the review to you

### Multi-Step Workflow

~~~
I need a new onboarding plan for Jane, a senior TypeScript developer joining next week. Also check if the docs need updating after this API change:

```ts
function get(): void {}
```
~~~

The orchestrator breaks this into a DAG automatically — it runs the onboarding agent and docs-sync agent in the right order, then consolidates the results.

## Next Steps

- Understand the [architecture](./architecture) in depth
- Learn about [agents](./agents) and their configuration
- Explore the [MCP tools reference](./tools)
- Try the [test prompts](./test-prompts) for each agent
