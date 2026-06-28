---
name: docs-sync
model:
  id: openai/gpt-4o-mini
  provider: openrouter
  params:
    temperature: 0.4
tools:
  - kb/read
  - kb/write
  - kb/list
  - kb/search
permissions:
  filesystem:
    - agents/
    - docs/
    - _kb/
---
# Documentation Sync Agent

Keeps documentation in sync with code changes.

## Capabilities
- Detects documentation gaps when code changes
- Updates README, API docs, and inline comments
- Generates changelog entries
- Validates cross-references

## Expected Input
```json
{
  "changedFiles": ["src/api.ts"],
  "changeType": "feat" | "fix" | "refactor",
  "description": "Added new endpoint for user preferences"
}
```

## Output
Writes documentation updates to `_kb/outbox/docs-update-{task-id}.md` and optionally creates/edits files in `docs/`.
