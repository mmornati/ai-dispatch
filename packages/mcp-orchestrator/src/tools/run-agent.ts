import { z } from "zod";
import { AgentLoader } from "../loader/agent-loader.js";
import { TaskQueue } from "../queue/task-queue.js";
import { DAGRunner } from "../dag/runner.js";
import { DAGStep } from "../schemas/agent-config.js";
import { KnowledgeBase } from "../kb/layout.js";

const RunAgentSchema = z.object({
  agent: z.string().min(1),
  input: z.unknown(),
  dag: z
    .array(
      z.object({
        id: z.string(),
        agent: z.string(),
        input: z.string().optional(),
        depends_on: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

export function createRunAgentTool(
  agentLoader: AgentLoader,
  taskQueue: TaskQueue,
  dagRunner: DAGRunner,
  kb: KnowledgeBase
) {
  return {
    name: "agent/run",
    description: "Run an agent (or DAG) with the given input payload",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Agent name from agent config" },
        input: { description: "Input payload for the agent" },
        dag: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              agent: { type: "string" },
              input: { type: "string" },
              depends_on: { type: "array", items: { type: "string" } },
            },
          },
          description: "Optional inline DAG definition for multi-agent workflows",
        },
      },
      required: ["agent"],
    },
    handler: async (args: unknown) => {
      const parsed = RunAgentSchema.parse(args);

      if (parsed.dag && parsed.dag.length > 0) {
        const steps = parsed.dag as DAGStep[];
        const validation = dagRunner.validateDAG(steps);
        if (!validation.valid) {
          return {
            content: [{ type: "text", text: `DAG validation failed: ${validation.error}` }],
            isError: true,
          };
        }

        const run = await dagRunner.runDAG(steps, { name: parsed.agent });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dagRunId: run.id,
                status: run.status,
                nodeStatuses: Object.fromEntries(run.nodeStatuses),
              }),
            },
          ],
        };
      }

      const config = await agentLoader.getAgent(parsed.agent);
      if (!config) {
        return {
          content: [{ type: "text", text: `Agent "${parsed.agent}" not found` }],
          isError: true,
        };
      }

      const task = await taskQueue.enqueue({
        agentName: parsed.agent,
        input: parsed.input,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              taskId: task.id,
              agentName: task.agentName,
              status: task.status,
            }),
          },
        ],
      };
    },
  };
}
