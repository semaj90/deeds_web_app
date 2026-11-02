#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRuntimeEnv } from '../src/lib/server/config/load-runtime-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadRuntimeEnv({ cwd: projectRoot, mode: 'development' });

process.argv[1] = path.resolve(projectRoot, 'src/mcp/trace-mcp-server.ts');
await import('../src/mcp/trace-mcp-server.ts');
