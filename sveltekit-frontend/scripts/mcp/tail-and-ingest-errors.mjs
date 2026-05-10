#!/usr/bin/env node
/**
 * tail-and-ingest-errors.mjs
 *
 * Watches logs/trace-mcp/launch-*.err for stack traces and feeds them into
 * the TRACE MCP `kag.ingest_error` tool. Closes the agentic-error-fixing
 * loop: MCP error → log file → error_fingerprints Postgres → next
 * synth:loop call to kag.recall_similar_fix returns "this exact stack
 * happened before, here's the fix".
 *
 * Idempotency: each candidate error is sha1-hashed; Redis set
 * `mcp:err:hash` records seen hashes (no expiry — error_fingerprints
 * dedups durably). If Redis is down, falls back to in-memory Set.
 *
 * Read-only otherwise: only writes to MCP (which audit-logs) and Redis
 * (idempotency only). Never edits log files. Never restarts services.
 *
 * Usage:
 *   node scripts/mcp/tail-and-ingest-errors.mjs              # foreground watch
 *   node scripts/mcp/tail-and-ingest-errors.mjs --backfill   # one-shot scan of existing files
 *   node scripts/mcp/tail-and-ingest-errors.mjs --dry-run    # detect+log, do not POST to MCP
 *
 * Env:
 *   TRACE_MCP_URL   default http://127.0.0.1:8788
 *   REDIS_URL       default redis://127.0.0.1:6379
 *   LOG_DIR         default <projectRoot>/logs/trace-mcp
 */

import { createHash }    from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path              from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar          from 'chokidar';

const scriptDir   = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');
const LOG_DIR     = process.env.LOG_DIR     ?? path.join(projectRoot, 'logs', 'trace-mcp');
const MCP_URL     = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://127.0.0.1:6379';
const DRY_RUN     = process.argv.includes('--dry-run');
const BACKFILL    = process.argv.includes('--backfill');

// Match: stack frame lines, [mcp] ERROR ... lines, bare "Error: ..." starts.
// Multi-line: anchor on starter line, walk forward until blank or non-indented.
const ERROR_STARTERS = [
  /^\[mcp\]\s+ERROR\b/,
  /^\[mcp\]\s+UNCAUGHT\b/i,
  /^\[mcp\]\s+UNHANDLED\b/i,
  /^\s*[A-Z][a-zA-Z]*Error:\s/,
  /^\s*Error:\s/,
  /^\[MCP\s+(uncaughtException|unhandledRejection|per-request handler threw|transport\.handleRequest threw)\]/,
];

// Per-file read offsets so we only ingest *new* tail lines.
const fileOffsets = new Map();
// Fallback in-memory dedup if Redis is unavailable.
const memSeenHashes = new Set();

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  try {
    const { default: Redis } = await import('ioredis');
    const url = new URL(REDIS_URL);
    const r = new Redis({
      host: url.hostname,
      port: Number(url.port) || 6379,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    r.on('error', () => {});
    await r.connect();
    await r.ping();
    redis = r;
    console.error('[tail-and-ingest] redis: connected');
  } catch (e) {
    redis = false;
    console.error('[tail-and-ingest] redis: unavailable (' + e.message + ') — using in-memory dedup');
  }
  return redis;
}

async function alreadySeen(hash) {
  const r = await getRedis();
  if (r) {
    if (DRY_RUN) {
      // Don't write to Redis during dry-run — pollutes real ingest dedup.
      return Boolean(await r.sismember('mcp:err:hash', hash));
    }
    const added = await r.sadd('mcp:err:hash', hash);
    return added === 0;
  }
  if (memSeenHashes.has(hash)) return true;
  if (!DRY_RUN) memSeenHashes.add(hash);
  return false;
}

function hashOf(text) {
  return createHash('sha1').update(text).digest('hex');
}

function looksLikeStarter(line) {
  return ERROR_STARTERS.some((re) => re.test(line));
}

// Extract a multi-line error block starting at index i. Stop on first blank
// line or a non-indented line that isn't itself a starter.
function extractBlock(lines, i) {
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length && out.length < 80; j++) {
    const ln = lines[j];
    if (ln.trim() === '') break;
    // Continuation: stack frame ("    at ..."), indented detail, or "Caused by"
    if (/^\s+at\s/.test(ln) || /^\s{2,}/.test(ln) || /^Caused by/.test(ln) || ln.trim().startsWith('|')) {
      out.push(ln);
      continue;
    }
    // Another starter immediately after = end of this block.
    if (looksLikeStarter(ln)) break;
    // Otherwise treat as trailing context, then stop.
    out.push(ln);
    break;
  }
  return out.join('\n').slice(0, 8000);
}

async function ingestError(errorText, srcFile) {
  const hash = hashOf(errorText);
  if (await alreadySeen(hash)) return { skipped: true, hash };
  if (DRY_RUN) {
    console.log(`[dry-run] would ingest hash=${hash.slice(0, 12)} src=${path.basename(srcFile)} preview=${errorText.split('\n')[0].slice(0, 100)}`);
    return { dryRun: true, hash };
  }

  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: 'kag.ingest_error', arguments: { errorText } },
  };
  try {
    const res = await fetch(`${MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[tail-and-ingest] MCP HTTP ${res.status} for hash=${hash.slice(0, 12)}`);
      return { failed: true, hash, status: res.status };
    }
    const raw = await res.text();
    let envelope = null;
    for (const line of raw.split('\n')) {
      if (line.startsWith('data: ')) { try { envelope = JSON.parse(line.slice(6)); break; } catch {} }
    }
    if (envelope?.result?.isError) {
      console.error(`[tail-and-ingest] MCP returned isError for hash=${hash.slice(0, 12)}`);
      return { failed: true, hash };
    }
    console.log(`[ingested] hash=${hash.slice(0, 12)} src=${path.basename(srcFile)} bytes=${errorText.length}`);
    return { ingested: true, hash };
  } catch (e) {
    console.error(`[tail-and-ingest] POST failed for hash=${hash.slice(0, 12)}: ${e.message}`);
    return { failed: true, hash, error: e.message };
  }
}

async function processFileTail(filePath) {
  let stat;
  try { stat = statSync(filePath); } catch { return; }
  const prevOffset = fileOffsets.get(filePath) ?? 0;
  // File rotated/truncated → start over.
  const start = stat.size < prevOffset ? 0 : prevOffset;
  if (stat.size === start) return;

  const fullText = readFileSync(filePath, 'utf8');
  const tailText = fullText.slice(start);
  fileOffsets.set(filePath, stat.size);

  const lines = tailText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!looksLikeStarter(lines[i])) continue;
    const block = extractBlock(lines, i);
    await ingestError(block, filePath);
  }
}

async function main() {
  if (!existsSync(LOG_DIR)) {
    console.error(`[tail-and-ingest] log dir does not exist: ${LOG_DIR} (waiting for first MCP spawn)`);
  }

  if (BACKFILL) {
    const { readdirSync } = await import('node:fs');
    const files = existsSync(LOG_DIR)
      ? readdirSync(LOG_DIR).filter((f) => f.endsWith('.err')).map((f) => path.join(LOG_DIR, f))
      : [];
    console.error(`[tail-and-ingest] backfill mode — scanning ${files.length} .err files`);
    for (const f of files) await processFileTail(f);
    if (redis) await redis.quit().catch(() => {});
    return;
  }

  console.error(`[tail-and-ingest] watching ${LOG_DIR}/launch-*.err  (mcp=${MCP_URL}${DRY_RUN ? ', DRY-RUN' : ''})`);
  const watcher = chokidar.watch(path.join(LOG_DIR, 'launch-*.err'), {
    ignoreInitial: false,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
  });
  watcher.on('add',    (p) => processFileTail(p).catch((e) => console.error('[add]',    e.message)));
  watcher.on('change', (p) => processFileTail(p).catch((e) => console.error('[change]', e.message)));
  watcher.on('error',  (e) => console.error('[chokidar]', e?.message || e));

  // Graceful shutdown
  const shutdown = async () => {
    await watcher.close().catch(() => {});
    if (redis) await redis.quit().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1); });
