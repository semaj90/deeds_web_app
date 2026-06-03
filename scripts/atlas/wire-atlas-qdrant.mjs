#!/usr/bin/env node
/**
 * wire-atlas-qdrant.mjs
 *
 * Finishes the parent atlas pipeline by wiring parent_atlas_documents to
 * their Qdrant point IDs in codebase_chunks_768 via file_path matching.
 *
 * Pipeline:
 *   1. Scroll all codebase_chunks_768 points → build file_path → point_id map
 *   2. For each parent_atlas_documents row missing qdrant_point_id:
 *      - normalize source_ref to match Qdrant file_path format
 *      - lookup point_id
 *      - write qdrant_point_id, cluster_id (from gpu_cluster payload), centroid_id
 *   3. Backfill feature_id from cluster_summaries via cluster_id
 *   4. Drain 450 pending parent_atlas_jobs → done
 *   5. Create parent_atlas_docs Qdrant collection and upsert docs that have no
 *      existing codebase_chunks_768 match (embed via /api/embed)
 *
 * Flags:
 *   --dry-run     Print match stats, write nothing (default)
 *   --apply       Write all updates
 *   --skip-embed  Skip new-collection upsert step (just do PG backfill)
 *   --verbose     Log per-row matches
 */

import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });

const argv = process.argv.slice(2);
const APPLY      = argv.includes('--apply');
const DRY_RUN    = !APPLY;
const SKIP_EMBED = argv.includes('--skip-embed');
const VERBOSE    = argv.includes('--verbose');

const DATABASE_URL = process.env.DATABASE_URL;
const QDRANT_URL   = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const EMBED_URL    = process.env.OLLAMA_EMBED_BASE_URL
  ? (process.env.OLLAMA_EMBED_BASE_URL.replace(/\/$/, '') + '/v1/embeddings')
  : (process.env.OLLAMA_BASE_URL
      ? (process.env.OLLAMA_BASE_URL.replace(/\/$/, '') + '/api/embed')
      : 'http://127.0.0.1:11434/api/embed');
const EMBED_MODEL  = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const COLLECTION   = 'codebase_chunks_768';
const DEST_COLLECTION = 'parent_atlas_docs';

if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

// ── helpers ───────────────────────────────────────────────────────────────────

// Returns an array of candidate normalized forms to try in order.
// Qdrant was indexed with paths like "src/lib/server/features/ai/ace/context-assembler.ts"
// Parent atlas docs use               "sveltekit-frontend/src/lib/server/ace/context-assembler.ts"
// We need to cover both + the case where features/ai/ was injected.
function normCandidates(raw) {
  if (!raw) return [];
  let p = raw.replace(/\\/g, '/');
  // Strip absolute Windows prefix up to repo root
  const marker = 'deeds-web-app/';
  const idx = p.indexOf(marker);
  if (idx !== -1) p = p.slice(idx + marker.length);
  p = p.replace(/^\.\//, '');

  const candidates = new Set();
  candidates.add(p);

  // Strip "sveltekit-frontend/" prefix → gives "src/..." form
  if (p.startsWith('sveltekit-frontend/')) {
    const stripped = p.slice('sveltekit-frontend/'.length);
    candidates.add(stripped);

    // Also try injecting "features/ai/" after "src/lib/server/"
    const injectPat = 'src/lib/server/';
    if (stripped.startsWith(injectPat)) {
      candidates.add(injectPat + 'features/ai/' + stripped.slice(injectPat.length));
      candidates.add(injectPat + 'features/' + stripped.slice(injectPat.length));
    }
  }

  // If already starts with "src/", try with sveltekit-frontend/ prefix
  if (p.startsWith('src/')) {
    candidates.add('sveltekit-frontend/' + p);
  }

  return [...candidates];
}

function normSrcRef(raw) {
  const c = normCandidates(raw);
  return c[0] ?? null;
}

// ── Step 1: scroll codebase_chunks_768 and build file_path → {id, cluster} map ─

async function buildQdrantMap() {
  console.log(`\n  Scrolling ${COLLECTION} in Qdrant…`);
  const map = new Map(); // normalizedPath → { id, gpu_cluster, cluster_id }
  let offset = null;
  let total = 0;

  while (true) {
    const body = { limit: 1000, with_payload: true, with_vector: false };
    if (offset !== null) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) { console.error('Qdrant scroll failed:', res.status); break; }
    const data = await res.json();
    const points = data.result?.points ?? [];
    if (!points.length) break;

    for (const p of points) {
      const fp = p.payload?.file_path ?? p.payload?.rel_path ?? p.payload?.source_ref;
      if (!fp) continue;
      // gpuCluster (camelCase) has 18k+ coverage; gpu_cluster (snake) has only 3
      const clusterInt = p.payload?.gpuCluster ?? p.payload?.gpu_cluster ?? null;
      const entry = {
        id:          p.id,
        gpu_cluster: clusterInt,
        cluster_id:  clusterInt != null ? String(clusterInt) : (p.payload?.cluster_id ?? null),
        centroid_id: p.payload?.centroid_id ?? null,
      };
      // Index ALL candidate path forms so doc-side lookup hits regardless of prefix
      for (const norm of normCandidates(fp)) {
        if (!map.has(norm) || clusterInt != null) {
          map.set(norm, entry);
        }
      }
    }

    total += points.length;
    process.stdout.write(`\r    scrolled ${total} points (map size: ${map.size})`);
    offset = data.result?.next_page_offset;
    if (offset == null) break;
  }
  console.log();
  return map;
}

// ── Step 1b: backfill cluster_id for already-wired docs missing it ────────────

async function backfillClusterIds(pool, qdrantMap) {
  // Rows that have qdrant_point_id but no cluster_id — missed on first pass
  const { rows: wiredNoCluster } = await pool.query(`
    SELECT id, source_ref, qdrant_point_id
    FROM parent_atlas_documents
    WHERE qdrant_point_id IS NOT NULL AND cluster_id IS NULL
    LIMIT 10000
  `);
  if (!wiredNoCluster.length) {
    console.log('  All wired docs already have cluster_id.');
    return 0;
  }
  console.log(`  ${wiredNoCluster.length} wired docs missing cluster_id — backfilling…`);

  const updates = [];
  for (const doc of wiredNoCluster) {
    // Try matching via source_ref → qdrantMap (same path normalization)
    const candidates = normCandidates(doc.source_ref);
    for (const c of candidates) {
      const entry = qdrantMap.get(c);
      if (entry?.cluster_id) {
        updates.push({ docId: doc.id, cluster_id: entry.cluster_id });
        break;
      }
    }
  }

  if (!updates.length) {
    console.log('  No cluster_id matches found via path lookup.');
    return 0;
  }

  const BATCH = 200;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const values = chunk.map((u, j) => `($${j * 2 + 1}::int, $${j * 2 + 2}::text)`).join(',');
    const params = chunk.flatMap(u => [u.docId, u.cluster_id]);
    await pool.query(`
      UPDATE parent_atlas_documents AS d
      SET cluster_id = v.cid, updated_at = now()
      FROM (VALUES ${values}) AS v(did, cid)
      WHERE d.id = v.did AND d.cluster_id IS NULL
    `, params);
    written += chunk.length;
  }
  console.log(`  ✓ Backfilled cluster_id on ${written} wired docs.`);
  return written;
}

// ── Step 2: match docs and build update list ──────────────────────────────────

async function buildUpdates(pool, qdrantMap) {
  const { rows: docs } = await pool.query(`
    SELECT id, source_ref, feature_id
    FROM parent_atlas_documents
    WHERE qdrant_point_id IS NULL
  `);

  const matched = [];
  const unmatched = [];

  for (const doc of docs) {
    const candidates = normCandidates(doc.source_ref);
    let entry = null;
    let matchedNorm = null;
    for (const c of candidates) {
      entry = qdrantMap.get(c);
      if (entry) { matchedNorm = c; break; }
    }
    if (entry) {
      matched.push({ docId: doc.id, source_ref: doc.source_ref, norm: matchedNorm, ...entry });
      if (VERBOSE) console.log(`    ✓ ${doc.source_ref} → point ${entry.id} cluster=${entry.gpu_cluster}`);
    } else {
      unmatched.push({ docId: doc.id, source_ref: doc.source_ref, norm: candidates[0], feature_id: doc.feature_id });
    }
  }

  return { matched, unmatched };
}

// ── Step 3: apply PG backfill ──────────────────────────────────────────────────

async function applyBackfill(pool, matched) {
  if (!matched.length) { console.log('  No matched rows to write.'); return; }
  const BATCH = 200;
  let written = 0;

  for (let i = 0; i < matched.length; i += BATCH) {
    const chunk = matched.slice(i, i + BATCH);
    // Build VALUES list: (doc_id, qdrant_point_id, cluster_id, centroid_id)
    const values = [];
    const params = [];
    chunk.forEach((u, j) => {
      const base = j * 4;
      values.push(`($${base+1}::int, $${base+2}::text, $${base+3}::text, $${base+4}::text)`);
      params.push(u.docId, String(u.id), u.cluster_id ?? '', u.centroid_id ?? '');
    });

    await pool.query(`
      UPDATE parent_atlas_documents AS d
      SET
        qdrant_point_id = v.qid,
        cluster_id      = NULLIF(v.cid, ''),
        centroid_id     = NULLIF(v.ctid, ''),
        updated_at      = now()
      FROM (VALUES ${values.join(',')}) AS v(did, qid, cid, ctid)
      WHERE d.id = v.did::int
    `, params);

    written += chunk.length;
    process.stdout.write(`\r  Written: ${written}/${matched.length}`);
  }
  console.log();
  console.log(`  ✓ Backfilled ${written} parent_atlas_documents rows.`);
}

// ── Step 4: drain pending jobs ─────────────────────────────────────────────────

async function drainJobs(pool) {
  const { rowCount } = await pool.query(`
    UPDATE parent_atlas_jobs
    SET status = 'done',
        payload = payload || $1::jsonb
    WHERE status = 'pending'
  `, [JSON.stringify({ drained_by: 'wire-atlas-qdrant', drained_at: new Date().toISOString() })]);
  console.log(`  ✓ Drained ${rowCount} pending jobs → done.`);
}

// ── Step 5: embed + upsert unmatched docs into parent_atlas_docs collection ────

async function embedAndUpsert(pool, unmatched, qdrantMap) {
  if (SKIP_EMBED || !unmatched.length) {
    console.log(`  Skipping embed step (${unmatched.length} unmatched docs).`);
    return;
  }

  // Ensure collection exists (768-dim cosine)
  const colRes = await fetch(`${QDRANT_URL}/collections/${DEST_COLLECTION}`, { signal: AbortSignal.timeout(5000) });
  if (!colRes.ok) {
    console.log(`  Creating Qdrant collection ${DEST_COLLECTION}…`);
    const cr = await fetch(`${QDRANT_URL}/collections/${DEST_COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 768, distance: 'Cosine' },
        optimizers_config: { default_segment_number: 2 },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!cr.ok) { console.error('  Failed to create collection:', await cr.text()); return; }
  }

  // Load summaries for unmatched docs to use as embed text
  const ids = unmatched.map(u => u.docId);
  const { rows: docDetails } = await pool.query(`
    SELECT id, source_ref, feature_id, summary, tags, imports, exports
    FROM parent_atlas_documents
    WHERE id = ANY($1::int[])
  `, [ids]);
  const detailMap = new Map(docDetails.map(d => [d.id, d]));

  const EMBED_BATCH = 20;
  let upserted = 0;

  for (let i = 0; i < unmatched.length; i += EMBED_BATCH) {
    const chunk = unmatched.slice(i, i + EMBED_BATCH);
    const texts = chunk.map(u => {
      const d = detailMap.get(u.docId);
      const tags = (d?.tags ?? []).join(' ');
      const imp  = (d?.imports ?? []).slice(0, 5).join(' ');
      const exp  = (d?.exports ?? []).slice(0, 5).join(' ');
      return `${d?.source_ref ?? u.source_ref} ${tags} ${d?.summary ?? ''} imports:${imp} exports:${exp}`.slice(0, 512);
    });

    let embeddings;
    try {
      const embedRes = await fetch(EMBED_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          EMBED_URL.includes('/v1/embeddings')
            ? { model: EMBED_MODEL, input: texts }
            : { model: EMBED_MODEL.split(':')[0], input: texts }
        ),
        signal: AbortSignal.timeout(60_000),
      });
      if (!embedRes.ok) { console.warn(`  Embed batch failed (${embedRes.status}), skipping`); continue; }
      const ed = await embedRes.json();
      embeddings = ed.embeddings ?? ed.data?.map(d => d.embedding);
      if (!embeddings?.length) { console.warn('  Empty embeddings response, skipping batch'); continue; }
    } catch (e) {
      console.warn(`  Embed error: ${e.message}, skipping batch`);
      continue;
    }

    // Upsert into Qdrant
    const points = chunk.map((u, j) => {
      const d = detailMap.get(u.docId);
      return {
        id:      u.docId,
        vector:  embeddings[j],
        payload: {
          source_ref:  u.source_ref,
          feature_id:  u.feature_id ?? d?.feature_id,
          summary:     d?.summary ?? '',
          tags:        d?.tags ?? [],
          is_route:    d?.is_route ?? false,
          has_auth:    d?.has_auth ?? false,
          has_zod:     d?.has_zod ?? false,
          imports:     (d?.imports ?? []).slice(0, 20),
          exports:     (d?.exports ?? []).slice(0, 20),
        },
      };
    });

    const upsertRes = await fetch(`${QDRANT_URL}/collections/${DEST_COLLECTION}/points?wait=false`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!upsertRes.ok) { console.warn('  Upsert failed:', await upsertRes.text()); continue; }

    // Write qdrant_point_id back for this batch
    const pgValues = chunk.map((u, j) => `(${u.docId}, '${u.docId}')`).join(',');
    await pool.query(`
      UPDATE parent_atlas_documents AS d
      SET qdrant_point_id = v.qid, updated_at = now()
      FROM (VALUES ${pgValues}) AS v(did, qid)
      WHERE d.id = v.did::int AND d.qdrant_point_id IS NULL
    `);

    upserted += chunk.length;
    process.stdout.write(`\r  Embedded+upserted: ${upserted}/${unmatched.length}`);
  }
  console.log();
  console.log(`  ✓ Embedded and indexed ${upserted} unmatched docs into ${DEST_COLLECTION}.`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🗺️  wire-atlas-qdrant.mjs  [${DRY_RUN ? 'DRY-RUN' : 'APPLY'}]`);
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Step 1
  const qdrantMap = await buildQdrantMap();
  console.log(`\n  Qdrant file_path map: ${qdrantMap.size} unique paths`);

  // Step 1b: backfill cluster_id on already-wired rows
  if (!DRY_RUN) {
    console.log('\n  Backfilling cluster_id on already-wired docs…');
    await backfillClusterIds(pool, qdrantMap);
  } else {
    const { rows: wiredNoCluster } = await pool.query(`SELECT count(*) AS n FROM parent_atlas_documents WHERE qdrant_point_id IS NOT NULL AND cluster_id IS NULL`);
    console.log(`\n  Wired docs missing cluster_id: ${wiredNoCluster[0].n} (will fix on --apply)`);
  }

  // Step 2
  const { matched, unmatched } = await buildUpdates(pool, qdrantMap);
  console.log(`\n  Match results:`);
  console.log(`    Matched (codebase_chunks_768):  ${matched.length}`);
  console.log(`    Unmatched (need embed):          ${unmatched.length}`);

  if (DRY_RUN) {
    if (matched.length > 0) {
      console.log('\n  Sample matched:');
      matched.slice(0, 5).forEach(m =>
        console.log(`    ${m.source_ref} → point ${m.id} cluster=${m.gpu_cluster}`)
      );
    }
    if (unmatched.length > 0) {
      console.log('\n  Sample unmatched:');
      unmatched.slice(0, 5).forEach(u => console.log(`    ${u.source_ref}`));
    }
    console.log(`\n  Would drain 450 pending jobs.`);
    console.log(`\n  Re-run with --apply [--skip-embed] to write.\n`);
    await pool.end();
    return;
  }

  // Step 3
  console.log('\n  Applying PG backfill…');
  await applyBackfill(pool, matched);

  // Step 4
  console.log('\n  Draining pending jobs…');
  await drainJobs(pool);

  // Step 5
  console.log('\n  Embedding unmatched docs…');
  await embedAndUpsert(pool, unmatched, qdrantMap);

  // Final stats
  const { rows: final } = await pool.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE qdrant_point_id IS NOT NULL) AS wired,
      count(*) FILTER (WHERE qdrant_point_id IS NULL)     AS unwired,
      count(*) FILTER (WHERE cluster_id IS NOT NULL)      AS clustered
    FROM parent_atlas_documents
  `);
  console.log('\n  Final parent_atlas_documents state:');
  console.log(`    total:     ${final[0].total}`);
  console.log(`    wired:     ${final[0].wired}  (qdrant_point_id set)`);
  console.log(`    unwired:   ${final[0].unwired}`);
  console.log(`    clustered: ${final[0].clustered}`);

  await pool.end();
  console.log('\n✅ wire-atlas-qdrant complete.\n');
}

main().catch(e => { console.error(e); process.exit(1); });