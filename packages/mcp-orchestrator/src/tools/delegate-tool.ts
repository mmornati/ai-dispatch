import { z } from "zod";
import { AgentLoader } from "../loader/agent-loader.js";
import { TaskQueue } from "../queue/task-queue.js";
import { DAGRunner } from "../dag/runner.js";

const DelegateSchema = z.object({
  agent: z.string().min(1),
  input: z.unknown(),
  parentTaskId: z.string().optional(),
});

export function createDelegateTool(
  agentLoader: AgentLoader,
  taskQueue: TaskQueue,
  dagRunner: DAGRunner
) {
  let delegationDepth = 0;
  const maxDepth = 5;

  return {
    name: "agent/delegate",
    description:
      "Sub-delegate a task to another agent. Used by agents during execution.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Target agent name" },
        input: { description: "Input payload for the delegated agent" },
        parentTaskId: {
          type: "string",
          description: "Parent task ID for traceability",
        },
      },
      required: ["agent"],
    },
    handler: async (args: unknown) => {
      if (delegationDepth >= maxDepth) {
        return {
          content: [{ type: "text", text: "Max delegation depth reached" }],
          isError: true,
        };
      }

      const parsed = DelegateSchema.parse(args);
      const config = await agentLoader.getAgent(parsed.agent);

      if (!config) {
        return {
          content: [{ type: "text", text: `Agent "${parsed.agent}" not found` }],
          isError: true,
        };
      }

      delegationDepth++;
      try {
        const task = await taskQueue.enqueue({
          agentName: parsed.agent,
          input: parsed.input,
          parentTaskId: parsed.parentTaskId,
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
      } finally {
        delegationDepth--;
      }
    },
  };
}
