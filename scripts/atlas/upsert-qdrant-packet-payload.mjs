#!/usr/bin/env node
/**
 * upsert-qdrant-packet-payload.mjs
 *
 * Layer C: Syncs atlas_packets metadata into Qdrant codebase_chunks_768 payload
 * so ANN can pre-filter on:
 *   feature_id      — feature category (database_orm, api_endpoints, etc.)
 *   community_id    — SOM community assignment
 *   community_conf  — community confidence (1.00 / 0.70 / 0.50 / 0.25)
 *   concept_ids     — concept taxonomy labels
 *   tags            — derived keyword tags from BM25 text + concept_ids
 *   cluster_id      — GPU k-means cluster
 *   packet_key      — canonical packet key for dedup
 *
 * This enables the Stage 0 payload pre-filter:
 *   54k Qdrant points → ~4k candidates (after feature_id + community_id filter)
 *   → ANN runs on filtered subspace, not full collection
 *
 * Usage:
 *   node scripts/atlas/upsert-qdrant-packet-payload.mjs --dry-run
 *   node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply
 *   node scripts/atlas/upsert-qdrant-packet-payload.mjs --apply --limit=500
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '../..');
const env = loadRepoEnv(process.env);

const DATABASE_URL = resolveDatabaseUrl(env);
const QDRANT_URL   = env.QDRANT_URL   || 'http://127.0.0.1:6333';
const COLLECTION   = 'codebase_chunks_768';

const APPLY     = process.argv.includes('--apply');
const DRY_RUN   = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const MAX_ROWS  = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : Infinity;
const VERBOSE   = process.argv.includes('--verbose');

// Concurrency for Qdrant scroll + payload calls (keep low to avoid overwhelming Qdrant)
const QDRANT_CONCURRENCY = 8;

function canonicalize(sourceRef) {
  if (!sourceRef) return null;
  return String(sourceRef)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^C:\/Users\/james\/Videos\/deeds-web-app\/sveltekit-frontend\//i, '')
    .replace(/^C:\/Users\/james\/Videos\/deeds-web-app\//i, '')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/#chunk-\d+$/, '')
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pointFilterForPacket(pkt, canonicalRef) {
  const sourceRef = pkt.source_ref ?? pkt.file_path ?? pkt.source_path ?? pkt.metadata?.path ?? null;
  const filePath = pkt.file_path ?? pkt.source_path ?? pkt.metadata?.file_path ?? pkt.metadata?.path ?? sourceRef ?? null;
  const strippedSource = canonicalize(sourceRef);
  const strippedFile = canonicalize(filePath);
  const relative = canonicalRef ?? strippedFile ?? strippedSource;
  const prefixed = relative ? `sveltekit-frontend/${relative}` : null;

  const values = unique([
    canonicalRef,
    relative,
    prefixed,
    strippedSource,
    strippedFile,
    sourceRef,
    filePath,
  ]);

  const keys = [
    'relative_path',
    'file_path',
    'filePath',
    'path',
    'source_ref',
    'sourceRef',
    'canonical_source_ref',
    'canonicalSourceRef',
  ];

  return {
    should: keys.flatMap((key) => values.map((value) => ({ key, match: { value } }))),
  };
}

// Derive keyword tags from concept_ids + feature_id + packet_key
function deriveTags(featureId, conceptIds, packetKey, summary) {
  const tags = new Set();

  // Add feature_id directly as a tag
  if (featureId) {
    tags.add(featureId);
    // Add component words: database_orm → ['database', 'orm']
    featureId.split(/[_\-]/).filter(w => w.length > 2).forEach(w => tags.add(w));
  }

  // Add concept_ids
  if (Array.isArray(conceptIds)) {
    for (const c of conceptIds) {
      if (c && !c.match(/^[0-9a-f]{40}$/)) { // skip hash-looking IDs
        tags.add(c);
        c.split(/[_\-]/).filter(w => w.length > 2).forEach(w => tags.add(w));
      }
    }
  }

  // Extract key terms from packet_key (file path segments)
  if (packetKey) {
    packetKey.replace(/\.[^.]+$/, '') // strip extension
      .split(/[/\\.:\-]/)
      .filter(w => w.length > 3 && !/^\d+$/.test(w))
      .slice(0, 6)
      .forEach(w => tags.add(w.toLowerCase()));
  }

  return [...tags].slice(0, 12);
}

async function getQdrantPointIds(canonicalRef) {
  // Find Qdrant point IDs for a given canonicalSourceRef or relative_path.
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 50,
        with_payload: false,
        with_vector: false,
        filter: {
          should: [
            { key: 'canonicalSourceRef', match: { value: canonicalRef } },
            { key: 'canonicalSourceRef', match: { value: 'sveltekit-frontend/' + canonicalRef } },
            { key: 'canonical_source_ref', match: { value: canonicalRef } },
            { key: 'canonical_source_ref', match: { value: 'sveltekit-frontend/' + canonicalRef } },
            { key: 'relative_path', match: { value: canonicalRef } },
            { key: 'relative_path', match: { value: 'sveltekit-frontend/' + canonicalRef } },
            { key: 'file_path', match: { value: canonicalRef } },
            { key: 'file_path', match: { value: 'sveltekit-frontend/' + canonicalRef } },
          ]
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result?.points ?? []).map(p => p.id);
  } catch { return []; }
}

async function getQdrantPointIdsForPacket(pkt, canonicalRef) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 256,
        with_payload: false,
        with_vector: false,
        filter: pointFilterForPacket(pkt, canonicalRef),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result?.points ?? []).map(p => p.id);
  } catch {
    return [];
  }
}

async function setQdrantPayload(pointIds, payload) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, points: pointIds }),
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok;
  } catch { return false; }
}

async function setQdrantPayloadOne(pointId, payload) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, points: [pointId] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant set_payload ${res.status}: ${text.slice(0, 200)}`);
  }
}

function buildPayload(pkt, canonicalRef, enrichedAt) {
  const tags = deriveTags(pkt.feature_id, pkt.concept_ids, pkt.packet_key, pkt.summary);
  const sourceRef = pkt.source_ref ?? pkt.metadata?.source_ref ?? (canonicalRef ? `sveltekit-frontend/${canonicalRef}` : null);
  const filePath = pkt.file_path ?? pkt.source_path ?? pkt.metadata?.file_path ?? pkt.metadata?.path ?? sourceRef ?? null;

  return {
    feature_id: pkt.feature_id ?? null,
    feature_label: pkt.feature_label ?? null,
    source_ref: sourceRef,
    sourceRef,
    canonical_source_ref: sourceRef,
    canonicalSourceRef: sourceRef,
    sourceRefs: sourceRef ? [sourceRef] : [],
    file_path: filePath,
    filePath: filePath,
    path: filePath,
    relative_path: canonicalRef ?? null,
    packet_key: pkt.packet_key ?? null,
    packetKey: pkt.packet_key ?? null,
    qdrant_point_id: pkt.qdrant_point_id ?? pkt.qdrant_id ?? null,
    qdrant_collection: pkt.qdrant_collection ?? COLLECTION,
    qdrant_vector_dim: pkt.qdrant_vector_dim ?? pkt.embedding_dimension ?? 768,
    community_id: pkt.community_id ?? null,
    community_conf: pkt.community_confidence ?? 0.25,
    concept_ids: Array.isArray(pkt.concept_ids) ? pkt.concept_ids : [],
    tags,
    cluster_id: pkt.cluster_id ? parseInt(pkt.cluster_id, 10) : null,
    som_cluster: pkt.som_cluster ?? (
      pkt.som_row !== null && pkt.som_col !== null && pkt.som_row !== undefined && pkt.som_col !== undefined
        ? `${pkt.som_row}:${pkt.som_col}`
        : null
    ),
    domain_class: pkt.domain_class ?? pkt.domain ?? pkt.metadata?.domain_class ?? null,
    symbol: pkt.symbol ?? null,
    hash: pkt.metadata?.hash ?? pkt.content_hash ?? null,
    content_hash: pkt.content_hash ?? pkt.metadata?.hash ?? null,
    mtime: pkt.metadata?.mtime ?? null,
    metadata: pkt.metadata ?? {},
    lineage_version: 'packet-identity-v1',
    atlas_enriched: true,
    atlas_enriched_at: enrichedAt,
  };
}

async function directChunkIndexSync(pool, totalPackets, maxRows, isDry) {
  const limitSql = Number.isFinite(maxRows) ? 'LIMIT $1' : '';
  const params = Number.isFinite(maxRows) ? [maxRows] : [];
  const result = await pool.query(`
    SELECT
      cci.qdrant_id,
      cci.relative_path AS qdrant_relative_path,
      cci.symbol,
      cci.som_cluster,
      cci.tags AS qdrant_tags,
      cci.community_id AS qdrant_community_id,
      cci.embedding_dimension,
      cci.content_hash,
      ap.packet_key,
      ap.source_ref,
      ap.feature_id,
      ap.feature_label,
      ap.community_id,
      ${columnsForDirectSelect('ap')}
    FROM codebase_chunk_index cci
    JOIN LATERAL (
      SELECT *
      FROM atlas_packets ap
      WHERE ap.source_ref = 'sveltekit-frontend/' || cci.relative_path
         OR ap.source_ref = cci.relative_path
         OR ap.file_path = 'sveltekit-frontend/' || cci.relative_path
         OR ap.file_path = cci.relative_path
      ORDER BY
        CASE WHEN ap.qdrant_point_id::text = cci.qdrant_id::text THEN 0 ELSE 1 END,
        ap.updated_at DESC NULLS LAST,
        ap.packet_key ASC
      LIMIT 1
    ) ap ON true
    WHERE cci.qdrant_id IS NOT NULL
    ORDER BY cci.updated_at DESC NULLS LAST, cci.qdrant_id
    ${limitSql}
  `, params);

  const rows = result.rows;
  console.log(`Total packets: ${totalPackets} | Vector-backed chunk rows: ${rows.length}`);

  const enrichedAt = new Date().toISOString();
  if (isDry) {
    console.log('\nSample direct chunk payload (first 3 rows):');
    for (const row of rows.slice(0, 3)) {
      const payload = buildPayload(row, row.qdrant_relative_path, enrichedAt);
      console.log(`  ${row.qdrant_id} ${row.qdrant_relative_path}`);
      console.log(`    packet_key: ${payload.packet_key}`);
      console.log(`    feature_id: ${payload.feature_id}`);
      console.log(`    source_ref: ${payload.source_ref}`);
    }
    console.log('\n(dry-run — no Qdrant writes; run with --apply to commit)');
    return {
      mode: 'dry-run',
      total_packets: totalPackets,
      chunk_rows: rows.length,
      qdrant_points_updated: rows.length,
      errors: 0,
    };
  }

  let processed = 0;
  let updated = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += QDRANT_CONCURRENCY) {
    const batch = rows.slice(i, i + QDRANT_CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      try {
        const payload = buildPayload(
          { ...row, qdrant_point_id: row.qdrant_id, som_cluster: row.som_cluster ?? row.qdrant_som_cluster },
          row.qdrant_relative_path,
          enrichedAt,
        );
        await setQdrantPayloadOne(row.qdrant_id, payload);
        updated++;
      } catch (error) {
        errors++;
        if (VERBOSE) console.error(`  ${row.qdrant_id}: ${error.message}`);
      }
    }));
    processed += batch.length;
    if (processed % 1000 === 0 || processed === rows.length) {
      process.stdout.write(`\r  Processed ${processed}/${rows.length} chunks (updated: ${updated}, err: ${errors})`);
    }
  }
  process.stdout.write('\n');

  return {
    mode: 'apply',
    total_packets: totalPackets,
    chunk_rows: rows.length,
    qdrant_points_updated: updated,
    errors,
  };
}

function columnsForDirectSelect(alias) {
  const optional = [
    ['community_source', 'NULL::text'],
    ['community_confidence', 'NULL::float8'],
    ['concept_ids', 'ARRAY[]::text[]'],
    ['summary', 'NULL::text'],
    ['cluster_id', 'NULL::int'],
    ['som_row', 'NULL::int'],
    ['som_col', 'NULL::int'],
    ['domain_class', 'NULL::text'],
    ['qdrant_collection', 'NULL::text'],
    ['qdrant_vector_dim', 'NULL::int'],
    ['file_path', 'NULL::text'],
    ['source_path', 'NULL::text'],
    ['directory_path', 'NULL::text'],
    ['payload', `'{}'::jsonb`],
    ['metadata', `'{}'::jsonb`],
  ];
  return optional.map(([name, fallback]) => `${alias}.${name} AS ${name}`).join(',\n      ')
    .replaceAll(`${alias}.community_source`, `CASE WHEN false THEN ${alias}.packet_key ELSE NULL::text END`)
    .replaceAll(`${alias}.community_confidence`, `CASE WHEN false THEN 0::float8 ELSE NULL::float8 END`);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`\n═══ Upsert Qdrant Packet Payload ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
  console.log(`Collection: ${COLLECTION} @ ${QDRANT_URL}`);

  const { rows: columnRows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'atlas_packets'
  `);
  const columns = new Set(columnRows.map((row) => row.column_name));
  const col = (name, alias = name) => (
    columns.has(name) ? name : `NULL::text AS ${alias}`
  );
  const colInt = (name, alias = name) => (
    columns.has(name) ? name : `NULL::int AS ${alias}`
  );
  const colFloat = (name, alias = name) => (
    columns.has(name) ? name : `NULL::float8 AS ${alias}`
  );
  const colJson = (name, alias = name) => (
    columns.has(name) ? name : `'{}'::jsonb AS ${alias}`
  );
  const colTextArray = (name, alias = name) => (
    columns.has(name) ? name : `ARRAY[]::text[] AS ${alias}`
  );
  const { rows: chunkTableRows } = await pool.query(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
    LIMIT 1
  `);
  const hasChunkIndex = chunkTableRows.length > 0;

  const { rows: totalRows } = await pool.query('SELECT COUNT(*)::int AS total FROM atlas_packets');
  const totalPackets = totalRows[0]?.total ?? 0;

  if (hasChunkIndex) {
    const report = await directChunkIndexSync(pool, totalPackets, MAX_ROWS, DRY_RUN);
    await pool.end();
    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'upsert-qdrant-packet-payload.json'), JSON.stringify({
      generated_at: new Date().toISOString(),
      collection: COLLECTION,
      strategy: 'direct-codebase-chunk-index',
      ...report,
    }, null, 2));
    console.log('\n══ Summary ══════════════════════════════════════');
    console.log(`  Strategy:                direct-codebase-chunk-index`);
    console.log(`  Chunk rows:              ${report.chunk_rows}`);
    console.log(`  Qdrant points updated:   ${report.qdrant_points_updated}`);
    console.log(`  Errors:                  ${report.errors}`);
    console.log(`  Report: docs/reports/upsert-qdrant-packet-payload.json`);
    return;
  }

  // Load packets with metadata — prioritize code files likely to exist in Qdrant
  // (sveltekit-frontend/src/ first, then scripts/, then others)
  const { rows: packets } = await pool.query(`
    SELECT
           ${columns.has('packet_id') ? 'ap.packet_id' : 'NULL::text AS packet_id'},
           ${columns.has('source_ref') ? 'ap.source_ref' : 'NULL::text AS source_ref'},
           ${columns.has('feature_id') ? 'ap.feature_id' : 'NULL::text AS feature_id'},
           ${columns.has('feature_label') ? 'ap.feature_label' : 'NULL::text AS feature_label'},
           ${columns.has('community_id') ? 'ap.community_id' : 'NULL::int AS community_id'},
           ${columns.has('community_source') ? 'ap.community_source' : 'NULL::text AS community_source'},
           ${columns.has('community_confidence') ? 'ap.community_confidence' : 'NULL::float8 AS community_confidence'},
           ${columns.has('concept_ids') ? 'ap.concept_ids' : 'ARRAY[]::text[] AS concept_ids'},
           ${columns.has('packet_key') ? 'ap.packet_key' : 'NULL::text AS packet_key'},
           ${columns.has('summary') ? 'ap.summary' : 'NULL::text AS summary'},
           ${columns.has('cluster_id') ? 'ap.cluster_id' : 'NULL::int AS cluster_id'},
           ${columns.has('som_row') ? 'ap.som_row' : 'NULL::int AS som_row'},
           ${columns.has('som_col') ? 'ap.som_col' : 'NULL::int AS som_col'},
           ${columns.has('domain_class') ? 'ap.domain_class' : 'NULL::text AS domain_class'},
           ${columns.has('qdrant_point_id') ? 'ap.qdrant_point_id' : 'NULL::text AS qdrant_point_id'},
           ${columns.has('qdrant_collection') ? 'ap.qdrant_collection' : 'NULL::text AS qdrant_collection'},
           ${columns.has('qdrant_vector_dim') ? 'ap.qdrant_vector_dim' : 'NULL::int AS qdrant_vector_dim'},
           ${columns.has('file_path') ? 'ap.file_path' : 'NULL::text AS file_path'},
           ${columns.has('source_path') ? 'ap.source_path' : 'NULL::text AS source_path'},
           ${columns.has('directory_path') ? 'ap.directory_path' : 'NULL::text AS directory_path'},
           ${columns.has('payload') ? 'ap.payload' : `'{}'::jsonb AS payload`},
           ${columns.has('metadata') ? 'ap.metadata' : `'{}'::jsonb AS metadata`},
           ${hasChunkIndex ? 'cci.relative_path AS qdrant_relative_path' : 'NULL::text AS qdrant_relative_path'}
    FROM atlas_packets ap
    ${hasChunkIndex ? `
    LEFT JOIN codebase_chunk_index cci
      ON cci.relative_path = regexp_replace(coalesce(ap.source_ref, ''), '^sveltekit-frontend/', '')
    ` : ''}
    WHERE ap.source_ref IS NOT NULL
    ORDER BY
      ${hasChunkIndex ? 'CASE WHEN cci.relative_path IS NOT NULL THEN 0 ELSE 1 END,' : ''}
      CASE
        WHEN ap.source_ref LIKE 'sveltekit-frontend/src/%' THEN 0
        WHEN ap.source_ref LIKE 'scripts/%' THEN 1
        WHEN ap.source_ref LIKE 'src/%' THEN 2
        ELSE 3
      END,
      ap.source_ref
  `);

  const toProcess = packets.slice(0, MAX_ROWS);
  console.log(`Total packets: ${packets.length} | Processing: ${toProcess.length}`);

  // Group by canonicalRef to batch Qdrant updates. Qdrant is chunk-level while
  // atlas_packets is packet/file-level, so one canonical ref can update multiple points.
  const refGroups = new Map(); // canonicalRef → packet metadata
  for (const pkt of toProcess) {
    const canonical = canonicalize(pkt.qdrant_relative_path ?? pkt.source_ref ?? pkt.file_path ?? pkt.source_path ?? pkt.metadata?.path);
    if (!canonical) continue;
    if (!refGroups.has(canonical)) {
      refGroups.set(canonical, pkt);
    }
  }

  console.log(`Unique canonical refs: ${refGroups.size}`);

  if (DRY_RUN) {
    console.log('\nSample payload (first 3 refs):');
    let shown = 0;
    for (const [ref, pkt] of refGroups) {
      if (shown++ >= 3) break;
      const tags = deriveTags(pkt.feature_id, pkt.concept_ids, pkt.packet_key, pkt.summary);
      console.log(`  ${ref}`);
      console.log(`    feature_id: ${pkt.feature_id}, community_id: ${pkt.community_id} (conf: ${pkt.community_confidence})`);
      console.log(`    tags: [${tags.join(', ')}]`);
    }
    console.log('\n(dry-run — no Qdrant writes; run with --apply to commit)');
    await pool.end();
    return;
  }

  // Apply: fetch Qdrant point IDs, set payload with bounded concurrency
  let processed = 0, updated = 0, notFound = 0, errors = 0;
  const refsArray = [...refGroups.entries()];
  const enrichedAt = new Date().toISOString();

  // Process with limited concurrency to avoid overwhelming Qdrant
  for (let i = 0; i < refsArray.length; i += QDRANT_CONCURRENCY) {
    const batch = refsArray.slice(i, i + QDRANT_CONCURRENCY);

    await Promise.all(batch.map(async ([canonical, pkt]) => {
      const pointIds = await getQdrantPointIdsForPacket(pkt, canonical);
      if (!pointIds.length) {
        notFound++;
        return;
      }

      const tags = deriveTags(pkt.feature_id, pkt.concept_ids, pkt.packet_key, pkt.summary);

      // Canonical source_ref with fallbacks
      const sourceRef =
        pkt.source_ref ??
        pkt.sourceRef ??
        pkt.canonical_source_ref ??
        (pkt.metadata?.source_ref) ??
        (pkt.metadata?.path) ??
        null;

      // Canonical file_path with fallbacks
      const filePath =
        pkt.file_path ??
        pkt.source_path ??
        (pkt.metadata?.file_path) ??
        (pkt.metadata?.path) ??
        sourceRef ??
        null;

      const payload = {
        // Canonical fields (required for Phase D)
        feature_id:         pkt.feature_id ?? null,
        feature_label:      pkt.feature_label ?? null,

        // Source identity (all aliases for backward compat)
        source_ref:         sourceRef,
        sourceRef:          sourceRef,
        canonical_source_ref: sourceRef,
        canonicalSourceRef: sourceRef,
        sourceRefs:         sourceRef ? [sourceRef] : [],

        // File path (all aliases)
        file_path:          filePath,
        filePath:           filePath,
        path:               filePath,

        // Packet identity
        packet_key:         pkt.packet_key ?? null,
        packetKey:          pkt.packet_key ?? null,
        qdrant_point_id:    pkt.qdrant_point_id ?? null,
        qdrant_collection:  pkt.qdrant_collection ?? COLLECTION,
        qdrant_vector_dim:  pkt.qdrant_vector_dim ?? 768,

        // Community & enrichment
        community_id:       pkt.community_id ?? null,
        community_conf:     pkt.community_confidence ?? 0.25,
        concept_ids:        Array.isArray(pkt.concept_ids) ? pkt.concept_ids : [],

        // Semantic enrichment
        tags,
        cluster_id:         pkt.cluster_id ? parseInt(pkt.cluster_id, 10) : null,
        som_cluster:        (pkt.som_row !== null && pkt.som_col !== null && pkt.som_row !== undefined && pkt.som_col !== undefined) ? `${pkt.som_row}:${pkt.som_col}` : null,
        domain_class:       pkt.domain_class ?? (pkt.metadata?.domain_class) ?? null,

        // Metadata
        hash:               pkt.metadata?.hash ?? null,
        mtime:              pkt.metadata?.mtime ?? null,
        metadata:           pkt.metadata ?? {},

        // Lineage tracking
        lineage_version:    'packet-identity-v1',
        atlas_enriched:     true,
        atlas_enriched_at:  enrichedAt,
      };

      const ok = await setQdrantPayload(pointIds, payload);
      if (ok) {
        updated += pointIds.length;
        if (VERBOSE) console.log(`  ✓ ${canonical} → ${pointIds.length} points`);
      } else {
        errors++;
      }
    }));

    processed += batch.length;
    process.stdout.write(`\r  Processed ${processed}/${refsArray.length} refs (updated: ${updated} points, miss: ${notFound}, err: ${errors})`);
  }
  process.stdout.write('\n');

  await pool.end();

  // Report
  const reportDir = join(ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    mode: 'apply',
    total_packets: packets.length,
    unique_refs: refGroups.size,
    refs_processed: processed,
    qdrant_points_updated: updated,
    refs_not_in_qdrant: notFound,
    errors,
  };
  writeFileSync(join(reportDir, 'upsert-qdrant-packet-payload.json'), JSON.stringify(report, null, 2));

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Refs processed:          ${processed}`);
  console.log(`  Qdrant points updated:   ${updated}`);
  console.log(`  Refs not in Qdrant:      ${notFound}`);
  console.log(`  Errors:                  ${errors}`);
  console.log(`  Report: docs/reports/upsert-qdrant-packet-payload.json`);
  console.log('\n  ✅ Qdrant payload enriched. Pre-filtering on feature_id/community_id/tags now available.');
}

main().catch(err => { console.error(err); process.exit(1); });
