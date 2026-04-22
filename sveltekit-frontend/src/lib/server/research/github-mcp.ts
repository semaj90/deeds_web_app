import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ENV } from '$lib/server/env.server.js';

/**
 * github-mcp.ts — Read-only client for the official GitHub MCP server.
 * 
 * Provides high-level access to:
 * - repo file reads
 * - issue/PR search
 * - repo metadata
 * - code navigation
 */

let _githubClient: Client | null = null;
let _transport: StdioClientTransport | null = null;

export async function getGitHubMcpClient(): Promise<Client> {
  if (_githubClient) return _githubClient;

  if (!ENV.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required for GitHub MCP');
  }

  // Create transport — runs the GitHub MCP server via npx
  _transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      ...process.env,
      GITHUB_PERSONAL_ACCESS_TOKEN: ENV.GITHUB_TOKEN,
    }
  });

  _githubClient = new Client(
    { name: 'deeds-github-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await _githubClient.connect(_transport);
  console.log('[github-mcp] Connected to GitHub MCP server');

  return _githubClient;
}

/**
 * Execute a read-only tool on the GitHub MCP server.
 * Encforces read-only safety by checking tool name prefix.
 */
export async function callGitHubTool(toolName: string, args: any): Promise<any> {
  // Security check: only allow read-related tools
  const allowedPrefixes = ['get_', 'search_', 'list_', 'read_'];
  if (!allowedPrefixes.some(p => toolName.startsWith(p))) {
    throw new Error(`Unauthorized GitHub MCP action: ${toolName} (read-only lane)`);
  }

  const client = await getGitHubMcpClient();
  return client.callTool({
    name: toolName,
    arguments: args
  });
}

/**
 * Clean up the GitHub MCP server process.
 */
export async function closeGitHubMcp(): Promise<void> {
  if (_transport) {
    await _transport.close();
    _githubClient = null;
    _transport = null;
  }
}
