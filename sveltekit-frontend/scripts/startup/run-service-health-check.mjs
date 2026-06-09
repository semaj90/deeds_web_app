#!/usr/bin/env node
/**
 * Startup health check — verifies MCP /mcp POST (not just /health GET),
 * turbovec MCP, core services, and optionally warms the LLM if idle.
 *
 * Startup dependency order:
 *   Service Health Check -> Valkey Semantic Index -> Seed OpenCode Rules
 *     -> Semantic Valkey Smoke -> Auto-Map Codebase / Parent Atlas
 *
 * LLM warm strategy (TurboQuant-first):
 *   1. Try TurboQuant :8090  <- what we want to keep hot
 *   2. Fall back to Ollama :11434
 *   3. Use cached atlas:summary:exact:v1: lod1Summary as prompt prefix
 *   4. Skip if slot is busy
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP_DIR = path.resolve(ROOT, '.tmp');
const STATUS_PATH = path.resolve(TMP_DIR, 'ace-startup-status.json');

const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
// Patch 3: default password is 'redis', never empty — matches docker-compose.yml
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';

const TURBO_URL    = 'http://127.0.0.1:8090';
const TRACE_URL    = 'http://127.0.0.1:8788';
const TURBOVEC_URL = 'http://127.0.0.1:8791';
const OLLAMA_URL   = 'http://127.0.0.1:11434';
const TIMEOUT_MS   = 3000;

// Shared ioredis options — always use object form, never REDIS_URL string
// (avoids password-in-URL special-character parsing bugs)
function redisOpts(connectTimeout = 2000) {
  return {
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout,
  };
}

const services = [
  { name: 'Redis',           kind: 'redis' },
  { name: 'Qdrant',          url: 'http://127.0.0.1:6333/collections' },
  { name: 'Ollama',          url: `${OLLAMA_URL}/api/tags` },
  { name: 'Postgres',        kind: 'postgres' },
  { name: 'Bifrost',         url: 'http://127.0.0.1:3040/health' },
  { name: 'TurboQuant',      url: `${TURBO_URL}/health` },
  { name: 'Go Retrieval',    url: 'http://127.0.0.1:8100/health', kind: 'goRetrieval' },
  { name: 'Topology Search', url: 'http://127.0.0.1:8101/health', soft: true },
  { name: 'RabbitMQ API',    kind: 'rabbitmq' },
];

let pass = 0;
let fail = 0;
const state = {
  bifrost: 'red', retrievalGo: 'red', turboquant: 'red',
  topologySearch: 'red', traceMcp: 'red', turbovecMcp: 'red',
  karpathyScores: 'red', authorityTop: 'red',
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

// Patch 1: always send Accept header that matches MCP SSE responses
async function testHttp(url, timeoutSec = 2) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/event-stream' },
    });
    clearTimeout(timer);
    return res.ok || res.status < 500 ? { status: 0 } : { status: 1, stderr: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timer);
    return { status: 1, stderr: err?.message ?? `${url} unreachable` };
  }
}

async function testRedis() {
  const redis = new Redis(redisOpts(2000));
  redis.on('error', () => {});
  try {
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    return pong === 'PONG' ? { status: 0 } : { status: 1, stderr: `unexpected ping reply: ${pong}` };
  } catch (err) {
    try { await redis.quit(); } catch {}
    return { status: 1, stderr: err?.message ?? 'Redis unreachable' };
  }
}

function testPostgres() {
  const body = `$ErrorActionPreference="Stop"; docker ps --format '{{.Names}}' | Select-String -Pattern 'postgres' | Out-Null;`;
  return run('pwsh', ['-NoProfile', '-Command', body]);
}

async function testRabbitMQ() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch('http://127.0.0.1:15672/api/healthchecks/node', {
      headers: { Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64') },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { status: 1, stderr: `HTTP ${res.status}` };
    const body = await res.json();
    return body.status === 'ok' ? { status: 0 } : { status: 1, stderr: `status=${body.status}` };
  } catch (err) {
    clearTimeout(timer);
    return { status: 1, stderr: err?.message ?? 'RabbitMQ unreachable' };
  }
}

// Patch 2: Go Retrieval degraded-state parsing.
// status=degraded with embeddingServiceUp + pgvectorConnected + qdrantConnected = true
// and only redisConnected=false => WARN (yellow), not hard fail.
async function testGoRetrieval(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/event-stream' },
    });
    clearTimeout(timer);
    if (!res.ok) return { status: 1, stderr: `HTTP ${res.status}` };
    const body = await res.json().catch(() => null);
    if (!body) return { status: 0 };
    if (body.status === 'ok') return { status: 0 };
    if (body.status === 'degraded') {
      const coreUp = body.embeddingServiceUp !== false
        && body.pgvectorConnected !== false
        && body.qdrantConnected !== false;
      if (coreUp) {
        const failed = Object.entries(body)
          .filter(([k, v]) => k !== 'status' && v === false)
          .map(([k]) => k);
        return { status: 0, warn: `degraded (${failed.join(', ')} = false)` };
      }
    }
    return { status: 1, stderr: `status=${body.status ?? 'unknown'}` };
  } catch (err) {
    clearTimeout(timer);
    return { status: 1, stderr: err?.message ?? 'Go Retrieval unreachable' };
  }
}

// ── MCP /mcp POST probe ───────────────────────────────────────────────────────
// Patch 4: two-step initialize -> tools/list.
// initialize is required by some MCP servers before tools/list will succeed.
async function probeMcpEndpoint(baseUrl) {
  const mcpUrl = `${baseUrl}/mcp`;

  async function mcpCall(method, params = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(mcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
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
      return { ok: true, parsed };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  const initResult = await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    clientInfo: { name: 'startup-health-check', version: '1.0' },
    capabilities: {},
  });
  if (!initResult.ok) return { ok: false, error: `initialize failed: ${initResult.error}` };

  const listResult = await mcpCall('tools/list');
  if (!listResult.ok) return { ok: false, error: `tools/list failed: ${listResult.error}` };

  const tools = listResult.parsed?.result?.tools;
  return { ok: true, toolCount: Array.isArray(tools) ? tools.length : 0 };
}

// ── Redis summary cache — SCAN (not KEYS) ─────────────────────────────────────
// Patch 5: scanStream avoids blocking Redis on large atlas caches.
async function fetchCachedSummaryPrompt() {
  const redis = new Redis(redisOpts(1500));
  redis.on('error', () => {});
  try {
    await redis.connect();
    const collected = [];
    const stream = redis.scanStream({ match: 'atlas:summary:exact:v1:*', count: 20 });
    await new Promise((resolve, reject) => {
      stream.on('data', (keys) => {
        collected.push(...keys);
        if (collected.length >= 20) stream.pause();
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    if (!collected.length) return null;
    const ttls = await Promise.all(collected.slice(0, 10).map(k => redis.ttl(k)));
    const best = collected[ttls.indexOf(Math.max(...ttls))];
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

// ── Atlas dependency keys: Karpathy scores + authority top ───────────────────
async function checkAtlasKeys() {
  const redis = new Redis(redisOpts(1500));
  redis.on('error', () => {});
  try {
    await redis.connect();
    const [karpathyLen, authorityLen] = await Promise.all([
      redis.hlen('gpu:karpathy:scores'),
      redis.zcard('ace:authority:top').catch(() => redis.hlen('ace:authority:top')),
    ]);
    return { karpathyLen, authorityLen };
  } catch {
    return { karpathyLen: 0, authorityLen: 0 };
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
    if (!res.ok) return null;
    const slots = await res.json();
    if (!Array.isArray(slots) || slots.length === 0) return true;
    return slots.every(s => !s.is_processing && (s.n_tokens_cached ?? 0) >= 0);
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ── LLM warm — Patch 6: TurboQuant first, Ollama fallback ────────────────────
async function warmLlm(promptPrefix) {
  const prompt = promptPrefix
    ? `Continue from: ${promptPrefix.slice(0, 200)}`
    : 'System ready.';

  // TurboQuant (llama-server) — stream:true required for Gemma4
  const turboController = new AbortController();
  const turboTimer = setTimeout(() => turboController.abort(), 25000);
  try {
    const res = await fetch(`${TURBO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1,
        temperature: 0,
        stream: true,
        cache_prompt: true,
      }),
      signal: turboController.signal,
    });
    clearTimeout(turboTimer);
    if (res.ok) {
      await res.body?.cancel();
      return { warmed: true, via: 'TurboQuant :8090' };
    }
  } catch {
    clearTimeout(turboTimer);
  }

  // Ollama fallback
  const ollamaController = new AbortController();
  const ollamaTimer = setTimeout(() => ollamaController.abort(), 20000);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        think: false,
        keep_alive: 0,
        options: { temperature: 0, num_predict: 1 },
      }),
      signal: ollamaController.signal,
    });
    clearTimeout(ollamaTimer);
    return { warmed: res.ok, via: 'Ollama :11434' };
  } catch {
    clearTimeout(ollamaTimer);
    return { warmed: false, via: 'none' };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('-- Startup Health Check --');

for (const service of services) {
  try {
    let result;

    if (service.kind === 'redis') {
      result = await testRedis();
      if (result.status !== 0) throw new Error((result.stderr || result.stdout || '').trim() || 'Redis unreachable');
      console.log('OK Redis');
      pass += 1; continue;
    }
    if (service.kind === 'postgres') {
      result = testPostgres();
      if (result.status !== 0) throw new Error('postgres container not detected');
      console.log('OK Postgres container');
      pass += 1; continue;
    }
    if (service.kind === 'rabbitmq') {
      result = await testRabbitMQ();
      if (result.status !== 0) throw new Error((result.stderr || '').trim() || 'RabbitMQ management API unreachable');
      console.log('OK RabbitMQ API');
      pass += 1; continue;
    }
    if (service.kind === 'goRetrieval') {
      result = await testGoRetrieval(service.url);
      if (result.status !== 0) {
        if (service.soft) {
          console.log(`SKIP Go Retrieval -- ${result.stderr}`);
          state.retrievalGo = 'yellow';
          continue;
        }
        throw new Error(result.stderr || 'Go Retrieval unreachable');
      }
      if (result.warn) {
        console.log(`WARN Go Retrieval: ${result.warn}`);
        state.retrievalGo = 'yellow';
      } else {
        console.log('OK Go Retrieval');
        state.retrievalGo = 'green';
      }
      pass += 1; continue;
    }

    result = await testHttp(service.url, 2);
    if (result.status !== 0) {
      if (service.soft) {
        console.log(`SKIP ${service.name} (soft dependency)`);
        if (service.name === 'Topology Search') state.topologySearch = 'yellow';
        continue;
      }
      throw new Error((result.stderr || result.stdout || '').trim() || `${service.name} unreachable`);
    }
    console.log(`OK ${service.name}`);
    pass += 1;
    if (service.name === 'Bifrost')         state.bifrost = 'green';
    if (service.name === 'TurboQuant')      state.turboquant = 'green';
    if (service.name === 'Topology Search') state.topologySearch = 'green';
  } catch (err) {
    console.log(`FAIL ${service.name}: ${err?.message ?? err}`);
    fail += 1;
    if (service.name === 'Bifrost')    state.bifrost = 'yellow';
    if (service.name === 'TurboQuant') state.turboquant = 'red';
  }
}

// -- MCP /mcp POST probes (initialize -> tools/list) --------------------------
console.log('-- MCP /mcp probes --');

const [traceResult, turbovecResult] = await Promise.all([
  probeMcpEndpoint(TRACE_URL),
  probeMcpEndpoint(TURBOVEC_URL),
]);

if (traceResult.ok) {
  console.log(`OK TRACE MCP :8788/mcp  (${traceResult.toolCount} tools)`);
  state.traceMcp = 'green';
  pass += 1;
} else {
  console.log(`FAIL TRACE MCP :8788/mcp -- ${traceResult.error}`);
  console.log('   -> restart: node scripts/ensure-mcp-server.mjs --spawn --force');
  state.traceMcp = 'red';
  fail += 1;
}

if (turbovecResult.ok) {
  console.log(`OK TurboVec MCP :8791/mcp  (${turbovecResult.toolCount} tools)`);
  state.turbovecMcp = 'green';
  pass += 1;
} else {
  console.log(`FAIL TurboVec MCP :8791/mcp -- ${turbovecResult.error}`);
  console.log('   -> restart: node scripts/mcp/turbovec-sidecar-mcp.mjs &');
  state.turbovecMcp = 'red';
  fail += 1;
}

// -- Atlas dependency keys ----------------------------------------------------
console.log('-- Atlas key presence --');
const atlasKeys = await checkAtlasKeys();

if (atlasKeys.karpathyLen > 0) {
  console.log(`OK gpu:karpathy:scores (${atlasKeys.karpathyLen} entries)`);
  state.karpathyScores = 'green';
  pass += 1;
} else {
  console.log('WARN gpu:karpathy:scores empty -- run: npm run karpathy:gpu');
  state.karpathyScores = 'yellow';
}

if (atlasKeys.authorityLen > 0) {
  console.log(`OK ace:authority:top (${atlasKeys.authorityLen} entries)`);
  state.authorityTop = 'green';
  pass += 1;
} else {
  console.log('WARN ace:authority:top empty -- run: npm run graphify:authority');
  state.authorityTop = 'yellow';
}

// -- LLM warm (TurboQuant-first) ----------------------------------------------
console.log('-- LLM warm check --');
const turboUp  = (await testHttp(`${TURBO_URL}/health`, 2)).status === 0;
const ollamaUp = (await testHttp(`${OLLAMA_URL}/api/tags`, 2)).status === 0;

if (!turboUp && !ollamaUp) {
  console.log('SKIP TurboQuant + Ollama both down -- skipping LLM warm');
} else {
  const cachedPrompt = await fetchCachedSummaryPrompt();
  if (cachedPrompt) {
    console.log('CACHE Using cached lod1Summary as warm prompt prefix (Redis hit)');
  }
  const idle = await isLlamaServerIdle();
  if (idle === false) {
    console.log('SKIP llama-server busy -- skipping warm to avoid queuing');
  } else {
    process.stdout.write('WARM LLM KV cache (1-token probe)... ');
    const { warmed, via } = await warmLlm(cachedPrompt);
    console.log(warmed ? `done (via ${via})` : 'skipped (no LLM responded in time)');
  }
}

// -- Summary ------------------------------------------------------------------
state.sveltekit = fail > 0 ? 'yellow' : 'yellow';
writeStatus();
console.log(`-- summary: PASS=${pass} FAIL=${fail} --`);
if (fail > 0) {
  console.log('WARN degraded startup state recorded in .tmp/ace-startup-status.json');
}
process.exitCode = 0;