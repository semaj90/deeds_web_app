import express from 'express';
import { createServer } from 'http';
import { createMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const server = createMcpServer({
  name: 'multicore-mcp-server',
  version: '1.0.0',
});

const tools = [
  {
    name: 'search_codebase',
    description: 'Search the codebase for files and content',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      path: z.string().optional().describe('Path to search in'),
    }),
  },
  {
    name: 'analyze_code',
    description: 'Analyze code files for patterns and issues',
    inputSchema: z.object({
      file_path: z.string().describe('Path to analyze'),
      analysis_type: z.enum(['structure', 'patterns', 'issues']).optional(),
    }),
  },
  {
    name: 'validate_config',
    description: 'Validate project configuration files',
    inputSchema: z.object({
      config_path: z.string().describe('Path to config file'),
      config_type: z.enum(['json', 'yaml', 'typescript']).optional(),
    }),
  },
  {
    name: 'get_project_status',
    description: 'Get current project status and health',
    inputSchema: z.object({
      service: z.string().optional().describe('Specific service to check'),
    }),
  },
  {
    name: 'run_validation',
    description: 'Run validation checks on the project',
    inputSchema: z.object({
      check_type: z.enum(['type', 'lint', 'build', 'all']),
      project_path: z.string().optional().describe('Path to validate'),
    }),
  },
];

server.registerTools(tools);

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'multicore-mcp-server', version: '1.0.0' });
});

// MCP JSON-RPC endpoint
app.post('/mcp', async (req, res) => {
  try {
    const { jsonrpc, id, method, params } = req.body;

    if (method === 'initialize') {
      const result = {
        jsonrpc: '2.0',
        id: id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'multicore-mcp-server',
            version: '1.0.0',
          },
        },
      };
      res.json(result);
      return;
    }

    if (method === 'tools/list') {
      const result = {
        jsonrpc: '2.0',
        id: id,
        result: {