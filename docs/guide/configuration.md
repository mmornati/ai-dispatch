# Configuration

The system is configured primarily through `opencode.json` at the project root. This file tells OpenCode which MCP server to launch, which agents to use, and how to connect to AI providers.

## `opencode.json`

```json
{
  "$schema": "https://opencode.ai/schema.json",
  "model": "deepseek/deepseek-v4-flash",
  "agent": {
    "orchestrator": {
      "model": "deepseek/deepseek-v4-flash",
      "prompt": ".opencode/prompts/orchestrator.txt",
      "description": "Routes tasks to specialized agents",
      "maxTokens": 8000
    }
  },
  "disabled_providers": ["github-copilot"],
  "skills": {
    "paths": [".opencode/skills/orchestrate.md"]
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

### Sections

| Section | Purpose |
|---------|---------|
| `model` | Default OpenCode model |
| `agent` | OpenCode agent definitions (the orchestrator agent) |
| `disabled_providers` | Providers to disable |
| `skills` | Skills that extend OpenCode's capabilities |
| `mcp` | MCP server configurations |

## Agent Definitions

Agents are defined in `agents/*.agent.md`. The orchestrator agent's system prompt is in `.opencode/prompts/orchestrator.txt`. This prompt tells the orchestrator how to route requests to specialized agents.

## Orchestrator Prompt

The orchestrator agent is guided by a system prompt at `.opencode/prompts/orchestrator.txt`. It instructs the orchestrator to:

1. **Understand the request** — Identify the domain (code review, documentation, incident response, etc.)
2. **Choose the mode** — Single agent for a specific task, DAG for multi-step workflows, delegation for sub-tasks
3. **Execute** — Call the appropriate `agent/run` with the right agent name and input
4. **Consolidate** — Read outputs from `_kb/outbox/` and present results to the user

## Dashboard

The server starts a dashboard on port 3101 by default:

```
http://localhost:3101/dashboard
```

It auto-refreshes and shows:
- **Dashboard** — stats cards (queued / running / completed / failed), recent activity feed
- **Tasks** — sortable table with status, progress, model, mirror audit results
- **KB** — file tree of `_kb/`, click to preview outbox reports
- **Agents** — card view of all 7 agents with model, temperature, mirror config
- **DAGs** — list of completed DAG runs

Disable the dashboard by setting `--dashboard-port 0`.

## MCP Server Configuration

The `mcp` section defines how OpenCode launches the orchestrator server:

```json
"mcp": {
  "ai-dispatch": {
    "type": "local",
    "command": ["node", "packages/mcp-orchestrator/dist/index.js", "--transport", "stdio"],
    "enabled": true
  }
}
```

- **`type: "local"`** — The server runs as a child process of OpenCode
- **`command`** — The command to launch (must be an array of strings)
- **`--transport stdio`** — Uses stdin/stdout for MCP communication
- **`enabled`** — Toggle the server on/off

### Alternative: SSE Transport

For remote access or debugging, run the MCP server separately:

```bash
node packages/mcp-orchestrator/dist/index.js --transport sse --port 3100
```

Then configure OpenCode to connect:

```json
"mcp": {
  "ai-dispatch": {
    "type": "sse",
    "url": "http://localhost:3100/sse",
    "enabled": true
  }
}
```

## Environment Variables

The MCP server loads `.env` from the project root at startup (or reads from the process environment).

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | API key for OpenRouter — required for agent LLM calls |
| `ANTHROPIC_API_KEY` | Alternative | If using Anthropic directly |
| `OPENAI_API_KEY` | Alternative | If using OpenAI directly |

If `OPENROUTER_API_KEY` is not set, the MCP server logs a warning and returns a fallback response (no fake mock data). Copy `.env.example` → `.env` and add your key to enable real LLM-powered agents.

## RBAC / Permissions

Agent configs can specify filesystem permissions and tool access:

```yaml
tools:
  - kb/read
  - kb/write
  - agent/delegate
permissions:
  filesystem:
    - agents/
    - _kb/
  network: false
```

These are declared in the agent configuration but are advisory — the MCP server trusts the agents it runs.

## Task Persistence

By default, the system uses in-memory persistence (tasks are lost on restart). For durable persistence, configure the SQLite backend by modifying `server.ts`:

```typescript
import { SQLitePersistence } from "./queue/persistence.js";

// Replace:
this.taskQueue = new TaskQueue(new InMemoryPersistence());

// With:
this.taskQueue = new TaskQueue(new SQLitePersistence("./data/tasks.db"));
```
