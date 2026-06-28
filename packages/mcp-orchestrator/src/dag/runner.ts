import { DAGDefinition, DAGRun, DAGRunStatus, buildDAG, topologicalSort } from "./types.js";
import { DAGExecutor } from "./executor.js";
import { DAGStep } from "../schemas/agent-config.js";
import { TaskQueue } from "../queue/task-queue.js";
import { KnowledgeBase } from "../kb/layout.js";
import { RetryHandler } from "../mirror/retry-handler.js";

export class DAGRunner {
  private executor: DAGExecutor;
  private kb: KnowledgeBase;

  constructor(taskQueue: TaskQueue, kb: KnowledgeBase, retryHandler?: RetryHandler) {
    this.executor = new DAGExecutor({ taskQueue, retryHandler });
    this.kb = kb;
  }

  async runDAG(steps: DAGStep[], options?: { name?: string }): Promise<DAGRun> {
    const dag = buildDAG(steps);
    dag.name = options?.name;

    await this.kb.write(
      `sessions/${dag.id}/definition.json`,
      JSON.stringify({ name: dag.name, steps }, null, 2)
    );

    return this.executor.execute(dag);
  }

  getRun(runId: string): DAGRun | undefined {
    return this.executor.getRun(runId);
  }

  validateDAG(steps: DAGStep[]): { valid: boolean; error?: string } {
    try {
      const dag = buildDAG(steps);
      topologicalSort(dag);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }
}
