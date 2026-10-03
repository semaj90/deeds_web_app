#!/usr/bin/env node
/**
 * atlas-tools stdio -> Streamable-HTTP bridge (JSON responses, stateless).
 *
 * atlas-tools-mcp.mjs speaks newline-delimited JSON-RPC on stdin/stdout only, so a
 * Dockerized MCP gateway (Bifrost, :3040) cannot launch it. This forwards each POST /mcp
 * body to one long-lived child and returns the matching response by JSON-RPC id.
 * No new dependencies. Usage: node scripts/mcp/atlas-tools-http-bridge.mjs
 * Env: ATLAS_TOOLS_BRIDGE_PORT (8794), ATLAS_TOOLS_BRIDGE_HOST (127.0.0.1)
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.ATLAS_TOOLS_BRIDGE_PORT || 8794);
const HOST = process.env.ATLAS_TOOLS_BRIDGE_HOST || '127.0.0.1';
const TIMEOUT_MS = 60_000;
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), 'atlas-tools-mcp.mjs');

const child = spawn(process.execPath, [target], {
  env: { ...process.env, ATLAS_TOOLS_MOCK: process.env.ATLAS_TOOLS_MOCK ?? '0' },
  stdio: ['pipe', 'pipe', 'inherit'],
});
child.on('exit', code => {
  console.error(`[atlas-tools-bridge] child exited (${code}); shutting down`);
  process.exit(code ?? 1);
});

const pending = new Map(); // id -> { resolve, timer }
createInterface({ input: child.stdout, terminal: false }).on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const entry = pending.get(msg.id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(msg.id);
  entry.resolve(msg);
});

function forward(msg) {
  const isNotif = msg.id === undefined || msg.id === null;
  child.stdin.write(JSON.stringify(msg) + '\n');
  if (isNotif) return Promise.resolve(null);
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pending.delete(msg.id);
      resolve({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: 'atlas-tools bridge timeout' } });
    }, TIMEOUT_MS);
    pending.set(msg.id, { resolve, timer });
  });
}

http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, name: 'atlas-tools-bridge' }));
  }
  if (req.url !== '/mcp' || req.method !== 'POST') {
    res.writeHead(req.url === '/mcp' ? 405 : 404, { Allow: 'POST' });
    return res.end();
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  let msg;
  try { msg = JSON.parse(body); } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
  }
  if (Array.isArray(msg)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch not supported' } }));
  }
  const reply = await forward(msg);
  if (reply === null) { res.writeHead(202); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(reply));
}).listen(PORT, HOST, () => {
  console.log(`[atlas-tools-bridge] http://${HOST}:${PORT}/mcp -> ${target}`);
});
