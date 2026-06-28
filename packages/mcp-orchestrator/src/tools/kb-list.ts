import { z } from "zod";
import { KnowledgeBase } from "../kb/layout.js";

const KBListSchema = z.object({
  path: z.string().optional(),
});

export function createKBListTool(kb: KnowledgeBase) {
  return {
    name: "kb/list",
    description: "List files and directories in the knowledge base",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path within _kb/ (default: root)",
        },
      },
    },
    handler: async (args: unknown) => {
      const parsed = KBListSchema.parse(args ?? {});
      const entries = await kb.list(parsed.path);

      return {
        content: [
          {
            type: "text",
            text: entries.length > 0 ? entries.join("\n") : "(empty)",
          },
        ],
      };
    },
  };
}
