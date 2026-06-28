#!/usr/bin/env node
import { AgentLoader } from "../loader/agent-loader.js";
import { KnowledgeBase } from "../kb/layout.js";
import { TaskQueue } from "../queue/task-queue.js";
import { InMemoryPersistence } from "../queue/persistence.js";
import { DAGRunner } from "../dag/runner.js";
import { EventTriggerRunner } from "../ci/trigger-runner.js";

const args = process.argv.slice(2);
const eventIndex = args.indexOf("--event");
const payloadIndex = args.indexOf("--payload");

const event = eventIndex >= 0 ? args[eventIndex + 1] : undefined;
const payload = payloadIndex >= 0 ? JSON.parse(args[payloadIndex + 1]) : undefined;

if (!event) {
  console.error("Usage: agent-runner --event <event> [--payload <json>]");
  process.exit(1);
}

const projectRoot = process.cwd();
const kb = new KnowledgeBase(projectRoot);
const agentLoader = new AgentLoader(projectRoot);
const taskQueue = new TaskQueue(new InMemoryPersistence());
const dagRunner = new DAGRunner(taskQueue, kb);

const runner = new EventTriggerRunner(agentLoader, dagRunner);

runner.handleEvent(event, payload).catch((err) => {
  console.error("Event handling failed:", err);
  process.exit(1);
});
