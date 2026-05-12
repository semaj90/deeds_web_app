/**
 * graphify-persist-couchdb.mjs
 *
 * Reads all Redis `wiki:note:dir:*` keys that have a `gemma4Summary` field
 * and upserts them as CouchDB documents into the `codebase_graph` database.
 *
 * After upserting directory glyph docs it also ensures the
 * `_design/directory_glyphs` design document (with a `cluster_links` view)
 * exists in the database.
 *
 * Usage:
 *   node scripts/graphify-persist-couchdb.mjs [options]
 *
 * Options:
 *   --force          Overwrite existing docs (default: skip)
 *   --limit N        Process at most N docs
 *   --dir <path>     Only process the doc for this single directory
 *   --quiet          Suppress per-doc progress lines
 */

import { createRequire } from 'module';
import { parseArgs } from 'util';

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: argv } = parseArgs({
  options: {
    force:  { type: 'boolean', default: false },
    limit:  { type: 'string'  },
    dir:    { type: 'string'  },
    quiet:  { type: 'boolean', default: false },
  },
  strict: false,
});

const FORCE   = argv.force  ?? false;
const LIMIT   = argv.limit  ? parseInt(argv.limit, 10) : Infinity;
const SINGLE  = argv.dir    ?? null;
const QUIET   = argv.quiet  ?? false;

function log(...args) {
  if (!QUIET) console.log(...args);
}

// ── Environment ───────────────────────────────────────────────────────────────

const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://127.0.0.1:6379';
const COUCHDB_RAW = process.env.COUCHDB_URL ?? 'http://admin:deeds123@127.0.0.1:5984';
const COUCHDB_DB  = 'codebase_graph';
const BATCH_SIZE  = 50;

// ── CouchDB URL parsing (mirrors couchdb-pagerank.ts lines 24-37) ─────────────

function parseCouchUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const authHeader = {};
    if (u.username) {
      authHeader['Authorization'] = `Basic ${Buffer.from(`${u.username}:${u.password}`).toString('base64')}`;
      u.username = '';
      u.password = '';
    }
    return { baseUrl: u.toString().replace(/\/$/, ''), authHeader };
  } catch {
    return { baseUrl: rawUrl, authHeader: {} };
  }
}

const { baseUrl: COUCH_BASE, authHeader: COUCH_AUTH } = parseCouchUrl(COUCHDB_RAW);

// ── Redis helpers (ioredis, dynamic import — no TypeScript) ───────────────────

async function createRedis() {
  const req = createRequire(import.meta.url);
  // ioredis ships as a CommonJS default export in some versions
  let Redis;
  try {
    Redis = req('ioredis');
    if (Redis.default) Redis = Redis.default;
  } catch {
    throw new Error('ioredis not found — run: npm install ioredis');
  }
  const client = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
  await client.connect();
  // D16: attach Symbol.asyncDispose so callers can `await using redis = ...`
  // The handler swallows quit errors (already-disconnected case is fine).
  Object.defineProperty(client, Symbol.asyncDispose, {
    value: async () => { try { await client.quit(); } catch { /* fine */ } },
    configurable: true, writable: false, enumerable: false,
  });
  return client;
}

// ── CouchDB fetch wrappers ────────────────────────────────────────────────────

async function couchFetch(path, options = {}) {
  const url = `${COUCH_BASE}/${COUCHDB_DB}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...COUCH_AUTH,
      ...(options.headers ?? {}),
    },
    signal: options.signal ?? AbortSignal.timeout(30_000),
  });
  return res;
}

/** Returns { exists, rev } for a single doc id. Uses HEAD request (no body). */
async function headDoc(id) {
  const res = await couchFetch(`/${encodeURIComponent(id)}`, { method: 'HEAD' }).catch(() => null);
  if (!res) return { exists: false, rev: null };
  if (res.status === 404) return { exists: false, rev: null };
  if (res.ok) {
    // CouchDB returns ETag as the _rev (quoted)
    const etag = res.headers.get('ETag') ?? res.headers.get('etag') ?? '';
    const rev  = etag.replace(/^"|"$/g, '') || null;
    return { exists: true, rev };
  }
  return { exists: false, rev: null };
}

/** Fetch current _revs for a batch of ids via _all_docs POST. */
async function fetchRevMap(ids) {
  const revMap = new Map();
  if (ids.length === 0) return revMap;

  const res = await couchFetch('/_all_docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: ids }),
  }).catch(() => null);

  if (res?.ok) {
    const data = await res.json();
    for (const row of data.rows ?? []) {
      if (row.value?.rev) revMap.set(row.id, row.value.rev);
    }
  }
  return revMap;
}

/** Bulk-write up to BATCH_SIZE docs via _bulk_docs. Returns { written, failed }. */
async function bulkWrite(docs) {
  if (docs.length === 0) return { written: 0, failed: 0 };

  const res = await couchFetch('/_bulk_docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docs }),
  }).catch(() => null);

  if (!res?.ok) return { written: 0, failed: docs.length };

  const results = await res.json();
  let written = 0;
  let failed  = 0;
  for (const r of results) {
    if (r.ok) written++;
    else {
      failed++;
      if (!QUIET) console.warn(`  [warn] ${r.id}: ${r.error} — ${r.reason}`);
    }
  }
  return { written, failed };
}

// ── Design document: _design/directory_glyphs ─────────────────────────────────

async function ensureDirectoryGlyphsDesignDoc() {
  const designId  = '_design/directory_glyphs';
  const designDoc = {
    _id: designId,
    views: {
      cluster_links: {
        map: `function(doc) {
  if (doc.type !== 'directory_glyph') return;
  emit(doc.auditMetrics && doc.auditMetrics.fileCount, { dir: doc.dir, score: doc.auditScore });
}`,
      },
    },
  };

  // Check if already exists to obtain _rev for update
  const checkRes = await couchFetch(`/${encodeURIComponent(designId)}`, {
    method: 'GET',
  }).catch(() => null);

  if (checkRes?.ok) {
    const existing = await checkRes.json();
    designDoc._rev = existing._rev;
  }

  const putRes = await couchFetch(`/${encodeURIComponent(designId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(designDoc),
  }).catch(() => null);

  if (putRes?.ok) {
    log('[couchdb] Design doc _design/directory_glyphs ensured');
  } else {
    const body = putRes ? await putRes.text().catch(() => '') : '(fetch failed)';
    console.warn(`[couchdb] Could not upsert design doc: ${putRes?.status} ${body}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[graphify-persist-couchdb] Starting…');
  console.log(`  Redis:   ${REDIS_URL}`);
  console.log(`  CouchDB: ${COUCH_BASE}/${COUCHDB_DB}`);
  console.log(`  force=${FORCE}  limit=${LIMIT === Infinity ? 'none' : LIMIT}  dir=${SINGLE ?? 'all'}  quiet=${QUIET}`);

  // 1. Connect to Redis — D16: `await using` auto-disposes on scope exit
  // even on throw. Replaces the previous try/finally redis.quit() pattern.
  await using redis = await createRedis();

  try {
    // 2. Discover wiki:note:dir:* keys
    let keys;
    if (SINGLE) {
      // Single-dir mode: construct key directly
      const key = `wiki:note:dir:${SINGLE}`;
      const exists = await redis.exists(key);
      keys = exists ? [key] : [];
      if (!exists) console.warn(`[redis] Key not found: ${key}`);
    } else {
      log('[redis] Scanning wiki:note:dir:* …');
      keys = await redis.keys('wiki:note:dir:*');
      log(`[redis] Found ${keys.length} wiki:note:dir:* keys`);
    }

    if (keys.length === 0) {
      console.log('[graphify-persist-couchdb] No wiki:note:dir:* keys found — nothing to persist.');
      return;
    }

    // 3. Fetch all Redis values and filter to those with gemma4Summary
    log('[redis] Fetching values…');
    const pipeline = redis.pipeline();
    for (const k of keys) pipeline.hgetall(k);
    const rawValues = await pipeline.exec(); // [[err, value], ...]

    /** @type {Array<{ key: string, dir: string, data: Record<string,string> }>} */
    const candidates = [];
    for (let i = 0; i < keys.length; i++) {
      const [err, data] = rawValues[i];
      if (err || !data || typeof data !== 'object') continue;
      if (!data.gemma4Summary) continue; // only LLM-summarised entries
      const dir = keys[i].replace(/^wiki:note:dir:/, '');
      candidates.push({ key: keys[i], dir, data });
    }

    log(`[redis] ${candidates.length} / ${keys.length} keys have gemma4Summary`);

    if (candidates.length === 0) {
      console.log('[graphify-persist-couchdb] No summarised directory notes — run graphify:cluster-summaries first.');
      return;
    }

    // 4. Apply --limit
    const toProcess = candidates.slice(0, LIMIT === Infinity ? candidates.length : LIMIT);
    if (toProcess.length < candidates.length) {
      log(`[graphify-persist-couchdb] Limiting to first ${toProcess.length} docs (--limit ${LIMIT})`);
    }

    // 5. Build CouchDB doc objects
    function buildDoc(dir, data) {
      // Parse JSON fields that were stored as strings in Redis hashes
      function tryParse(val) {
        if (val === undefined || val === null) return undefined;
        try { return JSON.parse(val); } catch { return val; }
      }

      const doc = {
        _id:               `dir-glyph:${dir}`,
        type:              'directory_glyph',
        dir,
        gemma4Summary:     data.gemma4Summary,
        representativeFiles: tryParse(data.representativeFiles) ?? [],
        auditScore:        data.auditScore        != null ? Number(data.auditScore)        : undefined,
        dominantTags:      tryParse(data.dominantTags)      ?? [],
        auditMetrics:      tryParse(data.auditMetrics)      ?? {},
        warnings:          tryParse(data.warnings)          ?? [],
        embeddingId:       data.embeddingId       != null ? Number(data.embeddingId)       : undefined,
        generatedAt:       data.generatedAt       ?? new Date().toISOString(),
      };

      // Remove undefined fields to keep docs tidy
      for (const k of Object.keys(doc)) {
        if (doc[k] === undefined) delete doc[k];
      }

      return doc;
    }

    // 6. Determine which docs already exist in CouchDB (batch HEAD via _all_docs)
    const docIds = toProcess.map(({ dir }) => `dir-glyph:${dir}`);
    log(`[couchdb] Checking ${docIds.length} doc IDs for existing revisions…`);
    const revMap = await fetchRevMap(docIds);

    // 7. Decide which to write
    const docsToWrite = [];
    let skipped = 0;

    for (const { dir, data } of toProcess) {
      const id  = `dir-glyph:${dir}`;
      const rev = revMap.get(id);

      if (rev && !FORCE) {
        // Exists and no --force → skip
        log(`  [skip] ${id}`);
        skipped++;
        continue;
      }

      const doc = buildDoc(dir, data);
      if (rev) doc._rev = rev; // carry _rev for update (force-overwrite)
      docsToWrite.push(doc);
    }

    log(`[graphify-persist-couchdb] ${docsToWrite.length} to write, ${skipped} skipped (already exist)`);

    // 8. Batch-write in groups of BATCH_SIZE
    let totalWritten = 0;
    let totalFailed  = 0;

    for (let i = 0; i < docsToWrite.length; i += BATCH_SIZE) {
      const batch = docsToWrite.slice(i, i + BATCH_SIZE);
      const { written, failed } = await bulkWrite(batch);
      totalWritten += written;
      totalFailed  += failed;

      const end = Math.min(i + BATCH_SIZE, docsToWrite.length);
      log(`[couchdb] Batch ${Math.floor(i / BATCH_SIZE) + 1}: wrote ${written}/${batch.length} (${i + 1}–${end} of ${docsToWrite.length})`);
    }

    // 9. Ensure design document
    await ensureDirectoryGlyphsDesignDoc();

    // 10. Summary
    console.log('\n[graphify-persist-couchdb] Done.');
    console.log(`  Docs written : ${totalWritten}`);
    console.log(`  Docs skipped : ${skipped}`);
    console.log(`  Docs failed  : ${totalFailed}`);
    console.log(`  Design doc   : _design/directory_glyphs (cluster_links view)`);
  }
  // No finally needed — `await using redis` disposes on scope exit (even on throw).
}

main().catch((err) => {
  console.error('[graphify-persist-couchdb] Fatal error:', err);
  process.exit(1);
});
