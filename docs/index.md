---
layout: home

hero:
  name: AI Model Delegation
  text: Multi-Agent Orchestration for OpenCode
  tagline: Route tasks to specialized AI agents via MCP — code review, incident response, docs sync, onboarding, and more.
  image:
    src: /favicon.svg
    alt: AI Model Delegation
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: What Is It?
      link: /guide/what-is

features:
  - icon: 🧠
    title: Agent-Based Routing
    details: Dispatch work to task-specific agents. Each agent has its own model, prompt, and tools.
  - icon: 🔄
    title: DAG Orchestration
    details: Define multi-step workflows with dependency ordering, parallel fan-out, and cycle detection.
  - icon: 🔍
    title: Mirror Audit Protocol
    details: Every agent output can be automatically verified by a dedicated auditor agent with retry-on-revision.
  - icon: 🗄️
    title: Knowledge Base
    details: Shared filesystem-based state — inbox, outbox, context, and session scratch space.
  - icon: 🔌
    title: MCP Native
    details: Built on the Model Context Protocol. Integrates natively with OpenCode and any MCP-compatible client.
  - icon: ⚡
    title: Event-Driven CI/CD
    details: Trigger agent workflows from GitHub Actions or any CI system via the CLI runner.
---
