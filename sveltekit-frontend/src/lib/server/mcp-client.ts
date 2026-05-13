import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ENV } from "$lib/server/env.server.js";

const TRACE_MCP_URL = ENV.TRACE_MCP_URL;

export class TraceMcpClient {
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;

  async connect() {
    if (this.client) return this.client;

    this.transport = new SSEClientTransport(new URL(`${TRACE_MCP_URL}/sse`));
    this.client = new Client(
      { name: "trace-admin-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
    return this.client;
  }

  async callTool(name: string, args: any = {}) {
    const client = await this.connect();
    const result = await client.callTool({
      name,
      arguments: args
    });
    return result;
  }

  async close() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.client = null;
    }
  }
}

export const traceMcpClient = new TraceMcpClient();
