declare module '@modelcontextprotocol/sdk/server/mcp.js' {
  export interface McpToolRegistration {
    description?: string;
    inputSchema?: any;
    annotations?: Record<string, unknown>;
  }

  export interface McpServer {
    registerTool(name: string, registration: McpToolRegistration, handler: any): void;
  }
}
