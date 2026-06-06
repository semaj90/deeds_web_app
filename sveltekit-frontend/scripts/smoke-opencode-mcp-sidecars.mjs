#!/usr/bin/env node
/**
 * smoke-opencode-mcp-sidecars.mjs
 *
 * Regression guard for the OpenCode MCP sidecars.
 *
 * Current contract:
 *   turbovec-sidecar  -> HTTP POST /mcp
 *   engram-embed      -> stdio JSON-RPC (--stdio)
 *   langextract       -> HTTP POST /mcp when enabled / running
 *
 * Exit code 1 only on transport/method failure for a sidecar that is
 * actually reachable under its declared transport.
 * DOWN sidecars are tolerated.
 */

const { readFile } = await import('node:fs/promises');
const { spawn } = await import('node:child_process');
const { dirname, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

function normalizeCommand(cmd) {
  if (Array.isArray(cmd)) {
    const [command, ...args] = cmd;
    return { command, args };
  }
  return { command: cmd, args: [] };
}

async function loadConfiguredEndpoints() {
  const opencodePath = resolve(ROOT, 'opencode.json');
  try {
    const raw = JSON.parse(await readFile(opencodePath, 'utf8'));
    const mcp = raw.mcp ?? {};
    const httpEndpoints = [];
    const stdioEndpoints = [];
    const skipped = [];

    for (const [name, cfg] of Object.entries(mcp)) {
      if (!['turbovec', 'turbovec-sidecar', 'langextract', 'engram-embed'].includes(name)) continue;
      if (cfg.enabled === false) {
        skipped.push({ name, reason: 'disabled in opencode.json' });
        continue;
      }
      if (cfg.type === 'remote' && cfg.url) {
        httpEndpoints.push({ name, url: cfg.url });
      } else if (cfg.type === 'local' && cfg.command) {
        const { command, args } = normalizeCommand(cfg.command);
        stdioEndpoints.push({ name, command, args: [...args, ...(cfg.args ?? [])] });
      }
    }

    return { httpEndpoints, stdioEndpoints, skipped };
  } catch {
    return {
      httpEndpoints: [
        { name: 'turbovec-sidecar', url: 'http://127.0.0.1:8791/mcp' },
        { name: 'langextract', url: 'http://127.0.0.1:8793/mcp' },
      ],
      stdioEndpoints: [
        {
          name: 'engram-embed',
          command: 'node',
          args: [resolve(ROOT, 'scripts', 'mcp', 'engram-embed-mcp.mjs'), '--stdio'],
        },
      ],
      skipped: [],
    };
  }
}

const { httpEndpoints, stdioEndpoints, skipped } = await loadConfiguredEndpoints();

const INITIALIZE_REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'opencode-sidecar-smoke', version: '1.0.0' },
  },
});

async function probeHttp(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: INITIALIZE_REQUEST,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');

    if (res.status === 404) {
      return { status: 'TRANSPORT_ERROR', detail: 'HTTP 404 — /mcp route missing' };
    }
    if (!res.ok) {
      return { status: 'TRANSPORT_ERROR', detail: `HTTP ${res.status}: ${text.slice(0, 160)}` };
    }

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json') && !text.trim().startsWith('{')) {
      return { status: 'TRANSPORT_ERROR', detail: `2xx but response is not JSON (content-type: ${ct})` };
    }

    let parsed;
    try {
      parsed = text.trim() ? JSON.parse(text) : null;
    } catch {
      return { status: 'TRANSPORT_ERROR', detail: '2xx but body is not valid JSON' };
    }

    if (!parsed?.result) {
      return { status: 'METHOD_ERROR', detail: `initialize returned no result: ${JSON.stringify(parsed)}` };
    }

    const tools = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      signal: controller.signal,
    }).then((r) => r.text());
    const toolsParsed = JSON.parse(tools);
    const toolCount = toolsParsed?.result?.tools?.length ?? 0;
    if (toolCount === 0) {
      return { status: 'METHOD_ERROR', detail: 'tools/list returned 0 tools' };
    }

    return { status: 'OK', detail: `HTTP /mcp OK — protocol=${parsed.result.protocolVersion} tools=${toolCount}` };
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('timeout')) {
      return { status: 'DOWN', detail: 'connection refused — sidecar not running' };
    }
    return { status: 'DOWN', detail: `network error: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeStdio(command, args = []) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: ROOT,
    });

    const timeout = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      resolvePromise({ status: 'FAIL', detail: 'stdio probe timed out after 8s' });
    }, 8000);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          clearTimeout(timeout);
          try { child.kill('SIGTERM'); } catch {}
          if (parsed.error) {
            resolvePromise({ status: 'METHOD_ERROR', detail: `stdio RPC error: ${parsed.error.message ?? JSON.stringify(parsed.error)}` });
          } else if (!parsed.result && !parsed.ok && parsed.status !== 'ok') {
            resolvePromise({ status: 'METHOD_ERROR', detail: `stdio initialize returned no result: ${trimmed.slice(0, 200)}` });
          } else {
            resolvePromise({ status: 'OK', detail: 'stdio transport responding with valid JSON-RPC' });
          }
          return;
        } catch {
          // keep waiting for JSON
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolvePromise({
        status: code === 0 ? 'DOWN' : 'METHOD_ERROR',
        detail: code === 0
          ? 'stdio process exited before responding'
          : `Process exited (code ${code}) before responding. stderr: ${stderr.slice(0, 200)}`,
      });
    });

    child.stdin.write(INITIALIZE_REQUEST + '\n');
  });
}

const results = [];
let anyHardFailure = false;

for (const endpoint of httpEndpoints) {
  const result = await probeHttp(endpoint.url);
  results.push({ name: endpoint.name, transport: 'http', ...result });
  if (result.status === 'TRANSPORT_ERROR' || result.status === 'METHOD_ERROR') {
    anyHardFailure = true;
  }
}

for (const endpoint of stdioEndpoints) {
  const result = await probeStdio(endpoint.command, endpoint.args);
  results.push({ name: endpoint.name, transport: 'stdio', ...result });
  if (result.status === 'TRANSPORT_ERROR' || result.status === 'METHOD_ERROR') {
    anyHardFailure = true;
  }
}

for (const endpoint of skipped) {
  results.push({ name: endpoint.name, transport: 'skip', status: 'SKIPPED', detail: endpoint.reason });
}

for (const r of results) {
  if (r.status === 'OK') {
    console.log(`[PASS] ${r.name}: ${r.detail}`);
  } else if (r.status === 'DOWN') {
    console.warn(`[DOWN] ${r.name}: ${r.detail}`);
  } else if (r.status === 'SKIPPED') {
    console.log(`[SKIP] ${r.name}: ${r.detail}`);
  } else {
    console.error(`[${r.status}] ${r.name}: ${r.detail}`);
  }
}

console.log(JSON.stringify({ ok: !anyHardFailure, results }, null, 2));

if (anyHardFailure) {
  process.exitCode = 1;
}
