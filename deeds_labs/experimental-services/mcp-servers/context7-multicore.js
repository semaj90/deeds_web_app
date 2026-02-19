#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

// Multicore server for Context7 (minimal, similar to context7-server.js)
class Context7MulticoreServer {
  constructor() {
	this.server = new Server(
	  {
		name: 'context7-multicore',
		version: '1.0.0',
	  },
	  {
		capabilities: {
		  tools: {},
		},
		transport: new StdioServerTransport(),
	  }
	);

	this.setupToolHandlers();
	this.setupErrorHandling();
  }

  setupErrorHandling() {
	this.server.onerror = (error) => {
	  console.error('[Context7 Multicore MCP Server Error]:', error);
	};

	process.on('SIGINT', async () => {
	  console.log('\n[Context7 Multicore MCP Server] Shutting down gracefully...');
	  try {
		await this.server.close();
	  } catch (err) {
		// ignore close errors on shutdown
	  }
	  process.exit(0);
	});
  }

  setupToolHandlers() {
	this.server.setRequestHandler(ListToolsRequestSchema, async () => {
	  return {
		tools: [
		  {
			name: 'minio_status',
			description: 'Check MinIO server status and health',
			inputSchema: {
			  type: 'object',
			  properties: {},
			},
		  },
		  {
			name: 'minio_create_bucket',
			description: 'Create a new bucket in MinIO for legal documents',
			inputSchema: {
			  type: 'object',
			  properties: {
				bucketName: {
				  type: 'string',
				  description: 'Name of the bucket to create (legal-docs, evidence, contracts, case-files)',
				},
			  },
			  required: ['bucketName'],
			},
		  },
		  {
			name: 'minio_list_buckets',
			description: 'List all buckets in MinIO',
			inputSchema: {
			  type: 'object',
			  properties: {},
			},
		  },
		  {
			name: 'context7_search_library',
			description: 'Search for library documentation using Context7',
			inputSchema: {
			  type: 'object',
			  properties: {
				query: {
				  type: 'string',
				  description: 'Library or framework to search for',
				},
			  },
			  required: ['query'],
			},
		  },
		  {
			name: 'legal_ai_integration_status',
			description: 'Check the status of Legal AI platform integration',
			inputSchema: {
			  type: 'object',
			  properties: {},
			},
		  },
		],
	  };
	});

	// Example placeholder for CallTool requests (returns an error by default)
	this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
	  return {
		error: {
		  code: ErrorCode.Unimplemented,
		  message: `No implementation for tool call: ${req.tool?.name || '<unknown>'}`,
		},
	  };
	});
  }
}

// instantiate server
new Context7MulticoreServer();
