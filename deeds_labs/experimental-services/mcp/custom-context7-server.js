#!/usr/bin/env node

/**
 * Custom Context7 MCP Server Placeholder
 * This file redirects to the actual MCP multicore server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the actual MCP server path
const actualServerPath = join(__dirname, '..', 'scripts', 'mcp-multicore-server.mjs');

console.log('🔄 Redirecting to actual MCP server:', actualServerPath);

// Spawn the actual server with all arguments passed through
const serverProcess = spawn('node', [actualServerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
});

// Forward exit codes
serverProcess.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle termination signals
process.on('SIGINT', () => {
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  serverProcess.kill('SIGTERM');
});
