#!/usr/bin/env node
/**
 * Phase 76: ACP MCP Server
 * Exposes ACP Tool Registry to VS Code via MCP protocol
 *
 * Usage:
 *   node scripts/phase76-acp-server.mjs
 *
 * Configuration in .vscode/settings.json:
 * {
 *   "mcp.servers": {
 *     "phase76-acp": {
 *       "command": "node",
 *       "args": ["scripts/phase76-acp-server.mjs"],
 *       "env": { "MCP_PORT": "3003" }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
const ACP_API_URL = process.env.ACP_API_URL || 'http://localhost:5175/api/acp';
const MCP_PORT = process.env.MCP_PORT || 3003;

// Create MCP server
const server = new Server(
	{
		name: 'phase76-acp',
		version: '1.0.0'
	},
	{
		capabilities: {
			tools: {},
			resources: {}
		}
	}
);

/**
 * List all ACP tools
 * MCP handler for: tools/list
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
	try {
		const response = await fetch(`${ACP_API_URL}/tools`);
		if (!response.ok) {
			throw new Error(`ACP API error: ${response.status}`);
		}

		const data = await response.json();

		// Convert ACP tools to MCP tool format
		const tools = data.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: tool.inputSchema
		}));

		console.error(`[ACP MCP] Listed ${tools.length} tools`);

		return { tools };
	} catch (error) {
		console.error('[ACP MCP] Error listing tools:', error);
		return { tools: [] };
	}
});

/**
 * Execute ACP tool
 * MCP handler for: tools/call
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	try {
		console.error(`[ACP MCP] Executing tool: ${name}`);

		const response = await fetch(`${ACP_API_URL}/execute`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tool: name, args })
		});

		if (!response.ok) {
			throw new Error(`ACP API error: ${response.status}`);
		}

		const result = await response.json();

		console.error(`[ACP MCP] Tool executed successfully: ${name}`);

		// Return result in MCP format
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(result.result, null, 2)
				}
			],
			isError: !result.success
		};
	} catch (error) {
		console.error(`[ACP MCP] Error executing tool ${name}:`, error);

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{
							error: error instanceof Error ? error.message : 'Unknown error',
							tool: name
						},
						null,
						2
					)
				}
			],
			isError: true
		};
	}
});

/**
 * List available resources (tool documentation)
 * MCP handler for: resources/list
 */
server.setRequestHandler('resources/list', async () => {
	return {
		resources: [
			{
				uri: 'acp://tools/documentation',
				name: 'ACP Tool Registry Documentation',
				description: 'Complete documentation for all 14 ACP tools',
				mimeType: 'text/markdown'
			},
			{
				uri: 'acp://tools/stats',
				name: 'Tool Statistics',
				description: 'Usage statistics and performance metrics',
				mimeType: 'application/json'
			}
		]
	};
});

/**
 * Read resource content
 * MCP handler for: resources/read
 */
server.setRequestHandler('resources/read', async (request) => {
	const { uri } = request.params;

	if (uri === 'acp://tools/documentation') {
		// Return tool documentation
		const response = await fetch(`${ACP_API_URL}/tools`);
		const data = await response.json();

		const markdown = `# ACP Tool Registry

Total Tools: ${data.count}

## Available Tools

${data.tools
	.map(
		(tool) => `### ${tool.name}
${tool.description}

**Category:** ${tool.category}

**Input Schema:**
\`\`\`json
${JSON.stringify(tool.inputSchema, null, 2)}
\`\`\`

**Output Schema:**
\`\`\`json
${JSON.stringify(tool.outputSchema, null, 2)}
\`\`\`
`
	)
	.join('\n---\n\n')}`;

		return {
			contents: [
				{
					uri,
					mimeType: 'text/markdown',
					text: markdown
				}
			]
		};
	}

	if (uri === 'acp://tools/stats') {
		const response = await fetch(`${ACP_API_URL}/tools`);
		const data = await response.json();

		return {
			contents: [
				{
					uri,
					mimeType: 'application/json',
					text: JSON.stringify(data.stats, null, 2)
				}
			]
		};
	}

	throw new Error(`Unknown resource: ${uri}`);
});

// Start MCP server
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);

	console.error('╔══════════════════════════════════════════════════════╗');
	console.error('║   Phase 76: ACP MCP Server                           ║');
	console.error('║   Agent Communication Protocol - Tool Registry       ║');
	console.error('╚══════════════════════════════════════════════════════╝');
	console.error('');
	console.error(`🔧 ACP API URL: ${ACP_API_URL}`);
	console.error(`📡 MCP Port: ${MCP_PORT}`);
	console.error(`🚀 Server running on stdio`);
	console.error('');
	console.error('Available tools:');
	console.error('  - knowledge:search, knowledge:index, knowledge:synthesize');
	console.error('  - code:analyze, code:search, code:ast');
	console.error('  - llm:generate, llm:embed');
	console.error('  - web:crawl, web:search, web:scrape');
	console.error('  - agent:delegate, agent:discover, agent:broadcast');
	console.error('  - fix:svelte5, fix:suggest');
	console.error('  - phase89:cluster, phase89:summarize, phase89:tag');
	console.error('');
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
