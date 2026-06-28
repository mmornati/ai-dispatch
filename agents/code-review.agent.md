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

## Expected Input (from KB inbox or direct payload)
```json
{
  "prUrl": "https://github.com/org/repo/pull/42",
  "diff": "...",
  "files": ["src/file1.ts", "src/file2.ts"]
}
```

## Output
Writes review report to `_kb/outbox/review-{task-id}.md` with sections:
- Summary
- Critical Issues
- Suggestions
- Style Notes
- Test Coverage Assessment

## Delegation
Can delegate to `docs-sync` agent for documentation impact assessment.
