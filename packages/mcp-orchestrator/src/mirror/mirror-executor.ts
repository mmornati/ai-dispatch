import { AgentLoader } from "../loader/agent-loader.js";
import { TaskQueue } from "../queue/task-queue.js";
import { Task } from "../schemas/task.js";

export interface MirrorResult {
  status: "pass" | "fail" | "needs-revision";
  feedback: string;
}

export class MirrorExecutor {
  private agentLoader: AgentLoader;
  private taskQueue: TaskQueue;

  constructor(agentLoader: AgentLoader, taskQueue: TaskQueue) {
    this.agentLoader = agentLoader;
    this.taskQueue = taskQueue;
  }

  async executeMirror(primaryTask: Task): Promise<MirrorResult | null> {
    const agentConfig = await this.agentLoader.getAgent(primaryTask.agentName);

    if (!agentConfig?.mirror) {
      return null;
    }

    const mirrorAgentName = agentConfig.mirror;

    const mirrorConfig = await this.agentLoader.getAgent(mirrorAgentName);
    if (!mirrorConfig) {
      console.warn(
        `Mirror agent "${mirrorAgentName}" not found for "${primaryTask.agentName}"`
      );
      return null;
    }

    try {
      console.error(`[Mirror] executing mirror for ${primaryTask.id} (agent=${primaryTask.agentName}, mirror=${mirrorAgentName})`);
      const mirrorTask = await this.taskQueue.enqueue({
        agentName: mirrorAgentName,
        input: {
          type: "audit",
          primaryAgent: primaryTask.agentName,
          primaryInput: primaryTask.input,
          primaryOutput: primaryTask.output,
        },
        parentTaskId: primaryTask.id,
      });
      console.error(`[Mirror] mirror task ${mirrorTask.id} enqueued`);

      const completed = await this.taskQueue.waitForCompletion(mirrorTask.id);
      console.error(`[Mirror] mirror task completed, status=${completed.status}, output=${JSON.stringify(completed.output).slice(0, 300)}`);

      const output = completed.output as Record<string, unknown> | undefined;
      const llmContent = (output?.output as string) ?? JSON.stringify(output ?? {});

      let status: "pass" | "fail" | "needs-revision" = "fail";
      let feedback = llmContent;

      try {
        const cleaned = llmContent.replace(/```(?:json)?\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.status === "pass" || parsed.status === "fail" || parsed.status === "needs-revision") {
          status = parsed.status;
        }
        if (parsed.feedback) feedback = parsed.feedback;
      } catch {
        const lower = llmContent.toLowerCase();
        if (lower.includes("pass")) status = "pass";
        if (lower.includes("needs-revision")) status = "needs-revision";
      }

      const result: MirrorResult = { status, feedback };

      console.error(`[Mirror] result: status=${result.status}, setting meta on primary task`);
      await this.taskQueue.setTaskMeta(primaryTask.id, {
        mirrorStatus: result.status,
      });

      return result;
    } catch (err) {
      console.error(`Mirror execution failed for task ${primaryTask.id}:`, err);
      return {
        status: "fail",
        feedback: `Mirror execution error: ${(err as Error).message}`,
      };
    }
  }
}
