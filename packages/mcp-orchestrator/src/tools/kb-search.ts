import { z } from "zod";
import { KnowledgeBase } from "../kb/layout.js";

const KBSearchSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
});

export function createKBSearchTool(kb: KnowledgeBase) {
  return {
    name: "kb/search",
    description: "Search the knowledge base for files containing a pattern",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Text pattern to search for" },
        path: {
          type: "string",
          description: "Subdirectory to search within (default: root)",
        },
      },
      required: ["pattern"],
    },
    handler: async (args: unknown) => {
      const parsed = KBSearchSchema.parse(args);
      const results = await kb.search(parsed.pattern, parsed.path);

      return {
        content: [
          {
            type: "text",
            text:
              results.length > 0
                ? results.map((r) => `_kb/${r}`).join("\n")
                : "No matches found",
          },
        ],
      };
    },
  };
}
