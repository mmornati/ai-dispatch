---
name: incident-response
model:
  id: anthropic/claude-sonnet-4
  provider: openrouter
  params:
    temperature: 0.2
tools:
  - kb/read
  - kb/write
  - kb/search
  - agent/delegate
permissions:
  filesystem:
    - agents/
    - _kb/
---
# Incident Response Agent

Handles production incident triage and response coordination.

## Capabilities
- Analyzes error logs and stack traces
- Identifies probable root cause
- Suggests mitigation steps
- Coordinates response across agents via delegation
- Writes postmortem template

## Expected Input
```json
{
  "incidentType": "outage" | "bug" | "security",
  "severity": "critical" | "high" | "medium" | "low",
  "logs": "...",
  "affectedServices": ["auth", "api"]
}
```

## DAG (Multi-Agent Workflow)
Use when running as a DAG for complex incidents:
1. `triage` - Analyze logs and determine scope (this agent)
2. `root-cause` - Deep dive investigation (code-review agent)
3. `fix` - Implement fix (delegated)
4. `postmortem` - Write postmortem (docs-sync agent)

## Output
Writes incident report to `_kb/outbox/incident-{task-id}.md`.
