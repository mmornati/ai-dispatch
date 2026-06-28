---
name: onboarding
model:
  id: openai/gpt-4o-mini
  provider: openrouter
  params:
    temperature: 0.5
tools:
  - kb/read
  - kb/write
permissions:
  filesystem:
    - agents/
    - docs/
    - _kb/
---
# Onboarding Agent

Generates personalized onboarding plans for new team members.

## Capabilities
- Assesses developer background from input
- Creates structured learning path from project docs
- Recommends first tasks (good-first-issue style)
- Produces onboarding checklist

## Expected Input
```json
{
  "newDeveloper": {
    "name": "Jane",
    "experience": "senior",
    "knownTech": ["TypeScript", "React"],
    "startDate": "2026-07-01"
  }
}
```

## Output
Writes onboarding plan to `_kb/outbox/onboarding-{developer-name}.md`.
