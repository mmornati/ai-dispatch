import { z } from "zod";
import { KnowledgeBase } from "../kb/layout.js";

const KBReadSchema = z.object({
  path: z.string().min(1),
});

export function createKBReadTool(kb: KnowledgeBase) {
  return {
    name: "kb/read",
    description: "Read a file from the knowledge base",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path within _kb/" },
      },
      required: ["path"],
    },
    handler: async (args: unknown) => {
      const parsed = KBReadSchema.parse(args);
      const content = await kb.read(parsed.path);

      if (content === null) {
        return {
          content: [{ type: "text", text: `File "_kb/${parsed.path}" not found` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: content }],
      };
    },
  };
}
