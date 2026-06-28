import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  StdioServerTransport,
} from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  SSEServerTransport,
} from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AgentLoader } from "./loader/agent-loader.js";
import { KnowledgeBase } from "./kb/layout.js";
import { TaskQueue } from "./queue/task-queue.js";
import { InMemoryPersistence } from "./queue/persistence.js";
import { DAGRunner } from "./dag/runner.js";
import { MirrorExecutor } from "./mirror/mirror-executor.js";
import { createRetryHandler } from "./mirror/retry-handler.js";
import { SubDelegator } from "./delegation/sub-delegator.js";
import { createRunAgentTool } from "./tools/run-agent.js";
import { createTaskStatusTool } from "./tools/task-status.js";
import { createTaskListTool } from "./tools/task-list.js";
import { createKBReadTool } from "./tools/kb-read.js";
import { createKBWriteTool } from "./tools/kb-write.js";
import { createKBListTool } from "./tools/kb-list.js";
import { createKBSearchTool } from "./tools/kb-search.js";
import { createDelegateTool } from "./tools/delegate-tool.js";
import { Task } from "./schemas/task.js";
import { Authenticator, type OAuth2Config } from "./auth/authenticator.js";
import { createSSEAuthMiddleware, createOAuthMetadataEndpoint } from "./auth/middleware.js";
import { LLMProvider } from "./llm/provider.js";
import type { ServerResponse } from "node:http";

export interface OrchestratorConfig {
  transport: "stdio" | "sse";
  port?: number;
  projectRoot?: string;
  auth?: OAuth2Config;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

export class MCPOrchestratorServer {
  private server: Server;
  private agentLoader: AgentLoader;
  private taskQueue: TaskQueue;
  private kb: KnowledgeBase;
  private dagRunner: DAGRunner;
  private mirrorExecutor: MirrorExecutor;
  private tools: Map<string, ToolDefinition>;
  private config: OrchestratorConfig;
  private llm: LLMProvider;

  constructor(config: OrchestratorConfig) {
    this.config = config;

    this.server = new Server(
      {
        name: "ai-dispatch-orchestrator",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.kb = new KnowledgeBase(config.projectRoot);
    this.agentLoader = new AgentLoader(config.projectRoot);
    this.taskQueue = new TaskQueue(new InMemoryPersistence());
    this.taskQueue.setHandler((task) => this.handleTask(task));
    this.mirrorExecutor = new MirrorExecutor(this.agentLoader, this.taskQueue);

    const retryHandler = createRetryHandler(
      this.mirrorExecutor,
      this.taskQueue,
      this.agentLoader
    );

    this.dagRunner = new DAGRunner(this.taskQueue, this.kb, retryHandler);

    new SubDelegator(this.agentLoader, this.taskQueue, this.dagRunner);

    this.llm = new LLMProvider();

    this.tools = new Map();

    const runAgent = createRunAgentTool(this.agentLoader, this.taskQueue, this.dagRunner, this.kb);
    const taskStatus = createTaskStatusTool(this.taskQueue);
    const taskList = createTaskListTool(this.taskQueue);
    const kbRead = createKBReadTool(this.kb);
    const kbWrite = createKBWriteTool(this.kb);
    const kbList = createKBListTool(this.kb);
    const kbSearch = createKBSearchTool(this.kb);
    const delegate = createDelegateTool(this.agentLoader, this.taskQueue, this.dagRunner);

    for (const tool of [runAgent, taskStatus, taskList, kbRead, kbWrite, kbList, kbSearch, delegate]) {
      this.tools.set(tool.name, tool as ToolDefinition);
    }

    this.setupHandlers();
  }

  private extractUserMessage(input: unknown): string {
    if (typeof input === "string") return input;
    if (input === null || input === undefined) return "";
    const obj = input as Record<string, unknown>;
    if (obj.dagNodeId && obj.input) {
      return typeof obj.input === "string"
        ? obj.input
        : JSON.stringify(obj.input, null, 2);
    }
    return JSON.stringify(input, null, 2);
  }

  private async handleTask(task: Task): Promise<unknown> {
    console.error(`[handleTask] processing task ${task.id} for agent "${task.agentName}"`);
    await this.taskQueue.setTaskMeta(task.id, { progress: "Loading agent configuration..." });
    const config = await this.agentLoader.getAgent(task.agentName);
    if (!config) {
      console.error(`[handleTask] agent "${task.agentName}" not found for task ${task.id}`);
      throw new Error(`Agent "${task.agentName}" not found`);
    }

    const input = task.input ?? {};
    const userMessage = this.extractUserMessage(input);
    const systemPrompt = config.description || `You are the ${config.name} agent.`;

    let result: unknown;

    if (!this.llm.available) {
      console.error(`[handleTask] OPENROUTER_API_KEY not set — returning raw input for ${task.agentName}`);
      await this.taskQueue.setTaskMeta(task.id, { progress: "API key not configured — skipping LLM" });
      result = {
        note: "OPENROUTER_API_KEY not configured — LLM call skipped. Set OPENROUTER_API_KEY env var and restart.",
        agentName: task.agentName,
        input: userMessage,
      };
    } else {
      try {
        await this.taskQueue.setTaskMeta(task.id, { progress: `Calling ${config.model.id}...` });
        const llmResult = await this.llm.chat({
          model: config.model.id,
          systemPrompt,
          userMessage,
          temperature: (config.model.params as Record<string, unknown>)?.temperature as number | undefined,
        });

        await this.taskQueue.setTaskMeta(task.id, { progress: "Writing output to knowledge base..." });
        const kbPath = `outbox/${config.name}-${task.id}.md`;
        await this.kb.write(kbPath, llmResult.content);

        result = {
          output: llmResult.content,
          model: llmResult.model,
          agentName: config.name,
        };

        console.error(`[handleTask] ${task.agentName} used model ${llmResult.model}`);
      } catch (err) {
        console.error(`[handleTask] LLM call failed for ${task.agentName}:`, err);
        await this.taskQueue.setTaskMeta(task.id, { progress: `LLM call failed: ${(err as Error).message}` });
        throw err;
      }
    }

    // Inline mirror execution for standalone tasks (DAG tasks handle mirrors in executor)
    const mirrorName = config.mirror;
    if (mirrorName && !task.dagRunId && this.llm.available) {
      await this.taskQueue.setTaskMeta(task.id, { progress: `Running mirror audit via ${mirrorName}...` });
      console.error(`[handleTask] running inline mirror "${mirrorName}" for task ${task.id}`);
      const mirrorConfig = await this.agentLoader.getAgent(mirrorName);
      if (mirrorConfig) {
        const mirrorInput = {
          type: "audit",
          primaryAgent: task.agentName,
          primaryInput: task.input,
          primaryOutput: result,
        };
        const mirrorSystemPrompt =
          mirrorConfig.description ||
          `You are the ${mirrorName} mirror agent. Audit the primary agent's output and return JSON with "status" ("pass"|"fail"|"needs-revision") and "feedback".`;

        try {
          await this.taskQueue.setTaskMeta(task.id, { progress: `Mirror: calling ${mirrorConfig.model.id}...` });
          const mirrorResult = await this.llm.chat({
            model: mirrorConfig.model.id,
            systemPrompt: mirrorSystemPrompt,
            userMessage: JSON.stringify(mirrorInput, null, 2),
            temperature: (mirrorConfig.model.params as Record<string, unknown>)?.temperature as number | undefined,
          });

          let mirrorStatus: "pass" | "fail" | "needs-revision" = "pass";
          try {
            const cleaned = mirrorResult.content.replace(/```(?:json)?\n?/g, "").trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.status === "pass" || parsed.status === "fail" || parsed.status === "needs-revision") {
              mirrorStatus = parsed.status;
            }
          } catch {
            const lower = mirrorResult.content.toLowerCase();
            if (lower.includes("fail")) mirrorStatus = "fail";
            else if (lower.includes("needs-revision")) mirrorStatus = "needs-revision";
          }

          await this.taskQueue.setTaskMeta(task.id, { mirrorStatus, progress: `Mirror audit: ${mirrorStatus}` });
          if (result && typeof result === "object") {
            (result as Record<string, unknown>).mirrorStatus = mirrorStatus;
            (result as Record<string, unknown>).mirrorFeedback = mirrorResult.content;
          }
        } catch (err) {
          console.error(`[handleTask] mirror LLM call failed for ${mirrorName}:`, err);
          await this.taskQueue.setTaskMeta(task.id, { progress: `Mirror audit failed: ${(err as Error).message}` });
        }
      }
    }

    await this.taskQueue.setTaskMeta(task.id, { progress: "Complete" });
    console.error(`[handleTask] task ${task.id} done for "${task.agentName}"`);
    return result;
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: Array.from(this.tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.get(request.params.name);
      if (!tool) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }
      const result = await tool.handler(request.params.arguments as Record<string, unknown>);
      return result;
    });
  }

  async start(): Promise<void> {
    await this.kb.ensureDirs();

    if (this.config.transport === "sse") {
      await this.startSSE();
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
    }

    console.error(
      `MCP Orchestrator started (transport: ${this.config.transport})`
    );
  }

  private async startSSE(): Promise<void> {
    const http = await import("node:http");
    const config = this.config;

    const authenticator = new Authenticator(
      config.auth ?? { enabled: false }
    );
    const authMiddleware = createSSEAuthMiddleware(authenticator);
    const app = http.createServer();

    let transport: SSEServerTransport;

    app.on("request", async (req, res) => {
      if (req.url === "/.well-known/oauth-authorization-server") {
        createOAuthMetadataEndpoint()(res as ServerResponse);
        return;
      }

      if (req.method === "GET" && req.url === "/sse") {
        const allowed = await authMiddleware(req, res as ServerResponse);
        if (!allowed) return;

        transport = new SSEServerTransport("/message", res as ServerResponse);
        await this.server.connect(transport);
        return;
      }

      if (req.method === "POST" && req.url?.startsWith("/message")) {
        const allowed = await authMiddleware(req, res as ServerResponse);
        if (!allowed) return;

        if (transport) {
          await transport.handlePostMessage(req, res as ServerResponse);
        } else {
          res.writeHead(400);
          res.end("No active SSE session");
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    app.listen(config.port ?? 3100, () => {
      console.error(
        `MCP Orchestrator SSE server listening on port ${config.port ?? 3100}`
      );
    });
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}
