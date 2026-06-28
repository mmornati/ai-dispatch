import { defineConfig } from "vitepress";

export default defineConfig({
  base: "/ai-dispatch/",
  title: "AI Dispatch",
  description: "Multi-agent orchestration system powered by OpenCode and MCP",
  lang: "en-US",
  head: [
    ["link", { rel: "icon", href: "/ai-dispatch/favicon.svg" }],
  ],
  themeConfig: {
    logo: "/favicon.svg",
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/mmornati/ai-dispatch" },
    ],
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/what-is" },
      { text: "GitHub", link: "https://github.com/mmornati/ai-dispatch" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "What Is AI Dispatch?", link: "/guide/what-is" },
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Architecture Overview", link: "/guide/architecture" },
          ],
        },
        {
          text: "Core Concepts",
          items: [
            { text: "Agent System", link: "/guide/agents" },
            { text: "Task Lifecycle", link: "/guide/tasks" },
            { text: "DAG Execution", link: "/guide/dag" },
            { text: "Mirror Protocol", link: "/guide/mirror" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "MCP Tools", link: "/guide/tools" },
            { text: "Knowledge Base", link: "/guide/knowledge-base" },
            { text: "Configuration", link: "/guide/configuration" },
            { text: "CI/CD Integration", link: "/guide/cicd" },
          ],
        },
        {
          text: "Development",
          items: [
            { text: "Development Guide", link: "/guide/development" },
            { text: "Test Prompts", link: "/guide/test-prompts" },
          ],
        },
      ],
    },
    footer: {
      message: "MIT License — Built with heart by mmornati",
      copyright: "Copyright 2026-present mmornati",
    },
  },
});
