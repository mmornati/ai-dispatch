# Development Guide

## Project Setup

```bash
# Clone and install
cd packages/mcp-orchestrator
npm install
npm run build
```

## Build Commands

```bash
# Compile TypeScript to JS
npm run build          # tsc

# Development mode with watch
npm run dev            # tsx watch src/index.ts

# Start the MCP server (stdio mode, default)
npm run start          # node dist/index.js

# Start with SSE transport (for remote debugging)
npm run start:sse      # node dist/index.js --transport sse --port 3100

# Start with stdio (explicit)
npm run start:stdio    # node dist/index.js --transport stdio
```

### From Project Root

```bash
# Start MCP server directly
node packages/mcp-orchestrator/dist/index.js --transport stdio

# Start in SSE mode on port 3100
node packages/mcp-orchestrator/dist/index.js --transport sse --port 3100
```

## Project Structure

```
packages/mcp-orchestrator/
├── src/
│   ├── index.ts                    # CLI entry point (arg parsing, server start)
│   ├── server.ts                   # MCPOrchestratorServer class + task handler
│   │
│   ├── tools/                      # MCP tool definitions (8 tools)
│   │   ├── run-agent.ts            # agent/run
│   │   ├── delegate-tool.ts        # agent/delegate
│   │   ├── task-status.ts          # task/status
│   │   ├── task-list.ts            # task/list
│   │   ├── kb-read.ts              # kb/read
│   │   ├── kb-write.ts             # kb/write
│   │   ├── kb-list.ts              # kb/list
│   │   └── kb-search.ts            # kb/search
│   │
│   ├── queue/                      # Task queue and persistence
│   │   ├── task-queue.ts           # TaskQueue (scheduler + state machine)
│   │   └── persistence.ts          # InMemoryPersistence + SQLitePersistence
│   │
│   ├── dag/                        # DAG orchestration
│   │   ├── types.ts                # DAGNode, DAGDefinition, DAGRun, topologicalSort
│   │   ├── scheduler.ts            # scheduleDAG, getReadyNodes
│   │   ├── executor.ts             # DAGExecutor (tick loop, executeNode)
│   │   └── runner.ts               # DAGRunner (public API)
│   │
│   ├── mirror/                     # Mirror/audit protocol
│   │   ├── mirror-executor.ts      # MirrorExecutor
│   │   └── retry-handler.ts        # RetryHandler (retry loop with mirror)
│   │
│   ├── llm/                        # LLM provider (OpenRouter API client)
│   │   └── provider.ts             # LLMProvider — calls OpenRouter with agent-specific models
│   │
│   ├── loader/                     # Agent config loading
│   │   ├── agent-loader.ts         # AgentLoader (scans, parses, validates)
│   │   └── config-cache.ts         # ConfigCache (in-memory with age tracking)
│   │
│   ├── kb/                         # Knowledge base filesystem
│   │   ├── layout.ts               # KnowledgeBase class
│   │   └── paths.ts                # Path utilities
│   │
│   ├── delegation/                 # Agent sub-delegation
│   │   └── sub-delegator.ts        # SubDelegator (depth-guarded)
│   │
│   ├── auth/                       # JWT/OAuth2 authentication (SSE only)
│   │   ├── authenticator.ts        # JWT validation with JWKS/HMAC
│   │   └── middleware.ts           # SSE auth middleware
│   │
│   ├── schemas/                    # Zod validation schemas
│   │   ├── task.ts                 # Task, TaskStatus, VALID_TRANSITIONS
│   │   └── agent-config.ts         # AgentConfigSchema, DAGStepSchema
│   │
│   ├── ci/                         # CI/CD integration
│   │   └── trigger-runner.ts       # EventTriggerRunner
│   │
│   └── bin/                        # CLI scripts
│       └── agent-runner.ts         # agent-runner.js entry point
│
├── agents/                         # Agent configuration files (in project root)
│   └── *.agent.md                  # 7 agent definitions
│
├── _kb/                            # Knowledge base (runtime, in project root)
│   ├── inbox/
│   ├── outbox/
│   ├── context/
│   └── sessions/
│
└── tsconfig.json                   # TypeScript configuration (Node 24, ESM)
```

## Adding a New Agent

Adding a new agent is as simple as creating a markdown file. No code changes needed — the generic `handleTask` automatically loads the agent config, uses its markdown description as the LLM system prompt, and calls OpenRouter with the agent's configured model.

1. Create `agents/your-agent.agent.md`:

```yaml
---
name: your-agent
model:
  id: anthropic/claude-sonnet-4
  provider: openrouter
  params:
    temperature: 0.3
tools:
  - kb/read
  - kb/write
permissions:
  filesystem:
    - _kb/
---
# Your Agent

Describe what your agent does here. The markdown body becomes the LLM system prompt, so be specific about:

- What the agent should do
- What input format it expects
- What output format it should produce
```

2. Rebuild: `npm run build`

3. Restart OpenCode — the new agent is now available via `agent/run({ agent: "your-agent", input: {} })`.

### How It Works

When the orchestrator dispatches to your agent, `handleTask`:

1. Loads the agent config from `agents/your-agent.agent.md`
2. Uses the markdown body as the LLM **system prompt**
3. Sends the task input as the LLM **user message**
4. Calls OpenRouter with `config.model.id` (e.g. `claude-sonnet-4`)
5. Writes the LLM response to `_kb/outbox/your-agent-{task-id}.md`
6. Returns `{ output, model, agentName }` to the task queue

### Example

Create `agents/joke-teller.agent.md`:

```yaml
---
name: joke-teller
model:
  id: openai/gpt-4o-mini
  provider: openrouter
  params:
    temperature: 0.8
---
# Joke Teller

Tell a programming joke based on the user's input topic. Keep it family-friendly and under 100 words.
```

The agent is immediately available — no `server.ts` changes, no handler case, no switch statement.

## Type System

The project uses TypeScript 6 with strict mode and ES module resolution:

- All imports use `.js` extensions (even for `.ts` files) — standard ESM convention
- Zod schemas validate runtime data against TypeScript types
- Key types are in `src/schemas/` — `Task`, `AgentConfig`, `DAGStep`

## Dependency Graph

```
index.ts
  └─> MCPOrchestratorServer (server.ts)
        ├─> KnowledgeBase (kb/layout.ts)
        ├─> AgentLoader (loader/agent-loader.ts + config-cache.ts)
├─> LLMProvider (llm/provider.ts)
├─> TaskQueue (queue/task-queue.ts + persistence.ts)
├─> DAGRunner (dag/runner.ts → executor.ts → scheduler.ts → types.ts)
        ├─> MirrorExecutor (mirror/mirror-executor.ts)
        ├─> RetryHandler (mirror/retry-handler.ts)
        ├─> SubDelegator (delegation/sub-delegator.ts)
        ├─> Authenticator (auth/authenticator.ts + middleware.ts)
        └─> 8 Tools (tools/*.ts)
```
