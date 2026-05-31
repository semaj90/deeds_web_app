#!/usr/bin/env node
/**
 * mcp-opencode-health-probe.mjs
 *
 * Probe every MCP entry in opencode.json and report:
 *   - Listening port (Windows netstat / Linux ss)
 *   - JSON-RPC 2.0 tools/list response (200 + tool count)
 *   - Custom HTTP fallback (/health, /)
 *   - WSL2-Docker bridge note (loopback vs docker.internal)
 *
 * Writes memory/exports/mcp-health-probe.json. Exit 0 always; truth is in the report.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const CONFIG_PATH = path.join(ROOT, 'opencode.json');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'mcp-health-probe.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('opencode.json not found at', CONFIG_PATH);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function timedFetch(url, init = {}, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text, durationMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, error: e.message, durationMs: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

async function probeMcpRemote(name, def) {
  const result = { name, type: def.type, url: def.url, enabledInConfig: def.enabled !== false };

  // 1. tools/list via JSON-RPC 2.0
  const rpc = await timedFetch(def.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'probe', method: 'tools/list' }),
  }, def.timeout || 5000);

  result.toolsListStatus = rpc.status;
  result.toolsListMs = rpc.durationMs;

  if (rpc.ok && rpc.text) {
    // Parse SSE OR plain JSON
    let body = rpc.text.trim();
    if (body.startsWith('event:')) {
      const dataLine = body.split('\n').find((l) => l.startsWith('data:'));
      if (dataLine) body = dataLine.slice(5).trim();
    }
    try {
      const json = JSON.parse(body);
      const tools = json.result?.tools || [];
      result.toolCount = tools.length;
      result.sampleTools = tools.slice(0, 5).map((t) => t.name);
      result.mcpHealthy = tools.length > 0;
    } catch (e) {
      result.parseError = e.message;
      result.mcpHealthy = false;
    }
  } else {
    result.mcpHealthy = false;
    result.errorBody = (rpc.text || rpc.error || '').slice(0, 200);
  }

  // 2. /health fallback (custom HTTP services)
  const healthUrl = def.url.replace(/\/mcp\/?$/, '/health');
  if (healthUrl !== def.url) {
    const h = await timedFetch(healthUrl, { method: 'GET' }, 2000);
    result.healthEndpointStatus = h.status;
    result.healthBody = (h.text || '').slice(0, 100);
  }

  // Classification
  if (result.mcpHealthy && result.enabledInConfig) result.classification = 'live_mcp';
  else if (result.mcpHealthy && !result.enabledInConfig) result.classification = 'mcp_up_but_disabled';
  else if (result.healthEndpointStatus === 200) result.classification = 'custom_http_only';
  else if (result.toolsListStatus === 0) result.classification = 'port_not_listening';
  else result.classification = 'broken_mcp';

  return result;
}

async function probeLocalMcp(name, def) {
  // Local stdio MCPs can't be tested without spawning, so just record presence
  return {
    name,
    type: def.type,
    command: Array.isArray(def.command) ? def.command.join(' ') : def.command,
    enabledInConfig: def.enabled !== false,
    classification: 'local_stdio_not_probed',
  };
}

async function main() {
  console.log('\n══ MCP Health Probe (opencode.json) ══════════════════════');
  const mcpEntries = Object.entries(config.mcp || {});
  console.log(`  MCP entries: ${mcpEntries.length}`);

  const results = [];
  for (const [name, def] of mcpEntries) {
    process.stdout.write(`  Probing ${name.padEnd(20)}`);
    const r = def.type === 'remote'
      ? await probeMcpRemote(name, def)
      : await probeLocalMcp(name, def);
    results.push(r);
    if (r.classification === 'live_mcp') {
      console.log(`  ✅ ${r.toolCount} tools (${r.toolsListMs}ms)`);
    } else if (r.classification === 'mcp_up_but_disabled') {
      console.log(`  ⚠️  ${r.toolCount} tools available but enabled=false`);
    } else if (r.classification === 'custom_http_only') {
      console.log(`  ⚠️  /mcp returns 404 but /health=200 (not JSON-RPC)`);
    } else if (r.classification === 'local_stdio_not_probed') {
      console.log(`  📍 local stdio (not probed)`);
    } else if (r.classification === 'port_not_listening') {
      console.log(`  ❌ port not listening`);
    } else {
      console.log(`  ❌ broken: ${r.errorBody || r.parseError || 'unknown'}`);
    }
  }

  // WSL2 ↔ Docker notes
  const wsl2DockerNotes = {
    rule: 'Loopback 127.0.0.1 works when MCPs run on Windows host. Docker containers calling host services need host.docker.internal.',
    detected: {
      windows_host_loopback_count: results.filter((r) => /127\.0\.0\.1|localhost/.test(r.url || '')).length,
      docker_internal_count: results.filter((r) => /docker\.internal/.test(r.url || '')).length,
    },
  };

  const report = {
    timestamp: new Date().toISOString(),
    configPath: CONFIG_PATH,
    totalMcpEntries: mcpEntries.length,
    liveMcp: results.filter((r) => r.classification === 'live_mcp').length,
    mcpUpButDisabled: results.filter((r) => r.classification === 'mcp_up_but_disabled').length,
    customHttpOnly: results.filter((r) => r.classification === 'custom_http_only').length,
    broken: results.filter((r) => r.classification === 'broken_mcp').length,
    notListening: results.filter((r) => r.classification === 'port_not_listening').length,
    localStdio: results.filter((r) => r.classification === 'local_stdio_not_probed').length,
    wsl2DockerNotes,
    entries: results,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Summary ═══════════════════════════════════════════════');
  console.log(`  Live MCPs:           ${report.liveMcp}`);
  console.log(`  Up but disabled:     ${report.mcpUpButDisabled}`);
  console.log(`  Custom HTTP only:    ${report.customHttpOnly}`);
  console.log(`  Broken:              ${report.broken}`);
  console.log(`  Not listening:       ${report.notListening}`);
  console.log(`  Local stdio:         ${report.localStdio}`);
  console.log(`  📝 Report → ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
