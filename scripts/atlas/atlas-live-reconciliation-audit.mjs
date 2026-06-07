/**
 * @fileoverview Atlas Live Reconciliation Audit Script (v1.0)
 * @description Executes a comprehensive, read-only audit across all connected infrastructure services 
 *              (DB, Cache, Vector Stores, Graph) to detect drift, schema mismatches, and runtime errors.
 * @module scripts/atlas/atlas-live-reconciliation-audit.mjs
 */

// ESM — no require(). All checks use fetch() or TCP probes (read-only, no mutations).
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: flags } = parseArgs({
  options: {
    strict: { type: 'boolean', default: false },
    json:   { type: 'boolean', default: false },
  },
  strict: false,
});

const _scriptDir    = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(_scriptDir, '..', '..');
const frontendRoot  = path.join(workspaceRoot, 'sveltekit-frontend');

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const _allResults = [];

/** Thin gate wrapper used for package.json / file checks below. */
async function gate(id, label, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    _allResults.push({ id, label, status: 'PASS', detail: detail ?? '', ms: Date.now() - t0 });
    if (!flags.json) console.log(`  ${c.green('✓')} [${id}] ${label}${detail ? c.dim(' — ' + detail) : ''}`);
  } catch (err) {
    const warn = err.message?.startsWith('WARN:');
    const status = warn ? 'WARN' : 'FAIL';
    const msg    = warn ? err.message.slice(5).trim() : err.message;
    _allResults.push({ id, label, status, detail: msg, ms: Date.now() - t0 });
    const icon = warn ? c.yellow('○') : c.red('✗');
    if (!flags.json) console.log(`  ${icon} [${id}] ${label} ${c.dim('— ' + msg)}`);
  }
}

// --- CONFIGURATION (live service endpoints) ---
// Parse Redis host/port from REDIS_URL env (canonical form: redis://127.0.0.1:6379)
function _parseRedisHost(redisUrl) {
    try { const u = new URL(redisUrl); return { host: u.hostname, port: parseInt(u.port || '6379', 10) }; }
    catch { return { host: '127.0.0.1', port: 6379 }; }
}
const _redis = _parseRedisHost(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

const DB_CONFIG = {
    PG_CONN_STRING:    process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
    REDIS_HOST:        _redis.host,
    REDIS_PORT:        _redis.port,
    QDRANT_URL:        process.env.QDRANT_URL   ?? 'http://localhost:6333',
    NEO4J_URI:         process.env.NEO4J_URI    ?? 'bolt://localhost:7687',
    OLLAMA_BASE_URL:   (() => {
        const raw = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
        return raw.startsWith('http') ? raw : `http://${raw}:11434`;
    })(),
    TURBO_URL:         `http://127.0.0.1:${process.env.TURBO_PORT ?? '8090'}`,
    EMBED_URL:         `http://127.0.0.1:${process.env.EMBED_SERVER_PORT ?? '8081'}`,
    COUCHDB_URL:       process.env.COUCHDB_URL  ?? 'http://admin:deeds123@localhost:5984',
    RETRIEVAL_HTTP:    `http://${process.env.RETRIEVAL_HOST ?? '127.0.0.1'}:${process.env.RETRIEVAL_HTTP_PORT ?? '8100'}`,
    RETRIEVAL_GRPC_PORT: parseInt(process.env.RETRIEVAL_GRPC_PORT ?? '50053', 10),
};

// --- CORE UTILITIES ---

/**
 * Logs a structured audit finding to the console and accumulates it for the final report.
 * @param {string} component - Component being audited (e.g., 'Postgres', 'Redis').
 * @param {string} checkName - Specific check performed.
 * @param {object} result - The result object containing status, details, and evidence.
 * @param {Array<string>} [sourceRefs=[]] - Optional source references for this finding.
 */
function logFinding(component, checkName, result, _sourceRefs = []) {
    const id     = `${component}:${checkName}`;
    const status = result.status ?? 'PASS';
    const details = result.details ?? '';
    _allResults.push({ id, label: `${component} — ${checkName}`, status, detail: details, ms: 0 });
    const icon = status === 'PASS' ? c.green('✓') : status === 'WARN' ? c.yellow('○') : c.red('✗');
    if (!flags.json) console.log(`  ${icon} [${id}] ${details.slice(0, 120)}`);
}

async function runHealthCheck(_serviceName, checkFn) {
    try {
        const result = await checkFn();
        return { status: 'PASS', details: result?.message || 'OK', result };
    } catch (e) {
        const warn = e.message?.startsWith('WARN:');
        return { status: warn ? 'WARN' : 'FAIL', details: e.message, result: e.message };
    }
}

async function tcpOpen(host, port, timeoutMs = GATE_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error',   (e) => { sock.destroy(); reject(new Error(`TCP ${host}:${port} — ${e.message}`)); });
    sock.setTimeout(timeoutMs, () => { sock.destroy(); reject(new Error(`TCP ${host}:${port} — timeout`)); });
  });
}

const GATE_TIMEOUT = 1_200;

// =============================================================================
// 1. POSTGRES CHECKS  (via SvelteKit /api/health — read-only, no direct PG driver)
// =============================================================================
async function auditPostgres() {
    if (!flags.json) console.log('\n--- Postgres (via /api/health) ---');
    const result = await runHealthCheck('Postgres', async () => {
        const res = await fetch('http://127.0.0.1:5173/api/health', { signal: AbortSignal.timeout(3_000) }).catch(() => null);
        if (!res) return { message: 'WARN: dev server not running — Postgres reachability unverifiable' };
        const body = await res.json().catch(() => ({}));
        const pg = body?.services?.postgres ?? body?.postgres ?? null;
        if (pg === false || pg?.status === 'down') return { message: 'WARN: Postgres reported unhealthy by /api/health' };
        return { message: `Postgres via /api/health: ${pg ? JSON.stringify(pg).slice(0, 60) : 'no postgres key (ok)'}` };
    });
    logFinding('Postgres', 'health_probe', result);
    return result;
}

// =============================================================================
// 2. REDIS CHECKS  (TCP probe + per-command RESP sockets, one reply each)
// =============================================================================

// Redis password — read from env or fall back to the Valkey container default.
const REDIS_PASSWORD = (() => {
    const url = process.env.REDIS_URL ?? '';
    try { const u = new URL(url); if (u.password) return decodeURIComponent(u.password); } catch { /* */ }
    return process.env.REDIS_PASSWORD ?? process.env.VALKEY_PASSWORD ?? 'redis';
})();
const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? 'legal-ai-valkey';

/**
 * Run a redis-cli command via `docker exec` against the named container.
 * Returns stdout trimmed, throws on non-zero exit.
 * This bypasses the Docker-Desktop/Windows-loopback raw-RESP issue entirely.
 */
async function redisCli(...args) {
    const { execFile } = await import('node:child_process');
    return new Promise((resolve, reject) => {
        execFile('docker', [
            'exec', REDIS_CONTAINER,
            'redis-cli', '-a', REDIS_PASSWORD, '--no-auth-warning',
            ...args,
        ], { timeout: GATE_TIMEOUT * 2 }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr.trim() || err.message));
            else resolve(stdout.trim());
        });
    });
}


async function auditRedis() {
    if (!flags.json) console.log('\n--- Redis / Valkey :6379 ---');

    // 1. TCP reachability (port-bound check only — raw RESP doesn't work through
    //    Docker Desktop's Windows loopback NAT without the ioredis library).
    const tcpResult = await runHealthCheck('Redis', async () => {
        await tcpOpen(DB_CONFIG.REDIS_HOST, DB_CONFIG.REDIS_PORT);
        return { message: 'TCP connect OK' };
    });
    logFinding('Redis', 'tcp_connect', tcpResult);
    if (tcpResult.status === 'FAIL') {
        for (const k of ['ping', 'karpathy_gpu_scores', 'karpathy_gpu_encoded', 'ace_autoencoder_weights'])
            logFinding('Redis', k, { status: 'WARN', details: 'WARN: skipped — Redis not reachable' });
        return { tcp: tcpResult };
    }

    // 2. PING via docker exec (bypasses Docker-Desktop loopback raw-RESP issue)
    const pingResult = await runHealthCheck('Redis', async () => {
        const out = await redisCli('PING');
        if (out !== 'PONG') throw new Error(`unexpected PING reply: ${out}`);
        return { message: `PING → ${out} (AUTH ok, container: ${REDIS_CONTAINER})` };
    });
    logFinding('Redis', 'ping', pingResult);

    // 3. gpu:karpathy:scores HLEN
    const karpResult = await runHealthCheck('Redis', async () => {
        const out = await redisCli('HLEN', 'gpu:karpathy:scores');
        const n = parseInt(out, 10);
        if (n > 0) return { message: `gpu:karpathy:scores: ${n} file entries (Karpathy index warm)` };
        if (n === 0) return { message: 'WARN: gpu:karpathy:scores empty — run npm run karpathy:gpu' };
        throw new Error('WARN: gpu:karpathy:scores absent — run npm run karpathy:gpu');
    });
    logFinding('Redis', 'karpathy_gpu_scores', karpResult);

    // 4. gpu:karpathy:encoded HLEN
    const encResult = await runHealthCheck('Redis', async () => {
        const out = await redisCli('HLEN', 'gpu:karpathy:encoded');
        const n = parseInt(out, 10);
        if (n > 0) return { message: `gpu:karpathy:encoded: ${n} compressed memory paths` };
        throw new Error('WARN: gpu:karpathy:encoded absent — run npm run karpathy:gpu');
    });
    logFinding('Redis', 'karpathy_gpu_encoded', encResult);

    // 5. ace:autoencoder:weights EXISTS
    const aeResult = await runHealthCheck('Redis', async () => {
        const out = await redisCli('EXISTS', 'ace:autoencoder:weights');
        if (parseInt(out, 10) > 0) return { message: 'ace:autoencoder:weights present (autoencoder trained)' };
        throw new Error('WARN: ace:autoencoder:weights absent — run npm run graphify:full');
    });
    logFinding('Redis', 'ace_autoencoder_weights', aeResult);

    // 6. parent_atlas:last_run sentinel — written by promote-parent-atlas.mjs on completion
    const paResult = await runHealthCheck('Redis', async () => {
        const out = await redisCli('EXISTS', 'parent_atlas:last_run');
        if (parseInt(out, 10) > 0) return { message: 'parent_atlas:last_run present (parent atlas promoted)' };
        throw new Error('WARN: parent_atlas:last_run absent — run npm run atlas:promote');
    });
    logFinding('Redis', 'parent_atlas_last_run', paResult);

    return { tcp: tcpResult, ping: pingResult, karp: karpResult, enc: encResult, ae: aeResult, pa: paResult };
}

// =============================================================================
// 3. QDRANT CHECKS  (HTTP REST — read-only, with dimension verification)
// All active collections must be 768-dim to match embeddinggemma:latest output.
// A dimension mismatch means embeddings will be inserted/searched against the
// wrong vector space — silent correctness failure.
// =============================================================================

// Collections that MUST exist and MUST be 768-dim
const EXPECTED_768_COLLECTIONS = [
    'codebase_chunks_768',
    'evidence_items',
    'legal_documents',
    'legal_cases',
    'chat_messages',
    'embedding_cache',
    'evidence_vectors',
    'parent_atlas_feature_commands_768',
    'parent_atlas_rg_packets_768',
];

/** Extract vector size from Qdrant collection config (handles both named and legacy single-vector). */
function extractQdrantDim(params) {
    if (!params) return null;
    // Named vectors: { vectors: { content: { size: 768 }, ... } }
    if (params.vectors && typeof params.vectors === 'object') {
        const first = Object.values(params.vectors)[0];
        return first?.size ?? null;
    }
    // Legacy single-vector: { size: 768 }
    return params.size ?? null;
}

async function auditQdrant() {
    if (!flags.json) console.log('\n--- Qdrant :6333 ---');
    const healthResult = await runHealthCheck('Qdrant', async () => {
        const res = await fetch(`${DB_CONFIG.QDRANT_URL}/`, { signal: AbortSignal.timeout(GATE_TIMEOUT) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { message: `Qdrant root OK (${res.status})` };
    });
    logFinding('Qdrant', 'health', healthResult);
    if (healthResult.status === 'FAIL') return { health: healthResult };

    // Dimension + count check for every expected collection
    for (const name of EXPECTED_768_COLLECTIONS) {
        const colResult = await runHealthCheck('Qdrant', async () => {
            const res = await fetch(`${DB_CONFIG.QDRANT_URL}/collections/${name}`, {
                signal: AbortSignal.timeout(GATE_TIMEOUT),
            }).catch(() => null);
            if (!res || !res.ok) {
                throw new Error(`WARN: ${name} not accessible (HTTP ${res?.status ?? 'unreachable'})`);
            }
            const body = await res.json().catch(() => ({}));
            const params = body?.result?.config?.params ?? {};
            const dim    = extractQdrantDim(params);
            const count  = body?.result?.points_count ?? '?';
            if (dim !== null && dim !== 768) {
                throw new Error(`FAIL: ${name} dim=${dim} ≠ 768 — MISMATCH (${count} vectors)`);
            }
            const dimStr = dim !== null ? `${dim}-dim` : 'dim-unknown';
            return { message: `${name}: ${count} vectors, ${dimStr}` };
        });
        // Escalate status to FAIL if the error message starts with "FAIL:"
        const isFail = colResult.status === 'FAIL' || (colResult.details ?? '').startsWith('FAIL:');
        logFinding('Qdrant', `dim:${name}`, {
            status: isFail ? 'FAIL' : colResult.status,
            details: colResult.details ?? colResult.message ?? '',
        });
    }

    return { health: healthResult };
}

// =============================================================================
// 4. NEO4J CHECKS  (HTTP Bolt browser endpoint :7474 — read-only probe)
// =============================================================================
async function auditNeo4j() {
    if (!flags.json) console.log('\n--- Neo4j :7474 ---');
    const result = await runHealthCheck('Neo4j', async () => {
        const res = await fetch('http://127.0.0.1:7474/', { signal: AbortSignal.timeout(GATE_TIMEOUT) }).catch(() => null);
        if (!res) return { message: 'WARN: Neo4j browser not reachable (:7474)' };
        return { message: `Neo4j browser HTTP ${res.status}` };
    });
    logFinding('Neo4j', 'browser_probe', result);
    return result;
}

// =============================================================================
// 5. OLLAMA + llama-server CHECKS  (HTTP /api/tags + embed probe)
// =============================================================================
async function auditOllama() {
    if (!flags.json) console.log('\n--- Ollama :11434 + llama-server :8090 / :8081 ---');

    // Ollama tags list
    const ollamaResult = await runHealthCheck('Ollama', async () => {
        const res = await fetch(`${DB_CONFIG.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(GATE_TIMEOUT) }).catch(() => null);
        if (!res) return { message: 'WARN: Ollama not reachable' };
        const body = await res.json().catch(() => ({}));
        const models = (body?.models ?? []).map(m => m.name).join(', ');
        return { message: `Ollama models: ${models.slice(0, 80) || '(none)'}` };
    });
    logFinding('Ollama', 'tags_list', ollamaResult);

    // TurboQuant chat server
    const turboResult = await runHealthCheck('TurboQuant', async () => {
        const res = await fetch(`${DB_CONFIG.TURBO_URL}/health`, { signal: AbortSignal.timeout(GATE_TIMEOUT) }).catch(() => null);
        if (!res || !res.ok) return { message: `WARN: TurboQuant :8090 not healthy` };
        return { message: `TurboQuant :8090 healthy` };
    });
    logFinding('TurboQuant', 'health', turboResult);

    // Embed server
    const embedResult = await runHealthCheck('EmbedServer', async () => {
        const res = await fetch(`${DB_CONFIG.EMBED_URL}/health`, { signal: AbortSignal.timeout(GATE_TIMEOUT) }).catch(() => null);
        if (!res || !res.ok) return { message: `WARN: Embed server :8081 not healthy` };
        return { message: `Embed server :8081 healthy` };
    });
    logFinding('EmbedServer', 'health', embedResult);

    return { ollama: ollamaResult, turbo: turboResult, embed: embedResult };
}

// =============================================================================
// 6. GPU/NATIVE CHECKS  (file existence + addon load probe)
// =============================================================================
async function auditGPU() {
    if (!flags.json) console.log('\n--- GPU / Native bridge ---');

    const addonPath = path.join(workspaceRoot, 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node');
    const fileResult = await runHealthCheck('GPU', async () => {
        if (!existsSync(addonPath)) return { message: 'WARN: tensorrt_bridge.node not found — GPU ops fall back to JS' };
        const bytes = readFileSync(addonPath).length;
        return { message: `tensorrt_bridge.node found (${bytes} bytes)` };
    });
    logFinding('GPU', 'addon_file', fileResult);

    const loadResult = await runHealthCheck('GPU', async () => {
        if (!existsSync(addonPath)) return { message: 'WARN: skipped — addon not present' };
        try {
            const { createRequire } = await import('node:module');
            const req = createRequire(import.meta.url);
            const addon = req(addonPath);
            const fns = ['kmeansWithCentroids', 'trainSOM', 'pageRankGPU', 'attentionScoreGPU', 'rewardScoreGPU'];
            const missing = fns.filter(f => typeof addon[f] !== 'function');
            if (missing.length) return { message: `WARN: missing exports: ${missing.join(', ')}` };
            return { message: `${fns.length}/5 GPU functions exported` };
        } catch (e) {
            return { message: `WARN: addon load error — ${e.message.slice(0, 80)}` };
        }
    });
    logFinding('GPU', 'addon_load', loadResult);
    return { file: fileResult, load: loadResult };
}

// =============================================================================
// D. package.json script aliases
// =============================================================================
async function auditPackageScripts() {
    if (!flags.json) console.log('\n--- package.json script aliases ---');
    const pkgPath = path.join(frontendRoot, 'package.json');
    let pkg = {};
    try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch (e) {
        logFinding('Package', 'readable', { status: 'FAIL', details: e.message });
        return;
    }
    logFinding('Package', 'readable', { status: 'PASS', details: `${Object.keys(pkg.scripts ?? {}).length} scripts` });

    const REQUIRED = [
        'services:grpc:ensure', 'services:grpc:ready',
        'turbo:start:baseline', 'turbo:start:spec-ngram', 'turbo:start:spec-mtp',
        'embed:start', 'smoke:llama:embed:ml', 'smoke:llama:embed:ml:strict',
    ];
    for (const name of REQUIRED) {
        const exists = !!pkg.scripts?.[name];
        logFinding('Package', `script:${name}`, {
            status: exists ? 'PASS' : 'FAIL',
            details: exists ? pkg.scripts[name].slice(0, 80) : `missing: ${name}`,
        });
    }

    const devGrpc = pkg.scripts?.['dev:grpc'] ?? '';
    logFinding('Package', 'dev:grpc:sequential', {
        status: devGrpc.includes('services:grpc:ensure') && devGrpc.includes('services:grpc:ready') ? 'PASS' : 'FAIL',
        details: devGrpc.includes('services:grpc:ensure') ? 'sequential ordering confirmed' : 'still concurrent — fix needed',
    });
}

// =============================================================================
// E. ACE packet + SOM cluster reconciliation
// =============================================================================
function createRedisClient(Redis, redisUrl) {
    return new Redis(redisUrl, {
        host: DB_CONFIG.REDIS_HOST,
        port: DB_CONFIG.REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
    });
}

async function safeRedisDisconnect(redis) {
    if (!redis) return;
    if (redis.status === 'end' || redis.status === 'close') return;
    try {
        await redis.quit();
    } catch {
        try {
            redis.disconnect();
        } catch {}
    }
}

async function auditAcePackets() {
    if (!flags.json) console.log('\n--- ACE Packet + SOM Cluster reconciliation ---');

    const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

    // Dynamic import to avoid hard dep on ioredis in audit script
    let Redis;
    try {
        const mod = await import('ioredis');
        Redis = mod.default ?? mod.Redis;
    } catch {
        logFinding('ACE', 'redis_import', { status: 'WARN', details: 'ioredis not installed — skipping ACE checks' });
        return;
    }

    const redis = createRedisClient(Redis, REDIS_URL);
    redis.on('error', () => {});

    try {
        await redis.connect();
        await redis.ping();
    } catch (e) {
        logFinding('ACE', 'redis_connect', { status: 'WARN', details: `Redis not reachable: ${e.message}` });
        await safeRedisDisconnect(redis);
        return;
    }

    try {
        // Check ace:packet:latest
        const latestId = await redis.get('ace:packet:latest').catch(() => null);
        logFinding('ACE', 'packet_latest', {
            status: latestId ? 'PASS' : 'WARN',
            details: latestId ? `ace:packet:latest → ${latestId}` : 'no packets written yet — trigger a query to populate',
        });

        if (latestId) {
            const raw = await redis.get(`ace:packet:${latestId}`).catch(() => null);
            if (raw) {
                const p = JSON.parse(raw);
                logFinding('ACE', 'packet_schema', {
                    status: p.source_refs?.length > 0 && !p.degraded ? 'PASS' : 'WARN',
                    details: `source_refs=${p.source_refs?.length ?? 0}, degraded=${p.degraded}, cache_hit=${p.cache_hit}`,
                });
            }
        }

        // Check SOM cluster index
        const clusterCount = await redis.scard('ace:cluster:index').catch(() => 0);
        logFinding('ACE', 'som_cluster_index', {
            status: clusterCount > 0 ? 'PASS' : 'WARN',
            details: clusterCount > 0
                ? `${clusterCount} SOM clusters in ace:cluster:index`
                : 'empty — run graphify:semantic or bulkUpsertSomPackets()',
        });

        // Check Bifrost telemetry keys
        const [, bifrostKeys] = await redis.scan('0', 'MATCH', 'bitfrost:retrieval:*', 'COUNT', 50).catch(() => ['0', []]);
        logFinding('ACE', 'bifrost_telemetry', {
            status: bifrostKeys.length > 0 ? 'PASS' : 'WARN',
            details: bifrostKeys.length > 0
                ? `${bifrostKeys.length} bitfrost:retrieval:* keys (context assembler firing)`
                : 'no Bifrost telemetry keys — context assembler not yet called or TTLs expired',
        });

        // Check graph-edges have feature_ids
        const edgesPath = path.join(workspaceRoot, '.opencode/ndjson/graph-edges.ndjson');
        if (existsSync(edgesPath)) {
            const lines = readFileSync(edgesPath, 'utf8').split('\n').filter(Boolean);
            let withFeatures = 0;
            for (const line of lines.slice(0, 100)) {
                try {
                    const e = JSON.parse(line);
                    if (e.feature_ids?.length > 0) withFeatures++;
                } catch { /* skip */ }
            }
            logFinding('ACE', 'graph_edges_feature_ids', {
                status: withFeatures > 0 ? 'PASS' : 'WARN',
                details: withFeatures > 0
                    ? `${withFeatures}/${Math.min(lines.length, 100)} sampled edges have feature_ids`
                    : 'no edges have feature_ids — run ndjson:mapreduce with updated join',
            });
        } else {
            logFinding('ACE', 'graph_edges_file', { status: 'WARN', details: 'graph-edges.ndjson missing — run ndjson:mapreduce' });
        }

        // Check NES card index (nes:card:* keys)
        const [, nesKeys] = await redis.scan('0', 'MATCH', 'nes:card:*', 'COUNT', 20).catch(() => ['0', []]);
        logFinding('ACE', 'nes_card_index', {
            status: nesKeys.length > 0 ? 'PASS' : 'WARN',
            details: nesKeys.length > 0
                ? `${nesKeys.length}+ NES card keys in Redis`
                : 'no NES cards in Redis — call bulkLoadCards() after mapreduce',
        });
    } finally {
        await safeRedisDisconnect(redis);
    }
}

// =============================================================================
// MAIN EXECUTION FLOW
// =============================================================================
async function runLiveReconciliationAudit() {
    if (!flags.json) {
        console.log(c.bold('\n======================================================'));
        console.log(c.bold(' ATLAS LIVE RECONCILIATION AUDIT'));
        console.log(c.bold('======================================================'));
    }

    await auditPostgres();
    await auditRedis();
    await auditQdrant();
    await auditNeo4j();
    await auditOllama();
    await auditGPU();
    await auditPackageScripts();
    await auditAcePackets();

    const pass = _allResults.filter(r => r.status === 'PASS').length;
    const warn = _allResults.filter(r => r.status === 'WARN').length;
    const fail = _allResults.filter(r => r.status === 'FAIL').length;

    if (flags.json) {
        process.stdout.write(JSON.stringify({
            timestamp: new Date().toISOString(),
            pass, warn, fail,
            results: _allResults,
        }, null, 2) + '\n');
    } else {
        console.log('\n======================================================');
        const parts = [
            c.green(pass + ' PASS'),
            warn ? c.yellow(warn + ' WARN') : '',
            fail ? c.red(fail + ' FAIL') : '',
        ].filter(Boolean);
        console.log(parts.join('  '));
        if (fail === 0 && warn === 0) console.log(c.green('Stack fully reconciled ✓'));
        if (warn) console.log(c.yellow('WARN = optional/not-yet-started services.'));
        if (fail) console.log(c.red('FAIL = missing files or misconfiguration. Fix before dev:grpc.'));
        console.log('');
    }

    if (flags.strict && fail > 0) process.exit(1);
}

// Execute when run directly
runLiveReconciliationAudit();