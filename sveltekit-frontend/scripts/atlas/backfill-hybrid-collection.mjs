/**
 * backfill-hybrid-collection.mjs
 *
 * Backfills `codebase_chunks_384_hybrid` in Qdrant from Postgres `codebase_chunk_index`.
 *
 * Usage:
 *   node scripts/atlas/backfill-hybrid-collection.mjs [--dry-run] [--batch N]
 *
 * Flags:
 *   --dry-run    Log what would be upserted; write nothing to Qdrant
 *   --batch N    Override batch size (default 200)
 */

import pg from 'pg';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const COLLECTION = 'codebase_chunks_384_hybrid';
const QDRANT_BASE = 'http://localhost:6333';
const TOTAL_ESTIMATE = 52380;
const DEFAULT_BATCH = 50; // 50 pts × ~9KB JSON ≈ 450KB, well within Qdrant 10MB limit
const PROGRESS_INTERVAL = 500; // log every N upserted

const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5434', 10),
  user: process.env.PG_USER || 'legal_admin',
  password: process.env.PG_PASSWORD || process.env.POSTGRES_PASSWORD || '123456',
  database: process.env.PG_DATABASE || 'legal_ai_db',
};

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const UPDATE_SPARSE = args.includes('--update-sparse'); // re-populate bm42_sparse on existing points
const batchIdx = args.indexOf('--batch');
const BATCH_SIZE = batchIdx !== -1 ? parseInt(args[batchIdx + 1], 10) : DEFAULT_BATCH;

if (isNaN(BATCH_SIZE) || BATCH_SIZE < 1) {
  console.error('Invalid --batch value');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * Parse a Postgres halfvec / vector string "[0.1,0.2,...]" → Float32Array.
 * Returns null if input is null/undefined/empty.
 */
function parseHalfvec(raw) {
  if (!raw) return null;
  const str = typeof raw === 'string' ? raw : String(raw);
  const trimmed = str.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!trimmed) return null;
  const parts = trimmed.split(',');
  const arr = new Float32Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    arr[i] = parseFloat(parts[i]);
  }
  return arr;
}

/**
 * Take the first `dim` values of a Float32Array and return a plain JS Array
 * (Qdrant JSON payload needs a plain array, not a typed array).
 */
function truncateVector(arr, dim) {
  if (!arr || arr.length < dim) return null;
  const out = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = arr[i];
  return out;
}

// ---------------------------------------------------------------------------
// BM42 sparse encoder — matches src/lib/server/vector/bm42-sparse.ts exactly
// (FNV-1a, 2M vocab slots, log(1+TF), legal 2× boost, L2-norm)
// Cannot import .ts directly from .mjs; keep in sync manually.
// ---------------------------------------------------------------------------

const BM42_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
  'through', 'after', 'before', 'above', 'below', 'and', 'or', 'not',
  'but', 'if', 'then', 'than', 'so', 'no', 'nor', 'too', 'very',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own',
  'same', 'just', 'also', 'any', 'it', 'its',
]);

function tokenToIndex(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h >>>= 0;
  }
  return h % 2_000_000;
}

function buildSparseVector(text) {
  if (!text) return { indices: [], values: [] };

  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s§./-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !BM42_STOP_WORDS.has(t));

  if (tokens.length === 0) return { indices: [], values: [] };

  // Count TF with legal boost flag
  const tf = new Map();
  for (const token of tokens) {
    const idx = tokenToIndex(token);
    const isLegal = token.startsWith('§') || token.includes('u.s.c') || token.includes('cfr');
    const entry = tf.get(idx);
    if (entry) {
      entry.count++;
      if (isLegal) entry.isLegal = true;
    } else {
      tf.set(idx, { count: 1, isLegal });
    }
  }

  const indices = [];
  const values = [];
  for (const [idx, { count, isLegal }] of tf) {
    indices.push(idx);
    values.push(Math.log(1 + count) * (isLegal ? 2.0 : 1.0));
  }

  // L2-normalize
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < values.length; i++) values[i] /= norm;
  }

  // Qdrant sparse vectors must be sorted by index
  const order = indices.map((_, i) => i).sort((a, b) => indices[a] - indices[b]);
  return {
    indices: order.map(i => indices[i]),
    values: order.map(i => parseFloat(values[i].toFixed(6))),
  };
}

// ---------------------------------------------------------------------------
// Qdrant helpers
// ---------------------------------------------------------------------------

async function qdrantGet(path) {
  const res = await fetch(`${QDRANT_BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Qdrant GET ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

async function qdrantPost(path, body) {
  const res = await fetch(`${QDRANT_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Qdrant POST ${path} → ${res.status}: ${txt}`);
  }
  return res.json();
}

/**
 * Load all existing point IDs from the Qdrant collection via scroll.
 * Returns a Set<string> of UUID strings.
 */
async function loadExistingIds() {
  const existing = new Set();
  let nextOffset = null;
  let page = 0;

  console.log(`[${timestamp()}] Loading existing point IDs from Qdrant...`);

  do {
    const body = {
      limit: 1000,
      with_payload: false,
      with_vector: false,
    };
    if (nextOffset !== null) body.offset = nextOffset;

    const resp = await qdrantPost(`/collections/${COLLECTION}/points/scroll`, body);
    const points = resp.result?.points ?? [];
    for (const pt of points) existing.add(pt.id);

    nextOffset = resp.result?.next_page_offset ?? null;
    page++;
    if (page % 10 === 0) {
      console.log(`[${timestamp()}]   Scrolled ${existing.size} existing IDs...`);
    }
  } while (nextOffset !== null);

  console.log(`[${timestamp()}] Found ${existing.size} existing point(s) in Qdrant — will skip these.`);
  return existing;
}

/**
 * Upsert a batch of points to Qdrant using PUT (upsert endpoint).
 */
async function upsertBatch(points) {
  const res = await fetch(`${QDRANT_BASE}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Qdrant PUT /collections/${COLLECTION}/points → ${res.status}: ${txt}`);
  }
}

/**
 * Update only the vector component of existing points (--update-sparse mode).
 * Uses PUT /points/vectors which patches named vectors without touching payload.
 */
async function updateVectorsBatch(points) {
  // points format: [{ id, vectors: { bm42_sparse: { indices, values } } }]
  const res = await fetch(`${QDRANT_BASE}/collections/${COLLECTION}/points/vectors?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Qdrant PUT /points/vectors → ${res.status}: ${txt}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[${timestamp()}] backfill-hybrid-collection starting`);
  console.log(`[${timestamp()}] Collection : ${COLLECTION}`);
  console.log(`[${timestamp()}] Batch size : ${BATCH_SIZE}`);
  console.log(`[${timestamp()}] Dry run    : ${DRY_RUN}`);
  if (UPDATE_SPARSE) console.log(`[${timestamp()}] Mode       : --update-sparse (patch bm42_sparse on all existing points)`);
  console.log('');

  // Verify collection exists
  try {
    await qdrantGet(`/collections/${COLLECTION}`);
    console.log(`[${timestamp()}] Qdrant collection verified ✓`);
  } catch (err) {
    console.error(`[${timestamp()}] ERROR: Collection "${COLLECTION}" not found in Qdrant.`);
    console.error(`[${timestamp()}]        ${err.message}`);
    process.exit(1);
  }

  // In --update-sparse mode skip the existing-ID scan (we want to update ALL points)
  const existingIds = UPDATE_SPARSE ? new Set() : await loadExistingIds();

  // Connect to Postgres — keepAlive prevents router/OS from dropping idle TCP sockets
  const pool = new pg.Pool({
    ...PG_CONFIG,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    idleTimeoutMillis: 0,            // never idle-timeout connections in a long script
    connectionTimeoutMillis: 15_000,
    max: 3,
  });
  pool.on('error', (err) => {
    console.error(`[${timestamp()}] Pool background error (non-fatal): ${err.message}`);
  });
  console.log(`[${timestamp()}] Postgres pool created (keepAlive=true, idleTimeout=0)`);

  let offset = 0;
  let totalUpserted = 0;
  let totalSkipped = 0;
  let lastProgressLog = 0;

  const QUERY = `SELECT
           id::text,
           chunk_id,
           relative_path,
           symbol,
           kind,
           line_start,
           line_end,
           content_embedding::text,
           summary_embedding::text,
           content,
           summary,
           language,
           domain,
           semantic_tags,
           content_hash,
           token_count
         FROM codebase_chunk_index
         WHERE content_embedding IS NOT NULL
         ORDER BY id
         OFFSET $1 LIMIT $2`;

  /** Run a query with one automatic retry on connection failure. */
  async function queryPage(offset, limit) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const client = await pool.connect();
      try {
        const result = await client.query(QUERY, [offset, limit]);
        client.release();
        return result;
      } catch (err) {
        client.release(true); // destroy broken socket, don't recycle
        if (attempt === 2) throw err;
        const delay = 2000 * (attempt + 1);
        console.warn(`[${timestamp()}] DB error (attempt ${attempt + 1}/3), retrying in ${delay}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  try {
    while (true) {
      const { rows } = await queryPage(offset, BATCH_SIZE);

      if (rows.length === 0) break;

      // Build Qdrant point objects
      const points = [];

      for (const row of rows) {
        const id = row.id; // uuid as string

        // Skip if already in Qdrant
        if (existingIds.has(id)) {
          totalSkipped++;
          continue;
        }

        // Parse and truncate embeddings to 384 dims
        const contentVecFull = parseHalfvec(row.content_embedding);
        const contentVec384 = truncateVector(contentVecFull, 384);

        if (!contentVec384) {
          // Should not happen given WHERE clause, but guard anyway
          console.warn(`[${timestamp()}] WARN: id=${id} has null content_embedding after parse, skipping`);
          continue;
        }

        const summaryVecFull = parseHalfvec(row.summary_embedding);
        const summaryVec384 = truncateVector(summaryVecFull, 384);

        // Build sparse BM42 vector from content
        const sparse = buildSparseVector(row.content ?? '');

        // Named vectors payload — Qdrant 1.7+ unifies dense and sparse under "vectors"
        // sparse_vectors (separate key) is silently ignored; sparse must go in "vectors"
        const vectors = { content: contentVec384 };
        if (summaryVec384) vectors.summary = summaryVec384;
        if (sparse.indices.length > 0) vectors.bm42_sparse = sparse;

        const point = UPDATE_SPARSE
          ? { id, vectors: { bm42_sparse: sparse } }  // vector-patch only, no payload re-upload
          : {
            id,
            vectors,
            payload: {
              chunk_id: row.chunk_id ?? null,
              source_ref: row.relative_path ?? null,
              relative_path: row.relative_path ?? null,
              symbol: row.symbol ?? null,
              kind: row.kind ?? null,
              line_start: row.line_start ?? null,
              line_end: row.line_end ?? null,
              content: row.content ?? null,
              summary: row.summary ?? null,
              language: row.language ?? null,
              domain: row.domain ?? null,
              semantic_tags: row.semantic_tags ?? [],
              content_hash: row.content_hash ?? null,
              token_count: row.token_count ?? null,
            },
          };

        points.push(point);
      }

      if (DRY_RUN) {
        if (points.length > 0) {
          console.log(
            `[${timestamp()}] [DRY-RUN] Would upsert ${points.length} point(s) ` +
            `(offset=${offset}, skipped=${rows.length - points.length})`
          );
          // Print first point as sample on first batch
          if (offset === 0 && points.length > 0) {
            const sample = points[0];
            console.log(`[${timestamp()}] [DRY-RUN] Sample point id=${sample.id}`);
            if (!UPDATE_SPARSE) {
              console.log(`[${timestamp()}] [DRY-RUN]   content vec[0..4]: ${sample.vectors.content.slice(0, 4).join(', ')}`);
              console.log(`[${timestamp()}] [DRY-RUN]   summary vec present: ${!!sample.vectors.summary}`);
              console.log(`[${timestamp()}] [DRY-RUN]   payload.source_ref: ${sample.payload?.source_ref}`);
            }
            console.log(`[${timestamp()}] [DRY-RUN]   sparse indices count: ${(sample.vectors.bm42_sparse?.indices ?? []).length}`);
          }
        }
        totalUpserted += points.length;
        totalSkipped += rows.length - points.length;
      } else {
        if (points.length > 0) {
          if (UPDATE_SPARSE) {
            await updateVectorsBatch(points);
          } else {
            await upsertBatch(points);
          }
          totalUpserted += points.length;
        }
        totalSkipped += rows.length - points.length;
      }

      // Progress logging
      if (totalUpserted - lastProgressLog >= PROGRESS_INTERVAL) {
        console.log(`[${timestamp()}] Upserted ${totalUpserted} / ${TOTAL_ESTIMATE} (skipped ${totalSkipped})`);
        lastProgressLog = totalUpserted;
      }

      offset += rows.length;

      // If we got fewer rows than the batch size, we've reached the end
      if (rows.length < BATCH_SIZE) break;
    }
  } finally {
    await pool.end();
  }

  console.log('');
  console.log(`[${timestamp()}] ─────────────────────────────────────────`);
  console.log(`[${timestamp()}] Backfill complete`);
  console.log(`[${timestamp()}]   Upserted : ${totalUpserted}`);
  console.log(`[${timestamp()}]   Skipped  : ${totalSkipped} (already in Qdrant)`);
  if (DRY_RUN) {
    console.log(`[${timestamp()}]   Mode     : DRY RUN — no writes made`);
  }
  console.log(`[${timestamp()}] ─────────────────────────────────────────`);
}

main().catch(err => {
  console.error(`[${timestamp()}] FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
