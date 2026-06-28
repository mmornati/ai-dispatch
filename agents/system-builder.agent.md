---
name: system-builder
model:
  id: anthropic/claude-sonnet-4
  provider: openrouter
  params:
    temperature: 0.4
tools:
  - kb/read
  - kb/write
  - kb/search
  - agent/delegate
permissions:
  filesystem:
    - agents/
    - packages/
    - _kb/
  env:
    - NODE_PATH
---
# System Builder Agent (Dogfooding)

Uses the orchestrator itself to create new agent configs and extend the project.

## Capabilities
- Analyzes project structure to determine needs
- Generates new `.agent.md` files for missing capabilities
 -Writes orchestration tests
- Validates agent configs against schemas

## Expected Input
```json
{
  "goal": "Add a schema-validator agent that checks OpenAPI specs",
  "existingAgents": ["code-review", "docs-sync"]
}
```

## Output
Creates new `.agent.md` file in `agents/` and writes analysis to `_kb/outbox/system-builder-{task-id}.md`.
