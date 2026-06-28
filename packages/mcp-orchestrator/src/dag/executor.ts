import { DAGDefinition, DAGRun, DAGRunStatus, NodeRunStatus } from "./types.js";
import { getReadyNodes } from "./scheduler.js";
import { TaskQueue } from "../queue/task-queue.js";
import { RetryHandler } from "../mirror/retry-handler.js";

export interface DAGExecutorOptions {
  taskQueue: TaskQueue;
  retryHandler?: RetryHandler;
  onNodeComplete?: (dagRunId: string, nodeId: string, status: NodeRunStatus) => void;
  onDAGComplete?: (dagRunId: string, status: DAGRunStatus) => void;
}

export class DAGExecutor {
  private runs = new Map<string, DAGRun>();
  private options: DAGExecutorOptions;

  constructor(options: DAGExecutorOptions) {
    this.options = options;
  }

  async execute(dag: DAGDefinition): Promise<DAGRun> {
    const run: DAGRun = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      definitionId: dag.id,
      status: "running",
      nodeStatuses: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    for (const [nodeId] of dag.nodes) {
      run.nodeStatuses.set(nodeId, "pending");
    }

    this.runs.set(run.id, run);
    await this.tick(dag, run);
    return run;
  }

  private async tick(dag: DAGDefinition, run: DAGRun): Promise<void> {
    const ready = getReadyNodes(dag, run);

    if (ready.length === 0) {
      const allDone = Array.from(run.nodeStatuses.values()).every(
        (s) => s === "completed" || s === "skipped" || s === "failed"
      );
      if (allDone) {
        const hasHardFailure = Array.from(run.nodeStatuses.entries()).some(
          ([nodeId, s]) => {
            if (s !== "failed") return false;
            const node = dag.nodes.get(nodeId);
            return !node?.continueOnError;
          }
        );
        run.status = hasHardFailure ? "failed" : "completed";
        run.updatedAt = Date.now();
        this.options.onDAGComplete?.(run.id, run.status);
      }
      return;
    }

    const promises = ready.map((nodeId) => this.executeNode(dag, run, nodeId));
    await Promise.all(promises);
    await this.tick(dag, run);
  }

  private async executeNode(
    dag: DAGDefinition,
    run: DAGRun,
    nodeId: string
  ): Promise<void> {
    const node = dag.nodes.get(nodeId);
    if (!node) return;

    run.nodeStatuses.set(nodeId, "running");
    run.updatedAt = Date.now();

    try {
      console.error(`[DAG] executeNode ${nodeId}: enqueueing task for agent "${node.agent}"`);
      let task = await this.options.taskQueue.enqueue({
        agentName: node.agent,
        input: { dagNodeId: nodeId, dagRunId: run.id, input: node.input },
        dagRunId: run.id,
      });
      console.error(`[DAG] executeNode ${nodeId}: task ${task.id} enqueued, status=${task.status}`);

      task = await this.options.taskQueue.waitForCompletion(task.id);
      console.error(`[DAG] executeNode ${nodeId}: task completed, status=${task.status}, output keys=${Object.keys(task.output ?? {})}`);

      if (this.options.retryHandler && task.status === "completed") {
        console.error(`[DAG] executeNode ${nodeId}: running mirror...`);
        task = await this.options.retryHandler.runWithMirror(task);
        console.error(`[DAG] executeNode ${nodeId}: mirror done, task status=${task.status}`);
      }

      const status: NodeRunStatus =
        task.status === "completed" ? "completed" : "failed";
      console.error(`[DAG] executeNode ${nodeId}: final status=${status} (task.status=${task.status})`);
      run.nodeStatuses.set(nodeId, status);
      run.updatedAt = Date.now();
      this.options.onNodeComplete?.(run.id, nodeId, status);
    } catch (err) {
      console.error(`[DAG] executeNode error for ${nodeId}:`, err);
      run.nodeStatuses.set(nodeId, "failed");
      run.updatedAt = Date.now();
      this.options.onNodeComplete?.(run.id, nodeId, "failed");
    }
  }

  getRun(runId: string): DAGRun | undefined {
    return this.runs.get(runId);
  }
}
