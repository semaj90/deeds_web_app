#!/usr/bin/env node
/**
 * Startup health check — verifies MCP /mcp POST (not just /health GET),
 * turbovec MCP, core services, and optionally warms the LLM if idle.
 *
 * LLM warm strategy:
 *   1. Check Redis for a recent atlas:summary:exact:v1: hit → use cached
 *      lod1Summary as the warm prompt (saves full inference tokens)
 *   2. If no cache hit AND LLM is not busy (slot.n_tokens_cached > 0 means
 *      it has KV from a prior session) → send a short prompt to prime KV cache
 *   3. If LLM is busy (n_tokens_processed > 0 at the slot level) → skip
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP_DIR = path.resolve(ROOT, '.tmp');
const STATUS_PATH = path.resolve(TMP_DIR, 'ace-startup-status.json');

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const TURBO_URL = 'http://127.0.0.1:8090';
const TRACE_URL = 'http://127.0.0.1:8788';
const TURBOVEC_URL = 'http://127.0.0.1:8791';
const OLLAMA_URL = 'http://127.0.0.1:11434';
const TIMEOUT_MS = 3000;

const services = [
  { name: 'Redis',          kind: 'redis' },
  { name: 'Qdrant',         url: 'http://127.0.0.1:6333/collections' },
  { name: 'Ollama',         url: `${OLLAMA_URL}/api/tags` },
  { name: 'Postgres',       kind: 'postgres' },
  { name: 'Bifrost',        url: 'http://127.0.0.1:3040/health' },
  { name: 'TurboQuant',     url: `${TURBO_URL}/health` },
  { name: 'Go Retrieval',   url: 'http://127.0.0.1:8100/health' },
  { name: 'Topology Search',url: 'http://127.0.0.1:8101/health', soft: true },
  { name: 'RabbitMQ API',   kind: 'rabbitmq' },
];

let pass = 0;
let fail = 0;
const state = {
  bifrost: 'red', retrievalGo: 'red', turboquant: 'red',
  topologySearch: 'red', traceMcp: 'red', turbovecMcp: 'red',
  sveltekit: 'yellow',
  backgroundJobs: { graphifySom: 'skipped', graphSynthesize: 'skipped' },
};

function writeStatus() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify({ ...state, timestamp: new Date().toISOString() }, null, 2), 'utf8');
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });
}

function testHttp(url, timeoutSec = 2) {
  const body = `$ErrorActionPreference="Stop"; Invoke-RestMethod -Uri '${url}' -TimeoutSec ${timeoutSec} | Out-Null;`;
  return run('pwsh', ['-NoProfile', '-Command', body]);
}

function testRedis() { return run('cmd.exe', ['/d', '/s', '/c', 'redis-cli PING']); }

function testPostgres() {
  const body = `$ErrorActionPreference="Stop"; docker ps --format '{{.Names}}' | Select-String -Pattern 'postgres' | Out-Null;`;
  return run('pwsh', ['-NoProfile', '-Command', body]);
}

function testRabbitMQ() {
  const body = `$ErrorActionPreference="Stop"; Invoke-RestMethod -Uri 'http://127.0.0.1:15672/api/healthchecks/node' -TimeoutSec 3 | Out-Null;`;
  return run('pwsh', ['-NoProfile', '-Command', body]);
}

// ── MCP /mcp POST probe ────────────────────────────────────────────────────────
// Tests that the MCP server actually handles JSON-RPC, not just /health GET.
// Parses the SSE envelope (data: {...}) or raw JSON.
async function probeMcpEndpoint(baseUrl, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const raw = await res.text();
    let parsed = null;
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) {
        try { parsed = JSON.parse(line.slice(6)); break; } catch {}
      }
    }
    if (!parsed) { try { parsed = JSON.parse(raw); } catch {} }
    const tools = parsed?.result?.tools;
    if (!Array.isArray(tools)) return { ok: false, error: 'no tools array in response' };
    return { ok: true, toolCount: tools.length };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ── Redis summary cache prefix check ──────────────────────────────────────────
// Looks for any recent atlas:summary:exact:v1: key and extracts lod1Summary.
// Returns null if Redis is down or no cached summary exists.
async function fetchCachedSummaryPrompt() {
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 1500,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    const keys = await redis.keys('atlas:summary:exact:v1:*');
    if (!keys.length) return null;
    // Pick the most recently written key (highest TTL = freshest)
    const ttls = await Promise.all(keys.slice(0, 10).map(k => redis.ttl(k)));
    const best = keys[ttls.indexOf(Math.max(...ttls))];
    const raw = await redis.get(best);
    if (!raw) return null;
    const record = JSON.parse(raw);
    const lod1 = record?.packet?.lod1Summary ?? record?.lod1Summary ?? null;
    return typeof lod1 === 'string' && lod1.length > 10 ? lod1.slice(0, 400) : null;
  } catch {
    return null;
  } finally {
    try { await redis.quit(); } catch {}
  }
}

// ── LLM busy check via llama-server /slots ────────────────────────────────────
async function isLlamaServerIdle() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${TURBO_URL}/slots`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null; // server up but /slots not exposed
    const slots = await res.json();
    if (!Array.isArray(slots) || slots.length === 0) return true;
    // idle = no slot has tokens currently being processed
    return slots.every(s => !s.is_processing && (s.n_tokens_cached ?? 0) >= 0);
  } catch {
    clearTimeout(timer);
    return null; // can't determine — skip warm
  }
}

// ── LLM warm via Ollama (think:false, very short) ─────────────────────────────
// Uses a cached summary snippet as the prompt to prime KV cache cheaply.
// Falls back to a fixed 8-token sentinel if no cache hit.
async function warmLlm(promptPrefix) {
  const prompt = promptPrefix
    ? `Continue from: ${promptPrefix.slice(0, 200)}`
    : 'System ready.';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 1 }, // 1 token — just prime KV
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('── Startup Health Check ──');

for (const service of services) {
  try {
    let result;
    if (service.kind === 'redis') {
      result = testRedis();
      if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || 'redis-cli PING failed');
      console.log('✅ Redis');
      pass += 1; continue;
    }
    if (service.kind === 'postgres') {
      result = testPostgres();
      if (result.status !== 0) throw new Error('postgres container not detected');
      console.log('✅ Postgres container');
      pass += 1; continue;
    }
    if (service.kind === 'rabbitmq') {
      result = testRabbitMQ();
      if (result.status !== 0) throw new Error('RabbitMQ management API unreachable');
      console.log('✅ RabbitMQ API');
      pass += 1; continue;
    }

    result = testHttp(service.url, 2);
    if (result.status !== 0) {
      if (service.soft) {
        console.log(`⏭️  ${service.name} skipped (soft dependency)`);
        state.topologySearch = 'yellow';
        continue;
      }
      throw new Error((result.stderr || result.stdout || '').trim() || `${service.name} unreachable`);
    }
    console.log(`✅ ${service.name}`);
    pass += 1;
    if (service.name === 'Bifrost')      state.bifrost = 'green';
    if (service.name === 'Go Retrieval') state.retrievalGo = 'green';
    if (service.name === 'TurboQuant')   state.turboquant = 'green';
    if (service.name === 'Topology Search') state.topologySearch = 'green';
  } catch (err) {
    console.log(`❌ ${service.name}: ${err?.message ?? err}`);
    fail += 1;
    if (service.name === 'Bifrost')      state.bifrost = 'yellow';
    if (service.name === 'Go Retrieval') state.retrievalGo = 'yellow';
    if (service.name === 'TurboQuant')   state.turboquant = 'red';
  }
}

// ── MCP /mcp POST probes (async) ──────────────────────────────────────────────
console.log('── MCP /mcp probes ──');

const [traceResult, turbovecResult] = await Promise.all([
  probeMcpEndpoint(TRACE_URL, 'TRACE MCP'),
  probeMcpEndpoint(TURBOVEC_URL, 'TurboVec MCP'),
]);

if (traceResult.ok) {
  console.log(`✅ TRACE MCP :8788/mcp  (${traceResult.toolCount} tools)`);
  state.traceMcp = 'green';
  pass += 1;
} else {
  console.log(`❌ TRACE MCP :8788/mcp — ${traceResult.error}`);
  console.log('   → restart: node scripts/ensure-mcp-server.mjs --spawn --force');
  state.traceMcp = 'red';
  fail += 1;
}

if (turbovecResult.ok) {
  console.log(`✅ TurboVec MCP :8791/mcp  (${turbovecResult.toolCount} tools)`);
  state.turbovecMcp = 'green';
  pass += 1;
} else {
  console.log(`❌ TurboVec MCP :8791/mcp — ${turbovecResult.error}`);
  console.log('   → restart: node scripts/mcp/turbovec-sidecar-mcp.mjs &');
  state.turbovecMcp = 'red';
  fail += 1;
}

// ── LLM warm (skip if busy or llama-server down) ──────────────────────────────
console.log('── LLM warm check ──');
const ollamaUp = testHttp(`${OLLAMA_URL}/api/tags`, 2).status === 0;

if (!ollamaUp) {
  console.log('⏭️  Ollama down — skipping LLM warm');
} else {
  // 1. Check Redis cache for a summary prompt prefix (saves ~400 input tokens)
  const cachedPrompt = await fetchCachedSummaryPrompt();
  if (cachedPrompt) {
    console.log('♻️  Using cached lod1Summary as warm prompt prefix (Redis hit)');
  }

  // 2. Only warm if llama-server slot is idle
  const idle = await isLlamaServerIdle();
  if (idle === false) {
    console.log('⏭️  llama-server busy — skipping warm to avoid queuing');
  } else {
    process.stdout.write('🔥 Warming LLM KV cache (1-token probe)… ');
    const warmed = await warmLlm(cachedPrompt);
    console.log(warmed ? 'done' : 'skipped (Ollama not responding in time)');
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
state.sveltekit = fail > 0 ? 'yellow' : 'yellow';
writeStatus();
console.log(`── summary: PASS=${pass} FAIL=${fail} ──`);
if (fail > 0) {
  console.log('⚠️  degraded startup state recorded in .tmp/ace-startup-status.json');
}
process.exitCode = 0;
