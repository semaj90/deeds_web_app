import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema, ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mcpTools } from '../mcp/index.js';

const server = new Server(
  {
    name: "deeds-legal-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Setup tool handlers for MCP server
 */
function setupToolHandlers() {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "cases:load",
        description: "Load legal cases with optional filtering",
        inputSchema: {
          type: "object",
          properties: {
            userId: { type: "string" },
            limit: { type: "number" },
            query: { type: "string" },
          },
        },
      },
      {
        name: "rag:search",
        description: "Perform a semantic search across legal documents and web",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            topK: { type: "number" },
          },
          required: ["query"],
        },
      },
      {
        name: "rag:index_page",
        description: "Index a web page for RAG knowledge",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
          },
          required: ["url"],
        },
      },
      {
        name: "playwright:browser_action",
        description: "Execute a browser action using Playwright",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "enum", enum: ["goto", "click", "fill", "screenshot"] },
            url: { type: "string" },
            selector: { type: "string" },
            value: { type: "string" },
          },
          required: ["action"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "cases:load": {
          const result = await mcpTools.cases.loadCases(args as any);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "rag:search": {
          const { query, topK } = args as { query: string; topK?: number };
          const result = await mcpTools.rag.webSearch(query, { topK });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "rag:index_page": {
          const { url } = args as { url: string };
          const result = await mcpTools.rag.indexWebPage(url);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }

        case "playwright:browser_action": {
          const { action, url, selector, value } = args as any;
          // In a real implementation, this would call a playwright service
          const mockResult = {
            success: true,
            action,
            timestamp: new Date().toISOString(),
            id: Math.random().toString(36).substring(7)
          };
          return { content: [{ type: "text", text: JSON.stringify(mockResult) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });
}

async function main() {
  setupToolHandlers();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Deeds Legal MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});



