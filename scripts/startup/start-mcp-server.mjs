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
import fs from 'node:fs';
import { loadRuntimeEnv } from '../../sveltekit-frontend/src/lib/server/config/load-runtime-env.js';
import { parseTraceMcpEnv } from '../../sveltekit-frontend/src/lib/server/config/trace-mcp-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, '..', '..');
const svelteKitDir = join(workspaceRoot, 'sveltekit-frontend');

function resolveTsRunner() {
  const tsxCliCandidates = [
    join(svelteKitDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    join(workspaceRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  ];

  for (const candidate of tsxCliCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        command: process.execPath,
        argsPrefix: [candidate],
        label: `${process.execPath} ${candidate}`,
      };
    }
  }

  const fallbackCandidates = process.platform === 'win32'
    ? [
        join(svelteKitDir, 'node_modules', '.bin', 'ts-node.cmd'),
        join(workspaceRoot, 'node_modules', '.bin', 'ts-node.cmd'),
      ]
    : [
        join(svelteKitDir, 'node_modules', '.bin', 'ts-node'),
        join(workspaceRoot, 'node_modules', '.bin', 'ts-node'),
      ];

  for (const candidate of fallbackCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        command: candidate,
        argsPrefix: [],
        label: candidate,
      };
    }
  }

  return {
    command: 'tsx',
    argsPrefix: [],
    label: 'tsx',
  };
}

console.log(`🚀 Starting MCP TRACE Server...`);
console.log(`   Workspace: ${workspaceRoot}`);
console.log(`   SvelteKit: ${svelteKitDir}`);
console.log('');

loadRuntimeEnv({ cwd: svelteKitDir, mode: process.env.DOTENV_LOAD_MODE || 'development' });
const traceEnv = parseTraceMcpEnv(process.env);

const tsRunner = resolveTsRunner();

console.log(`📦 Using TS runner: ${tsRunner.label}`);
console.log(`🔧 Env present: TRACE_MCP_URL=${Boolean(traceEnv.TRACE_MCP_URL)} DATABASE_URL=${Boolean(traceEnv.DATABASE_URL)} REDIS_URL=${Boolean(process.env.REDIS_URL || process.env.VALKEY_URL)}`);
console.log('');

// Spawn the MCP server via tsx/ts-node
const mcp = spawn(tsRunner.command, [
  ...tsRunner.argsPrefix,
  'src/mcp/trace-mcp-server.ts',
], {
  cwd: svelteKitDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development',
    DOTENV_LOAD_MODE: process.env.DOTENV_LOAD_MODE || 'development',
    OTEL_ENABLED: process.env.OTEL_ENABLED || 'true',
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || 'trace-mcp-server',
    TRACE_MCP_HOST: traceEnv.TRACE_MCP_HOST,
    TRACE_MCP_PORT: String(traceEnv.TRACE_MCP_PORT),
    TRACE_MCP_URL: traceEnv.TRACE_MCP_URL,
    MCP_PORT: String(traceEnv.TRACE_MCP_PORT),
    MCP_LOG_LEVEL: process.env.MCP_LOG_LEVEL || 'info',
    FRONTEND_ROOT: process.env.FRONTEND_ROOT || svelteKitDir,
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
    console.log(`   • TRACE health: ${traceEnv.TRACE_MCP_URL}/health`);
    console.log(`   • TRACE MCP: POST ${traceEnv.TRACE_MCP_URL}/mcp`);
    console.log('');
    console.log('🔗 Integration points:');
    console.log('   • SvelteKit /api/ai/agent routes');
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
    console.error('  1. Verify local dependencies are installed: npm install');
    console.error('  2. Check TypeScript compilation: npm run typecheck');
    console.error('  3. Verify the trace entrypoint imports resolve under tsx');
    console.error('  4. Verify Redis is running: docker start legal-ai-valkey');
    console.error('  5. View logs: tail -f logs/mcp-server.log');
    mcp.kill();
    process.exit(1);
  }
}, 60000);
