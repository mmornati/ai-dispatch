import { AgentLoader } from "../loader/agent-loader.js";
import { TaskQueue } from "../queue/task-queue.js";
import { MirrorExecutor } from "./mirror-executor.js";
import { Task } from "../schemas/task.js";

export class RetryHandler {
  private mirrorExecutor: MirrorExecutor;
  private taskQueue: TaskQueue;
  private agentLoader: AgentLoader;

  constructor(
    mirrorExecutor: MirrorExecutor,
    taskQueue: TaskQueue,
    agentLoader: AgentLoader
  ) {
    this.mirrorExecutor = mirrorExecutor;
    this.taskQueue = taskQueue;
    this.agentLoader = agentLoader;
  }

  async runWithMirror(task: Task): Promise<Task> {
    const config = await this.agentLoader.getAgent(task.agentName);
    if (!config?.mirror) return task;

    const maxRetries = config.maxRetries ?? 2;
    let currentTask = task;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const mirrorResult = await this.mirrorExecutor.executeMirror(currentTask);
      if (!mirrorResult) break;

      if (mirrorResult.status === "pass") break;

      if (mirrorResult.status === "needs-revision" && attempt < maxRetries) {
        currentTask = await this.taskQueue.enqueue({
          agentName: task.agentName,
          input: {
            ...(task.input as object),
            _retryAttempt: attempt + 1,
            _mirrorFeedback: mirrorResult.feedback,
          },
          parentTaskId: task.parentTaskId,
          dagRunId: task.dagRunId,
        });
        currentTask = await this.taskQueue.waitForCompletion(currentTask.id);
        continue;
      }

      if (mirrorResult.status === "fail") {
        await this.taskQueue.updateStatus(currentTask.id, "failed", {
          error: mirrorResult.feedback,
        });
        currentTask = (await this.taskQueue.getTask(currentTask.id))!;
        break;
      }
    }

    return currentTask;
  }
}

export function createRetryHandler(
  mirrorExecutor: MirrorExecutor,
  taskQueue: TaskQueue,
  agentLoader: AgentLoader
): RetryHandler {
  return new RetryHandler(mirrorExecutor, taskQueue, agentLoader);
}
