#!/usr/bin/env node
/**
 * probe-mcp-and-turbovec.mjs
 *
 * One-shot health probe for TRACE MCP (:8788) and TurboVec (:8791).
 * Use to settle "is X enabled / reachable?" confusion in opencode logs.
 *
 * Writes: memory/exports/mcp-turbovec-probe.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const OPENCODE = JSON.parse(fs.readFileSync(path.join(ROOT, 'opencode.json'), 'utf8'));

async function probeMCP(url, timeout = 4000) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'probe', method: 'tools/list' }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const txt = await r.text();
    // Streamable HTTP wraps response in SSE-ish "event: message\ndata: {...}"
    const dataLine = txt.split('\n').find((l) => l.startsWith('data:'));
    const json = dataLine ? JSON.parse(dataLine.slice(5).trim()) : JSON.parse(txt);
    const tools = json?.result?.tools || [];
    return { ok: true, status: r.status, toolCount: tools.length, sample: tools.slice(0, 5).map((t) => t.name) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function probeHTTP(url, timeout = 3000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    const txt = await r.text();
    let json = null;
    try { json = JSON.parse(txt); } catch {}
    return { ok: r.ok, status: r.status, body: json || txt.slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log('\n══ MCP + TurboVec Probe ════════════════════════════════');

  const trace = OPENCODE.mcp.trace;
  const turbovec = OPENCODE.mcp.turbovec;

  console.log(`\n  TRACE  config: enabled=${trace.enabled}, url=${trace.url}`);
  const traceProbe = await probeMCP(trace.url);
  console.log(`  TRACE  live:   ${traceProbe.ok ? `✅ ${traceProbe.toolCount} tools` : '❌ ' + (traceProbe.error || traceProbe.status)}`);
  if (traceProbe.ok) console.log(`         sample: ${traceProbe.sample.join(', ')}`);

  console.log(`\n  TurboVec config: enabled=${turbovec.enabled}, url=${turbovec.url}`);
  const tvMcpProbe = await probeMCP(turbovec.url);
  const tvHealthProbe = await probeHTTP('http://127.0.0.1:8791/health');
  console.log(`  TurboVec /mcp:    ${tvMcpProbe.ok ? '✅ MCP responding' : '❌ ' + (tvMcpProbe.error || tvMcpProbe.status)}`);
  console.log(`  TurboVec /health: ${tvHealthProbe.ok ? `✅ ${JSON.stringify(tvHealthProbe.body)}` : '❌ ' + (tvHealthProbe.error || tvHealthProbe.status)}`);

  const verdict = {
    timestamp: new Date().toISOString(),
    trace: {
      configEnabled: trace.enabled,
      live: traceProbe,
      verdict: trace.enabled && traceProbe.ok ? 'ENABLED+LIVE' : trace.enabled ? 'ENABLED-but-DOWN' : 'DISABLED',
    },
    turbovec: {
      configEnabled: turbovec.enabled,
      mcpEndpoint: tvMcpProbe,
      healthEndpoint: tvHealthProbe,
      verdict: turbovec.enabled
        ? (tvMcpProbe.ok ? 'ENABLED+LIVE' : 'ENABLED-but-NOT-MCP (custom HTTP only)')
        : (tvHealthProbe.ok ? 'DISABLED-in-opencode (custom HTTP running on 8791)' : 'DISABLED-and-DOWN'),
    },
  };

  console.log('\n══ Verdict ════════════════════════════════════════════');
  console.log(`  TRACE:    ${verdict.trace.verdict}`);
  console.log(`  TurboVec: ${verdict.turbovec.verdict}`);

  const outPath = path.join(ROOT, 'memory', 'exports', 'mcp-turbovec-probe.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(verdict, null, 2), 'utf8');
  console.log(`\n  📝 Report → ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });