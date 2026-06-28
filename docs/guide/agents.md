# Agent System

Agents are the core abstraction. Each agent is a specialized worker defined in a markdown file with YAML frontmatter. The system ships with 7 agents covering code review, documentation, incident response, onboarding, and more.

## Agent Configuration Format

Agent definitions live in `agents/*.agent.md` as Markdown files with YAML frontmatter delimited by `---`.

```yaml
---
name: code-review
model:
  id: anthropic/claude-sonnet-4
  provider: openrouter
  params:
    temperature: 0.3
tools:
  - kb/read
  - kb/write
  - kb/search
  - agent/delegate
permissions:
  filesystem:
    - agents/
    - _kb/
mirror: code-review-auditor
trigger:
  event: github:pull_request.opened
maxRetries: 2
---
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✓ | Unique agent identifier, referenced in `agent/run` calls |
| `model.id` | `string` | ✓ | Model identifier (e.g. `anthropic/claude-sonnet-4`) |
| `model.provider` | `string` | | Provider name (e.g. `openrouter`) |
| `model.params` | `object` | | Model parameters like `temperature` |
| `tools` | `string[]` | | Tool permissions for the agent |
| `permissions.filesystem` | `string[]` | | Allowed filesystem paths |
| `permissions.network` | `boolean` | | Network access flag |
| `mirror` | `string` | | Name of the mirror/auditor agent |
| `trigger.event` | `string` | | CI/CD event trigger (e.g. `github:pull_request.opened`) |
| `trigger.filter` | `string` | | Event filter (e.g. `action=opened`) |
| `maxRetries` | `number` | | Retry count (default 2) |

The markdown body after the frontmatter becomes the agent's `description` — its system prompt.

### Example: Code Review Agent

```yaml
---
name: code-review
model:
  id: anthropic/claude-sonnet-4
  provider: openrouter
  params:
    temperature: 0.3
tools:
  - kb/read
  - kb/write
  - kb/search
  - agent/delegate
permissions:
  filesystem:
    - agents/
    - _kb/
mirror: code-review-auditor
trigger:
  event: github:pull_request.opened
maxRetries: 2
---
# Code Review Agent

Reviews pull requests for code quality, security, and style.

## Capabilities
- Analyzes code diffs for potential bugs and security vulnerabilities
- Checks adherence to project coding standards
- Validates test coverage
- Produces structured review report with severity levels
```

## Registered Agents

| Agent | Model | Temp | Role | Mirror | Trigger |
|-------|-------|------|------|--------|---------|
| `code-review` | `claude-sonnet-4` | 0.3 | PR code review with severity reporting | `code-review-auditor` | `github:pull_request.opened` |
| `code-review-auditor` | `claude-sonnet-4` | 0.2 | Audits code-review output | — | — |
| `docs-sync` | `gpt-4o-mini` | 0.4 | Documentation sync and changelog | — | — |
| `incident-response` | `claude-sonnet-4` | 0.2 | Incident triage, RCA, postmortem | — | — |
| `meeting-prep` | `gpt-4o-mini` | 0.5 | Meeting briefings and agenda | — | — |
| `onboarding` | `gpt-4o-mini` | 0.5 | Personalized onboarding plans | — | — |
| `system-builder` | `claude-sonnet-4` | 0.4 | Creates new agent configs | — | — |

## How Agents Are Discovered

The `AgentLoader` scans `agents/*.agent.md`, parses YAML frontmatter with `js-yaml`, validates against a Zod schema, and caches results.

```
AgentLoader
  ├─> discoverAgentFiles()     → agents/*.agent.md
  ├─> parseFrontmatter(content) → { attributes, body }
  ├─> AgentConfigSchema.parse() → validated config
  └─> ConfigCache.set()        → in-memory cache
```

## Model Tiering Strategy

The system uses a tiered model strategy:

- **Powerful models** (`claude-sonnet-4`, `claude-opus-4.8`) — Code tasks, incident response, mirror auditing
- **Cheap/fast models** (`gpt-4o-mini`) — Documentation, onboarding, meeting prep

This is configured per-agent in the frontmatter `model.id` field.

## Agent Output Convention

Every agent writes its output to `_kb/outbox/` with a consistent naming pattern:

| Agent | Output Pattern |
|-------|---------------|
| `code-review` | `review-{task-id}.md` |
| `onboarding` | `onboarding-{name}.md` |
| `incident-response` | `incident-{task-id}.md` |
| `meeting-prep` | `meeting-prep-{type}-{date}.md` |
| `docs-sync` | `docs-update-{task-id}.md` |
| `system-builder` | `system-builder-{task-id}.md` |
