#!/usr/bin/env node
/**
 * ldr-mcp-health.mjs
 *
 * Read-only stdio health probe for the Local Deep Research MCP server.
 * Launches the MCP process, sends initialize + tools/list, and prints a
 * compact JSON health summary.
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const serverPath = path.resolve(repoRoot, 'sveltekit-frontend', 'scripts', 'mcp', 'ldr-mcp.mjs');

const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout='));
const timeoutMs = Number(timeoutArg ? timeoutArg.split('=', 2)[1] : 8000) || 8000;

function makeRpcClient(child) {
  let nextId = 1;
  const waiters = new Map();

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg && Object.prototype.hasOwnProperty.call(msg, 'id')) {
      const pending = waiters.get(msg.id);
      if (pending) {
        waiters.delete(msg.id);
        pending.resolve(msg);
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  return {
    request(method, params = {}) {
      const id = nextId++;
      const payload = { jsonrpc: '2.0', id, method, params };
      child.stdin.write(`${JSON.stringify(payload)}\n`);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(id);
          reject(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);
        waiters.set(id, {
          resolve: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
          reject,
        });
      });
    },
    close() {
      rl.close();
    },
  };
}

async function main() {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const rpc = makeRpcClient(child);
  const killer = setTimeout(() => {
    child.kill('SIGKILL');
  }, timeoutMs + 2000);

  try {
    const init = await rpc.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ldr-mcp-health', version: '1.0.0' },
    });
    if (init.error) {
      throw new Error(init.error.message ?? 'initialize failed');
    }

    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    })}\n`);

    const list = await rpc.request('tools/list', {});
    if (list.error) {
      throw new Error(list.error.message ?? 'tools/list failed');
    }

    const tools = Array.isArray(list.result?.tools) ? list.result.tools : [];
    const output = {
      ok: true,
      server: 'ldr-mcp',
      toolCount: tools.length,
      toolNames: tools.map((tool) => tool?.name).filter(Boolean),
      timeoutMs,
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (err) {
    console.log(JSON.stringify({
      ok: false,
      server: 'ldr-mcp',
      error: err instanceof Error ? err.message : String(err),
      timeoutMs,
    }, null, 2));
    process.exit(1);
  } finally {
    rpc.close();
    child.stdin.end();
    child.kill('SIGTERM');
    clearTimeout(killer);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
