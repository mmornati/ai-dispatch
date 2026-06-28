import { AgentLoader } from "../loader/agent-loader.js";
import { TaskQueue } from "../queue/task-queue.js";
import { DAGRunner } from "../dag/runner.js";

export interface DelegationRequest {
  targetAgent: string;
  input: unknown;
  parentTaskId?: string;
  depth: number;
}

export class SubDelegator {
  private maxDepth: number;
  private agentLoader: AgentLoader;
  private taskQueue: TaskQueue;
  private dagRunner: DAGRunner;

  constructor(
    agentLoader: AgentLoader,
    taskQueue: TaskQueue,
    dagRunner: DAGRunner,
    maxDepth = 5
  ) {
    this.agentLoader = agentLoader;
    this.taskQueue = taskQueue;
    this.dagRunner = dagRunner;
    this.maxDepth = maxDepth;
  }

  async delegate(req: DelegationRequest): Promise<{ taskId: string; status: string }> {
    if (req.depth >= this.maxDepth) {
      throw new Error(
        `Max delegation depth (${this.maxDepth}) exceeded. Chain: ${req.targetAgent}`
      );
    }

    const config = await this.agentLoader.getAgent(req.targetAgent);
    if (!config) {
      throw new Error(`Target agent "${req.targetAgent}" not found`);
    }

    const task = await this.taskQueue.enqueue({
      agentName: req.targetAgent,
      input: req.input,
      parentTaskId: req.parentTaskId,
    });

    return { taskId: task.id, status: task.status };
  }
}
