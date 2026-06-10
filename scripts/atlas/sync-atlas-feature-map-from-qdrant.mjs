#!/usr/bin/env node
/**
 * sync-atlas-feature-map-from-qdrant.mjs
 *
 * Scrolls codebase_chunks_768, groups by source file, then UPSERTs into
 * atlas_feature_map with the Qdrant-derived lineage columns:
 *   som_cluster, centroid_id, qdrant_point_id, feature_id, lane_ids
 *
 * This is the cross-join that makes atlas_feature_map the one source of truth:
 *   source_ref → feature_id → centroid_id → som_cluster → qdrant_point_id
 *
 * Usage:
 *   node scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs
 *   node scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs --dry-run
 *   node scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs --limit=5000
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : null;
const BATCH     = 250;

// ── Env loader ────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
  return env;
}

function normalizeSourceRef(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/^sveltekit-frontend\//, '');
}

const env = loadEnv();
const QDRANT_URL = env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const DATABASE_URL = env.DATABASE_URL ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5432'}/${env.DB_NAME ?? 'legal_ai_db'}`;

// ── Pass 1: scroll Qdrant, group by normalized file path ──────────────────────

/** @type {Map<string, {sourceRef: string, featureId: string|null, featureIds: string[], laneIds: string[], somCluster: string|null, centroidId: string|null, qdrantPointId: string|null, gpuCluster: string|null}>} */
const fileMap = new Map();

let offset = null;
let scanned = 0;
let guard = 0;

process.stdout.write(`Pass 1: scrolling ${COLLECTION}${LIMIT ? ` (limit ${LIMIT})` : ''}...\n`);

while (guard < 600) {
  guard++;
  const body = { limit: BATCH, offset, with_payload: true, with_vector: false };
  if (!offset) delete body.offset;

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) { console.error('Qdrant scroll error', res.status); break; }
  const data = await res.json();
  const points = data?.result?.points ?? [];
  if (!points.length) break;

  for (const point of points) {
    scanned++;
    const p = point.payload ?? {};

    // Normalize source ref: strip #chunk-N suffix, use file_path
    const filePath = p.file_path ?? p.sourceRef?.replace(/#chunk-\d+$/, '') ?? null;
    if (!filePath) continue;

    // Skip .venv and third-party noise
    if (filePath.startsWith('.venv/') || filePath.startsWith('node_modules/') ||
        filePath.startsWith('granite-docling') || filePath.startsWith('turbovec') ||
        filePath.startsWith('models/')) continue;

    const normalized = normalizeSourceRef(filePath);

    if (!fileMap.has(normalized)) {
      fileMap.set(normalized, {
        sourceRef:    normalized,
        featureId:    null,
        featureIds:   [],
        laneIds:      [],
        somCluster:   null,
        centroidId:   null,
        qdrantPointId: null,
        gpuCluster:   null,
        packetId:     null,
        fileKind:     null,
        tags:         [],
      });
    }

    const entry = fileMap.get(normalized);

    // Take first point's qdrant_point_id
    if (!entry.qdrantPointId) entry.qdrantPointId = String(point.id);

    // SOM / cluster fields — prefer canonical fields, but accept legacy gpuCluster
    // payloads from older graphify-semantic-cluster runs.
    const gpuCluster = p.gpuCluster ?? p.gpu_cluster ?? null;
    const somCluster = p.som_cluster ?? gpuCluster;
    const centroidId = p.centroid_id ?? gpuCluster;

    if (!entry.somCluster && somCluster != null)  entry.somCluster  = String(somCluster);
    if (!entry.centroidId && centroidId != null)  entry.centroidId  = String(centroidId);
    if (!entry.gpuCluster && gpuCluster != null)  entry.gpuCluster  = String(gpuCluster);

    // New canonical payload fields
    if (!entry.packetId  && p.packet_id)   entry.packetId  = String(p.packet_id);
    if (!entry.fileKind  && (p.file_kind ?? p.source_type)) entry.fileKind = String(p.file_kind ?? p.source_type);
    if (Array.isArray(p.tags)) {
      for (const t of p.tags) {
        if (typeof t === 'string' && !entry.tags.includes(t)) entry.tags.push(t);
      }
    }

    // Collect feature_ids (from backfill or singular feature_id)
    if (Array.isArray(p.feature_ids) && p.feature_ids.length) {
      for (const f of p.feature_ids) {
        if (!entry.featureIds.includes(f)) entry.featureIds.push(f);
      }
    } else if (p.feature_id) {
      if (!entry.featureIds.includes(p.feature_id)) entry.featureIds.push(p.feature_id);
    }

    // Collect lane_ids
    if (Array.isArray(p.lane_ids)) {
      for (const l of p.lane_ids) {
        if (!entry.laneIds.includes(l)) entry.laneIds.push(l);
      }
    }
  }

  if (scanned % 5000 === 0) process.stdout.write(`  scanned ${scanned}...\n`);
  if (LIMIT && scanned >= LIMIT) break;

  const next = data?.result?.next_page_offset;
  if (next === null || next === undefined) break;
  offset = next;
}

// Finalize: set primary feature_id from top of featureIds
for (const entry of fileMap.values()) {
  entry.featureId = entry.featureIds[0] ?? null;
  // cluster_id = gpuCluster prefix for legacy compat
  entry.clusterId = entry.gpuCluster ? `gpu:${entry.gpuCluster}` : (entry.somCluster ?? null);
}

process.stdout.write(`  done. scanned ${scanned} points → ${fileMap.size} unique files.\n\n`);

// ── Stats ─────────────────────────────────────────────────────────────────────
const withSom     = [...fileMap.values()].filter(e => e.somCluster).length;
const withFeature = [...fileMap.values()].filter(e => e.featureId).length;
console.log(`Files with som_cluster : ${withSom} / ${fileMap.size} (${Math.round(withSom/fileMap.size*100)}%)`);
console.log(`Files with feature_id  : ${withFeature} / ${fileMap.size} (${Math.round(withFeature/fileMap.size*100)}%)\n`);

if (DRY_RUN) {
  // Sample 5 entries
  let i = 0;
  for (const [path, e] of fileMap) {
    if (i++ >= 5) break;
    console.log(`  ${path}`);
    console.log(`    som=${e.somCluster} centroid=${e.centroidId} feature=${e.featureId} qdrant=${e.qdrantPointId}`);
  }
  console.log('\n[DRY-RUN] No writes. Remove --dry-run to apply.');
  process.exit(0);
}

// ── Pass 2: UPSERT into atlas_feature_map ─────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const UPSERT = `
  INSERT INTO atlas_feature_map
    (normalized_path, source_ref, feature_id, related_feature_ids,
     cluster_id, centroid_id, som_cluster, qdrant_point_id, lane_ids, packet_id, indexed_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
  ON CONFLICT (normalized_path) DO UPDATE SET
    source_ref          = EXCLUDED.source_ref,
    feature_id          = COALESCE(EXCLUDED.feature_id, atlas_feature_map.feature_id),
    related_feature_ids = CASE WHEN jsonb_array_length(EXCLUDED.related_feature_ids) > 0
                               THEN EXCLUDED.related_feature_ids
                               ELSE atlas_feature_map.related_feature_ids END,
    cluster_id          = COALESCE(EXCLUDED.cluster_id, atlas_feature_map.cluster_id),
    centroid_id         = COALESCE(EXCLUDED.centroid_id, atlas_feature_map.centroid_id),
    som_cluster         = COALESCE(EXCLUDED.som_cluster, atlas_feature_map.som_cluster),
    qdrant_point_id     = COALESCE(EXCLUDED.qdrant_point_id, atlas_feature_map.qdrant_point_id),
    lane_ids            = CASE WHEN array_length(EXCLUDED.lane_ids, 1) > 0
                               THEN EXCLUDED.lane_ids
                               ELSE atlas_feature_map.lane_ids END,
    packet_id           = COALESCE(EXCLUDED.packet_id, atlas_feature_map.packet_id),
    indexed_at          = now()
`;

process.stdout.write('Pass 2: upserting into atlas_feature_map...\n');

let upserted = 0;
let failed   = 0;
const entries = [...fileMap.values()];

for (let i = 0; i < entries.length; i += 50) {
  const batch = entries.slice(i, i + 50);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of batch) {
      const relatedJson = JSON.stringify(e.featureIds.slice(1, 9)); // skip first (= feature_id), keep rest as related
      await client.query(UPSERT, [
        e.sourceRef,           // normalized_path
        e.sourceRef,           // source_ref
        e.featureId,           // feature_id
        relatedJson,           // related_feature_ids
        e.clusterId,           // cluster_id
        e.centroidId,          // centroid_id
        e.somCluster,          // som_cluster
        e.qdrantPointId,       // qdrant_point_id
        e.laneIds,             // lane_ids (text[])
        e.packetId ?? null,    // packet_id
      ]);
      upserted++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    failed += batch.length;
    console.error(`  batch ${i}-${i+50} failed:`, err.message);
  } finally {
    client.release();
  }

  if ((i + 50) % 1000 === 0) process.stdout.write(`  upserted ${upserted}...\n`);
}

await pool.end();

console.log(`\n─────────────────────────────────────────`);
console.log(`  Scanned points   : ${scanned}`);
console.log(`  Unique files     : ${fileMap.size}`);
console.log(`  Upserted         : ${upserted}`);
console.log(`  Failed           : ${failed}`);
console.log(`\n  ✓ atlas_feature_map is now the source-of-truth lineage table.`);
console.log(`  Verify: SELECT COUNT(*) FROM atlas_feature_map WHERE som_cluster IS NOT NULL;`);
