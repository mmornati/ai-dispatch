import { z } from "zod";
import { TaskQueue } from "../queue/task-queue.js";

const TaskStatusSchema = z.object({
  taskId: z.string().min(1),
});

export function createTaskStatusTool(taskQueue: TaskQueue) {
  return {
    name: "task/status",
    description: "Check the status of a task by ID",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to check" },
      },
      required: ["taskId"],
    },
    handler: async (args: unknown) => {
      const parsed = TaskStatusSchema.parse(args);
      const task = await taskQueue.getTask(parsed.taskId);

      if (!task) {
        return {
          content: [{ type: "text", text: `Task "${parsed.taskId}" not found` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: task.id,
              agentName: task.agentName,
              status: task.status,
              error: task.error ?? null,
              retryCount: task.retryCount,
              createdAt: task.createdAt,
              startedAt: task.startedAt ?? null,
              completedAt: task.completedAt ?? null,
              mirrorStatus: task.mirrorStatus ?? null,
              progress: task.progress ?? null,
              output: task.output ?? null,
            }),
          },
        ],
      };
    },
  };
}
