import { DAGStep } from "../schemas/agent-config.js";

export interface DAGNode {
  id: string;
  agent: string;
  input?: string;
  continueOnError: boolean;
  dependsOn: string[];
}

export interface DAGDefinition {
  id: string;
  name?: string;
  nodes: Map<string, DAGNode>;
  entryPoints: string[];
}

export interface DAGRun {
  id: string;
  definitionId: string;
  status: DAGRunStatus;
  nodeStatuses: Map<string, NodeRunStatus>;
  createdAt: number;
  updatedAt: number;
}

export type DAGRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type NodeRunStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export function buildDAG(steps: DAGStep[]): DAGDefinition {
  const nodes = new Map<string, DAGNode>();
  const id = `dag-${Date.now()}`;

  for (const step of steps) {
    nodes.set(step.id, {
      id: step.id,
      agent: step.agent,
      input: step.input,
      continueOnError: step.continue_on_error ?? false,
      dependsOn: step.depends_on ?? [],
    });
  }

  const entryPoints = steps
    .filter((s) => !s.depends_on || s.depends_on.length === 0)
    .map((s) => s.id);

  return { id, name: undefined, nodes, entryPoints };
}

export function topologicalSort(dag: DAGDefinition): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(nodeId: string) {
    if (visiting.has(nodeId)) {
      throw new Error(`Cycle detected in DAG at node: ${nodeId}`);
    }
    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    const node = dag.nodes.get(nodeId);
    if (node) {
      for (const depId of node.dependsOn) {
        visit(depId);
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
  }

  for (const [nodeId] of dag.nodes) {
    if (!visited.has(nodeId)) visit(nodeId);
  }

  return order;
}
