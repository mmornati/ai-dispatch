import { z } from "zod";
import { TaskQueue } from "../queue/task-queue.js";

const TaskListSchema = z.object({
  status: z.enum(["queued", "running", "completed", "failed", "cancelled"]).optional(),
  dagRunId: z.string().optional(),
});

export function createTaskListTool(taskQueue: TaskQueue) {
  return {
    name: "task/list",
    description: "List tasks with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["queued", "running", "completed", "failed", "cancelled"],
          description: "Filter by task status",
        },
        dagRunId: {
          type: "string",
          description: "Filter by DAG run ID",
        },
      },
    },
    handler: async (args: unknown) => {
      const parsed = TaskListSchema.parse(args ?? {});
      const tasks = await taskQueue.listTasks({
        status: parsed.status,
        dagRunId: parsed.dagRunId,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              tasks.map((t) => ({
                id: t.id,
                agentName: t.agentName,
                status: t.status,
                createdAt: t.createdAt,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
  };
}
