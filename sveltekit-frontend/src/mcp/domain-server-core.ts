import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export interface DomainToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface CreateDomainServerOptions {
  name: string;
  version?: string;
  tools: readonly DomainToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  authToken?: string;
}

export function createDomainServer(options: CreateDomainServerOptions): Server {
  const allowedTools = new Set(options.tools.map((tool) => tool.name));
  if (allowedTools.size !== options.tools.length) {
    throw new Error(`MCP_DOMAIN_DUPLICATE_TOOL_NAME:${options.name}`);
  }

  const server = new Server(
    {
      name: options.name,
      version: options.version ?? '1.0.0',
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: options.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as any,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    if (!allowedTools.has(name)) {
      return {
        content: [{ type: 'text', text: `Error: MCP_DOMAIN_TOOL_NOT_EXPOSED:${name}` }],
        isError: true,
      };
    }

    if (options.authToken) {
      const supplied = request.params?._meta?.authToken ?? args._authToken;
      if (supplied !== options.authToken) {
        return {
          content: [{ type: 'text', text: 'Error: Unauthorized: invalid or missing MCP auth token' }],
          isError: true,
        };
      }
    }

    try {
      return await options.callTool(name, args) as any;
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function serveDomainServer(server: Server, label: string): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${label} running on stdio`);
}
