#!/usr/bin/env node
/**
 * MCP Server Launcher
 * Starts the TRACE MCP server for Gemma4 tool-calling agent
 * Port: 8788
 * Transport: stdio (managed by FastMCP)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..', '..');
const svelteKitDir = join(workspaceRoot, 'sveltekit-frontend');

console.log(`🚀 Starting MCP TRACE Server...`);
console.log(`   Workspace: ${workspaceRoot}`);
console.log(`   SvelteKit: ${svelteKitDir}`);
console.log('');

// Check if tsx is available (required for TS execution)
let tsRunner = 'tsx';
try {
  await import('tsx');
} catch (e) {
  console.warn('⚠️  tsx not found, falling back to ts-node');
  tsRunner = 'ts-node';
}

console.log(`📦 Using TS runner: ${tsRunner}`);
console.log('');

// Spawn the MCP server via tsx/ts-node
const mcp = spawn(tsRunner, [
  'src/mcp/server.ts',
], {
  cwd: svelteKitDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'development',
    MCP_PORT: '8788',
    MCP_LOG_LEVEL: 'info',
  },
});

let serverReady = false;

// Monitor stdout for readiness signal
mcp.stdout.on('data', (data) => {
  const output = data.toString().trim();
  console.log(`[MCP] ${output}`);

  if (output.includes('listening') || output.includes('ready') || output.includes('Started')) {
    serverReady = true;
    console.log('');
    console.log('✅ MCP Server is ready!');
    console.log('');
    console.log('📌 MCP Endpoints:');
    console.log('   • TRACE tools: http://localhost:8788/tools');
    console.log('   • Gemma4 agent: POST http://localhost:8788/agent');
    console.log('');
    console.log('🔗 Integration points:');
    console.log('   • SvelteKit /api/ai/agent routes');
    console.log('   • OpenAI-compatible /api/v1/chat/completions');
    console.log('   • VS Code Cursor/Cline IDE extensions');
    console.log('');
    console.log('💡 To debug: connect debugger to ws://127.0.0.1:9229');
    console.log('');
  }
});

// Monitor stderr for errors
mcp.stderr.on('data', (data) => {
  const output = data.toString().trim();
  console.error(`[MCP ERR] ${output}`);
});

// Handle process exit
mcp.on('exit', (code, signal) => {
  if (code === 0) {
    console.log('✅ MCP Server stopped cleanly');
    process.exit(0);
  } else {
    console.error(`❌ MCP Server exited with code ${code} (signal: ${signal})`);
    process.exit(1);
  }
});

// Handle parent process termination
process.on('SIGTERM', () => {
  console.log('');
  console.log('Shutting down MCP Server...');
  mcp.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down MCP Server...');
  mcp.kill('SIGINT');
});

console.log('⏳ Waiting for MCP Server to start...');
console.log('   (This may take 10-20 seconds on first run)');
console.log('');

// Timeout if server doesn't start within 60 seconds
setTimeout(() => {
  if (!serverReady) {
    console.error('❌ MCP Server failed to start within 60 seconds');
    console.error('');
    console.error('Troubleshooting:');
    console.error('  1. Verify tsx/ts-node is installed: npm install -g tsx');
    console.error('  2. Check TypeScript compilation: npm run typecheck');
    console.error('  3. Verify Redis is running: docker start legal-ai-redis');
    console.error('  4. View logs: tail -f logs/mcp-server.log');
    mcp.kill();
    process.exit(1);
  }
}, 60000);