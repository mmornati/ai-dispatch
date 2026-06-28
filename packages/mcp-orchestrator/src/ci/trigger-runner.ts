import { z } from "zod";
import { AgentLoader } from "../loader/agent-loader.js";
import { DAGRunner } from "../dag/runner.js";

const TriggerSchema = z.object({
  event: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export class EventTriggerRunner {
  private agentLoader: AgentLoader;
  private dagRunner: DAGRunner;

  constructor(agentLoader: AgentLoader, dagRunner: DAGRunner) {
    this.agentLoader = agentLoader;
    this.dagRunner = dagRunner;
  }

  async handleEvent(eventType: string, payload?: Record<string, unknown>): Promise<void> {
    const agents = await this.agentLoader.loadAll();

    const matchedAgents = Array.from(agents.values()).filter((a) => {
      if (!a.trigger) return false;
      const trigger = a.trigger;
      if (trigger.event !== eventType) return false;
      if (trigger.filter && payload) {
        return this.matchesFilter(trigger.filter, payload);
      }
      return true;
    });

    for (const agent of matchedAgents) {
      if (agent.dag && agent.dag.length > 0) {
        await this.dagRunner.runDAG(agent.dag, { name: agent.name });
      }
    }
  }

  private matchesFilter(
    filter: string,
    payload: Record<string, unknown>
  ): boolean {
    const [key, expected] = filter.split("=");
    if (!key || !expected) return true;
    const actual = this.getNestedValue(payload, key.trim());
    return String(actual) === expected.trim();
  }

  private getNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    return path.split(".").reduce((acc, part) => {
      if (acc && typeof acc === "object") {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, obj as unknown);
  }
}
