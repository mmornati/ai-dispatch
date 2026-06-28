import { z } from "zod";

export const AgentParamSchema = z.record(z.string(), z.unknown()).optional();

export const ToolPermissionSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
});

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  model: z.object({
    id: z.string(),
    provider: z.string().optional(),
    params: AgentParamSchema,
  }),
  tools: z.array(z.string()).optional(),
  permissions: z
    .object({
      filesystem: z.array(z.string()).optional(),
      network: z.boolean().optional(),
      env: z.array(z.string()).optional(),
    })
    .optional(),
  mirror: z.string().optional(),
  modelPipeline: z
    .array(
      z.object({
        id: z.string(),
        modelId: z.string(),
        instructions: z.string().optional(),
        params: AgentParamSchema,
      })
    )
    .optional(),
  trigger: z
    .object({
      event: z.string(),
      filter: z.string().optional(),
    })
    .optional(),
  dag: z
    .array(
      z.object({
        id: z.string(),
        agent: z.string(),
        input: z.string().optional(),
        depends_on: z.array(z.string()).optional(),
        continue_on_error: z.boolean().optional(),
      })
    )
    .optional(),
  maxRetries: z.number().int().min(0).default(2),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const DAGStepSchema = z.object({
  id: z.string(),
  agent: z.string(),
  input: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  continue_on_error: z.boolean().optional(),
});

export type DAGStep = z.infer<typeof DAGStepSchema>;
