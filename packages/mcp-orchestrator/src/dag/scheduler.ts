import { DAGDefinition, DAGRun, NodeRunStatus, topologicalSort } from "./types.js";

export interface ExecutionBatch {
  batchId: number;
  nodeIds: string[];
}

export function scheduleDAG(dag: DAGDefinition): ExecutionBatch[] {
  const sorted = topologicalSort(dag);
  const nodeLevel = new Map<string, number>();
  const batches: ExecutionBatch[] = [];

  for (const nodeId of sorted) {
    const node = dag.nodes.get(nodeId);
    if (!node) continue;

    let level = 0;
    if (node.dependsOn.length > 0) {
      level = Math.max(...node.dependsOn.map((d) => nodeLevel.get(d) ?? 0)) + 1;
    }
    nodeLevel.set(nodeId, level);

    if (!batches[level]) batches[level] = { batchId: level, nodeIds: [] };
    batches[level].nodeIds.push(nodeId);
  }

  return batches;
}

export function getReadyNodes(
  dag: DAGDefinition,
  run: DAGRun
): string[] {
  const ready: string[] = [];

  for (const [nodeId, nodeStatus] of run.nodeStatuses) {
    if (nodeStatus !== "pending") continue;

    const node = dag.nodes.get(nodeId);
    if (!node) continue;

    const allDepsComplete = node.dependsOn.every((depId) => {
      const depStatus = run.nodeStatuses.get(depId);
      if (!depStatus) return false;
      if (depStatus === "failed" && !dag.nodes.get(depId)?.continueOnError) return false;
      return depStatus === "completed" || depStatus === "skipped";
    });

    if (allDepsComplete) ready.push(nodeId);
  }

  return ready;
}
