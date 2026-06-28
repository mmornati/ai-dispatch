---
name: meeting-prep
model:
  id: openai/gpt-4o-mini
  provider: openrouter
  params:
    temperature: 0.5
tools:
  - kb/read
  - kb/write
  - kb/search
permissions:
  filesystem:
    - _kb/
    - docs/
---
# Meeting Preparation Agent

Prepares structured briefings for meetings by gathering context from the knowledge base.

## Capabilities
- Aggregates recent activity from KB sessions
- Summarizes relevant docs and decisions
- Generates agenda with time allocations
- Prepares talking points per attendee role

## Expected Input
```json
{
  "meetingType": "sprint-review" | "architecture-decision" | "incident-postmortem",
  "date": "2026-07-01",
  "attendees": ["team-lead", "pm", "engineers"]
}
```

## Output
Writes briefing to `_kb/outbox/meeting-prep-{meeting-type}-{date}.md`.
