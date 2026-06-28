import { z } from "zod";
import { KnowledgeBase } from "../kb/layout.js";

const KBWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export function createKBWriteTool(kb: KnowledgeBase) {
  return {
    name: "kb/write",
    description: "Write a file to the knowledge base",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path within _kb/" },
        content: { type: "string", description: "File content" },
      },
      required: ["path", "content"],
    },
    handler: async (args: unknown) => {
      const parsed = KBWriteSchema.parse(args);
      const fullPath = await kb.write(parsed.path, parsed.content);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ path: fullPath, status: "written" }),
          },
        ],
      };
    },
  };
}
