#!/usr/bin/env node
/**
 * audit-sidecar-transports.mjs
 *
 * Regression guard: verifies every MCP sidecar exposes the correct transport(s).
 * Designed to catch the class of bug where engram-embed was stdio-only and
 * smoke-opencode-mcp-sidecars.mjs silently treated a 404 as a generic [FAIL].
 *
 * Checks:
 *   turbovec  :8791  — HTTP POST /mcp only
 *   engram    :8792  — stdio only (spawned subprocess via OpenCode)
 *   langext   :8793  — HTTP POST /mcp only
 *
 * Exit codes:
 *   0  — all running sidecars pass transport check (DOWN is tolerated)
 *   1  — at least one running sidecar has TRANSPORT_ERROR
 *
 * Outputs:
 *   .tmp/mcp-sidecar-transport-audit.json
 *   .tmp/mcp-sidecar-transport-audit.md
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = resolve(ROOT, '.tmp');

function loadSidecars() {
  const opencodePath = resolve(ROOT, 'opencode.json');
  if (!existsSync(opencodePath)) {
    return [
      { name: 'turbovec-sidecar', port: 8791, transport: 'http', enabled: true },
      { name: 'engram-embed', port: 8792, transport: 'stdio', enabled: true },
      { name: 'langextract', port: 8793, transport: 'http', enabled: true },
    ];
  }

  const raw = JSON.parse(readFileSync(opencodePath, 'utf8'));
  const mcp = raw.mcp ?? {};
  const wanted = ['turbovec', 'turbovec-sidecar', 'engram-embed', 'langextract'];
  const list = [];

  for (const name of wanted) {
    const cfg = mcp[name];
    if (!cfg) continue;
    if (cfg.type === 'remote') {
      list.push({
        name,
        port: Number(String(cfg.url ?? '').match(/:(\d+)\//)?.[1] ?? '0'),
        transport: 'http',
        enabled: cfg.enabled !== false,
        url: cfg.url,
      });
    } else if (cfg.type === 'local') {
      list.push({
        name,
        port: 0,
        transport: 'stdio',
        enabled: cfg.enabled !== false,
        command: cfg.command,
        args: cfg.args ?? [],
      });
    }
  }
  return list;
}

const SIDECARS = loadSidecars();

const INITIALIZE_REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'sidecar-transport-audit', version: '1.0.0' },
  },
});

// ── HTTP transport probe ───────────────────────────────────────────────────────

async function probeHttp(port) {
  const url = `http://127.0.0.1:${port}/mcp`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: INITIALIZE_REQUEST,
      signal: controller.signal,
    });

    const text = await res.text().catch(() => '');

    if (res.status === 404) {
      return {
        status: 'TRANSPORT_ERROR',
        detail: `HTTP 404 — route /mcp does not exist (sidecar may be stdio-only)`,
        http_status: 404,
      };
    }

    if (!res.ok) {
      return {
        status: 'TRANSPORT_ERROR',
        detail: `HTTP ${res.status}: ${text.slice(0, 160)}`,
        http_status: res.status,
      };
    }

    // Any 2xx response — try to parse JSON-RPC
    let parsed = null;
    try {
      parsed = text.trim() ? JSON.parse(text) : null;
    } catch {
      return {
        status: 'TRANSPORT_ERROR',
        detail: `2xx response but body is not JSON: ${text.slice(0, 160)}`,
        http_status: res.status,
      };
    }

    if (!parsed) {
      return {
        status: 'TRANSPORT_ALIVE',
        detail: 'HTTP 2xx with empty body — transport alive',
        http_status: res.status,
        rpc_response: null,
      };
    }

    if (parsed.error) {
      // JSON-RPC error response still means transport is alive
      return {
        status: 'TRANSPORT_ALIVE',
        detail: `JSON-RPC error response (transport alive): ${parsed.error.message ?? JSON.stringify(parsed.error)}`,
        http_status: res.status,
        rpc_response: parsed,
      };
    }

    return {
      status: 'OK',
      detail: 'HTTP transport responding with valid JSON-RPC',
      http_status: res.status,
      rpc_response: parsed,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 'DOWN', detail: 'Connection timed out after 8s' };
    }
    const msg = err.message ?? String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('ENOTFOUND')) {
      return { status: 'DOWN', detail: `Connection refused — sidecar not running (${msg})` };
    }
    return { status: 'DOWN', detail: `Network error: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

// ── stdio transport probe ──────────────────────────────────────────────────────

async function probeStdio(scriptPath, extraArgs = []) {
  return new Promise((resolvePromise) => {
    const timeoutMs = 8000;
    let settled = false;

    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        resolvePromise({ status: 'FAIL', detail: 'stdio probe timed out after 8s' });
      }
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      // Look for a newline-terminated JSON-RPC line
      const lines = stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try { child.kill('SIGTERM'); } catch { /* ignore */ }
            if (parsed.error) {
              resolvePromise({
                status: 'OK',
                detail: `stdio JSON-RPC error response (transport alive): ${parsed.error.message ?? JSON.stringify(parsed.error)}`,
                rpc_response: parsed,
              });
            } else {
              resolvePromise({
                status: 'OK',
                detail: 'stdio transport responding with valid JSON-RPC',
                rpc_response: parsed,
              });
            }
          }
          return;
        } catch { /* not JSON yet, keep accumulating */ }
      }
    });

    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolvePromise({ status: 'FAIL', detail: `spawn error: ${err.message}` });
      }
    });

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolvePromise({
          status: 'FAIL',
          detail: `Process exited (code ${code}) before responding. stderr: ${stderr.slice(0, 200)}`,
        });
      }
    });

    // Write the initialize request to stdin
    try {
      child.stdin.write(INITIALIZE_REQUEST + '\n');
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        resolvePromise({ status: 'FAIL', detail: `stdin write error: ${err.message}` });
      }
    }
  });
}

// ── Main audit ─────────────────────────────────────────────────────────────────

const results = [];
let anyTransportError = false;

for (const sidecar of SIDECARS) {
  const entry = {
    name: sidecar.name,
    port: sidecar.port,
    transport: sidecar.transport,
  };

  if (sidecar.enabled === false) {
    if (sidecar.transport === 'stdio') entry.stdio = { status: 'SKIPPED', detail: 'Disabled in opencode.json' };
    else entry.http = { status: 'SKIPPED', detail: 'Disabled in opencode.json' };
    results.push(entry);
    continue;
  }

  if (sidecar.transport === 'http') {
    const httpResult = await probeHttp(sidecar.port);
    entry.http = httpResult;
    if (httpResult.status === 'TRANSPORT_ERROR') {
      anyTransportError = true;
    }
  } else if (sidecar.transport === 'stdio') {
    const scriptPath = resolve(__dirname, 'engram-embed-mcp.mjs');
    if (!existsSync(scriptPath)) {
      entry.stdio = { status: 'FAIL', detail: `Script not found: ${scriptPath}` };
    } else {
      const stdioResult = await probeStdio(scriptPath, ['--stdio']);
      entry.stdio = stdioResult;
      if (stdioResult.status === 'FAIL') {
        anyTransportError = true;
      }
    }
  }

  results.push(entry);
}

// ── Write outputs ──────────────────────────────────────────────────────────────

await mkdir(TMP_DIR, { recursive: true });

const jsonOutput = {
  generated_at: new Date().toISOString(),
  exit_code: anyTransportError ? 1 : 0,
  summary: anyTransportError
    ? 'TRANSPORT_ERROR detected — at least one running sidecar is missing HTTP /mcp route'
    : 'All running sidecars passed transport check (DOWN is tolerated)',
  results,
};

await writeFile(
  resolve(TMP_DIR, 'mcp-sidecar-transport-audit.json'),
  JSON.stringify(jsonOutput, null, 2) + '\n',
  'utf8',
);

// Build markdown table
const mdLines = [
  '# MCP Sidecar Transport Audit',
  '',
  `**Generated:** ${jsonOutput.generated_at}`,
  `**Overall:** ${anyTransportError ? '❌ TRANSPORT_ERROR' : '✅ OK'}`,
  '',
  '## HTTP Transport',
  '',
  '| Sidecar | Port | Status | Detail |',
  '|---------|------|--------|--------|',
];

for (const r of results) {
  const transport = r.transport ?? 'http';
  const entry = transport === 'stdio' ? r.stdio : r.http;
  const status = entry?.status ?? 'UNKNOWN';
  const detail = entry?.detail ?? 'No transport result';
  const icon = status === 'OK' ? '✅' : status === 'DOWN' ? '⚠️' : status === 'SKIPPED' ? '⏭️' : status === 'TRANSPORT_ALIVE' ? '🟡' : status === 'UNKNOWN' ? '❔' : '❌';
  mdLines.push(`| ${r.name} | ${r.port} | ${icon} ${status} | ${detail} |`);
}

const stdioEntries = results.filter((r) => r.stdio);
if (stdioEntries.length) {
  mdLines.push('', '## Stdio Transport (engram-embed only)', '', '| Sidecar | Status | Detail |', '|---------|--------|--------|');
  for (const r of stdioEntries) {
    const icon = r.stdio.status === 'OK' ? '✅' : '❌';
    mdLines.push(`| ${r.name} | ${icon} ${r.stdio.status} | ${r.stdio.detail} |`);
  }
}

mdLines.push(
  '',
  '## Status Codes',
  '',
  '- **OK** — HTTP transport responding with valid JSON-RPC result',
  '- **TRANSPORT_ALIVE** — HTTP transport up but returned a JSON-RPC error (transport works, method may vary)',
  '- **TRANSPORT_ERROR** — Sidecar is up but HTTP /mcp route missing (404) or returns non-JSON (the specific regression this guard catches)',
  '- **DOWN** — Sidecar not running (connection refused / timeout) — tolerated, not an error',
  '- **FAIL** (stdio only) — stdio process did not respond with JSON-RPC',
  '',
);

await writeFile(
  resolve(TMP_DIR, 'mcp-sidecar-transport-audit.md'),
  mdLines.join('\n') + '\n',
  'utf8',
);

// Console output
console.log('\n=== MCP Sidecar Transport Audit ===\n');
for (const r of results) {
  if (r.http) {
  const httpIcon = r.http.status === 'OK' ? '✅' : r.http.status === 'DOWN' ? '⚠️ ' : r.http.status === 'SKIPPED' ? '⏭️ ' : r.http.status === 'TRANSPORT_ALIVE' ? '🟡' : '❌';
    if (r.http.status !== 'SKIPPED') {
      console.log(`  ${httpIcon} [HTTP] ${r.name}:${r.port}  ${r.http.status}  — ${r.http.detail}`);
    } else {
      console.log(`  ⏭️ [HTTP] ${r.name}:${r.port}  SKIPPED  — ${r.http.detail}`);
    }
  }
  if (r.stdio) {
    const stdioIcon = r.stdio.status === 'OK' ? '✅' : r.stdio.status === 'DOWN' ? '⚠️ ' : r.stdio.status === 'SKIPPED' ? '⏭️ ' : '❌';
    console.log(`  ${stdioIcon} [STDIO] ${r.name}  ${r.stdio.status}  — ${r.stdio.detail}`);
  }
}

console.log('');
console.log(anyTransportError
  ? '❌  TRANSPORT_ERROR detected. Run `npm run mcp:opencode-sidecars` to start sidecars and re-run.'
  : '✅  All running sidecars passed transport check.');
console.log('');
console.log('Reports:');
console.log('  .tmp/mcp-sidecar-transport-audit.json');
console.log('  .tmp/mcp-sidecar-transport-audit.md');
console.log('');

process.exitCode = anyTransportError ? 1 : 0;
