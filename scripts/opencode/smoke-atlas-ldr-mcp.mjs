#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SERVER = path.join(ROOT, 'sveltekit-frontend/scripts/mcp/atlas-ldr-mcp.mjs');

function fail(message) {
  console.error(`[smoke-atlas-ldr] ${message}`);
  process.exitCode = 1;
}

async function run() {
  const child = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, ATLAS_LDR_DISABLE_ORNITH: 'true' },
  });

  const pending = new Map();
  let nextId = 1;
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const msg = JSON.parse(line);
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result);
    } catch {}
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  try {
    const init = await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-atlas-ldr', version: '1.0.0' },
    });
    if (init?.serverInfo?.name !== 'atlas-ldr') throw new Error('unexpected server name');

    const listed = await call('tools/list');
    const names = (listed?.tools || []).map((t) => t.name).sort();
    for (const required of ['atlas_deep_research', 'atlas_research_health']) {
      if (!names.includes(required)) throw new Error(`missing tool ${required}`);
    }

    child.kill();

    const selfTest = spawn(process.execPath, [SERVER, '--self-test'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, ATLAS_LDR_DISABLE_ORNITH: 'true' },
    });
    let output = '';
    selfTest.stdout.on('data', (chunk) => { output += chunk.toString(); });
    const exitCode = await new Promise((resolve) => selfTest.on('exit', resolve));
    if (exitCode !== 0) throw new Error(`self-test exited ${exitCode}`);
    const payload = JSON.parse(output);
    if (!payload.ok || payload.status !== 'LDR_CONTEXT_COMPILED') throw new Error('self-test payload failed');

    console.log(JSON.stringify({
      ok: true,
      protocol: 'MCP_STDIO_PROVEN',
      tools: names,
      deterministicSelfTest: payload,
      writesPerformed: false,
    }, null, 2));
  } finally {
    if (!child.killed) child.kill();
  }
}

run().catch((error) => fail(error.stack || error.message));
