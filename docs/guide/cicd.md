# CI/CD Integration

The system includes a standalone CLI runner for CI/CD pipelines. It enables event-driven agent execution from GitHub Actions or any CI system.

## CLI Runner

The `agent-runner.js` script loads all agent configurations, filters by event triggers, and executes matched DAGs.

```bash
node packages/mcp-orchestrator/dist/bin/agent-runner.js \
  --event "github:pull_request.opened" \
  --payload '{"action":"opened"}'
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--event` | Yes | Event type to match against agent triggers |
| `--payload` | No | JSON payload for the event (key-value pairs) |

## Event-Triggered Agents

Agents can declare triggers in their frontmatter:

```yaml
---
name: code-review
trigger:
  event: github:pull_request.opened
  filter: action=opened
---
```

When the runner processes an event:
1. Loads all agent configs
2. Filters by `trigger.event` matching `--event`
3. Applies `trigger.filter` (simple `key=value` matching on payload fields)
4. For each matched agent, runs its DAG (if configured)

## GitHub Actions Integration

Create `.github/workflows/code-review.yml`:

```yaml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: packages/mcp-orchestrator/package-lock.json

      - name: Install dependencies
        working-directory: packages/mcp-orchestrator
        run: npm ci

      - name: Run code review agent
        run: |
          node packages/mcp-orchestrator/dist/bin/agent-runner.js \
            --event "github:pull_request.opened" \
            --payload '{"action":"opened","pr":"${{ github.event.number }}"}'
```

## Event Filtering

The filter system supports simple `key=value` matching:

```yaml
trigger:
  event: github:pull_request.opened
  filter: action=opened    # Only matches payload.action === "opened"
```

Nested keys are supported via dot notation:

```yaml
filter: pull_request.action=opened
```

The payload is recursively traversed using the key path.

## Runner Architecture

```
agent-runner.js --event "test:custom" --payload '{"msg":"hello"}'
  │
  ▼
EventTriggerRunner.handleEvent(event, payload)
  │
  ├─> agentLoader.loadAll()
  │     └─> Scans agents/*.agent.md
  │
  ├─> For each agent with matching trigger:
  │     ├─> Check trigger.event === event
  │     ├─> Apply filter (if configured)
  │     └─> dagRunner.runDAG(agent.dag)
  │
  └─> No matching agents → exits silently (exit code 0)
```

## Error Handling

- **No matching agents**: The runner exits with code 0 (no error — the event simply has no handlers)
- **DAG execution failure**: The runner catches and logs the error, exits with code 1
- **Invalid payload JSON**: The runner fails with a parse error and exits with code 1

## Persisting Results

Agent outputs are written to `_kb/outbox/` and can be collected from there:

```bash
# After CI run
cat _kb/outbox/review-*.md
```

For long-term storage, consider archiving the `_kb/` directory as a CI artifact.
