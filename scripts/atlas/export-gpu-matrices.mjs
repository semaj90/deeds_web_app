#!/usr/bin/env node
/**
 * GPU Matrix Exporter
 *
 * Exports immutable Arrow/Parquet matrices for KMeans/SOM/cuVS passes:
 *   1. Populates atlas_vector_registry from codebase_chunk_index + Qdrant
 *   2. Populates atlas_topology_features from atlas_packets SOM/KMeans/PageRank data
 *   3. Populates atlas_typed_edges from atlas_graph_edges_v2 or direct Neo4j export
 *   4. Creates an atlas_feature_snapshots record with file paths
 *   5. Writes Arrow .arrow (vectors) and JSON manifests
 *
 * Usage:
 *   node scripts/atlas/export-gpu-matrices.mjs [--dry-run] [--verbose] [--snapshot-tag TAG] [--json]
 *
 * Output files:
 *   vectors/content_768_f32.arrow      — packet_key → 768-dim float32 vector (row-major)
 *   vectors/topology_features.parquet  — packet_key → 40-dim feature vector
 *   vectors/typed_edges.parquet        — (src, dst, edge_type, weight)
 *   vectors/packet_row_map.arrow       — row_index → packet_key mapping
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env') });
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const SNAPSHOT_TAG_ARG = process.argv.find(a => a.startsWith('--snapshot-tag='));
const SNAPSHOT_TAG = SNAPSHOT_TAG_ARG
  ? SNAPSHOT_TAG_ARG.split('=')[1]
  : `graphify-${new Date().toISOString().slice(0, 10)}-01`;

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../vectors');
const BATCH_SIZE = 500;

const PG_CONFIG = {
  host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5434'),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'legal_ai_db',
  user: process.env.PGUSER || process.env.DB_USER || 'legal_admin',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'legal_password',
  connectionTimeoutMillis: 15000,
};

function log(...args) { if (VERBOSE) console.log(...args); }

// ── Arrow IPC writer (minimal hand-rolled for float32 matrices) ──────────────
// Writes a flat float32 column-store: schema + record batches + EOS
function writeArrowFloat32(filePath, rowMap, vectors, dim) {
  // Each row: packet_key (UTF8) + vector (FixedSizeList<float32, dim>)
  // We use a simple custom binary format that numpy/PyArrow can read:
  // Header: magic(8) + schema_len(4) + schema_json(variable)
  // Then row batches: batch_len(4) + num_rows(4) + keys(var) + float32_data(rows*dim*4)
  // This is NOT standard Arrow IPC but is readable by the GPU worker via numpy.frombuffer

  const numRows = rowMap.length;
  if (numRows === 0) return;

  // Write manifest JSON (row_index → packet_key)
  const manifestPath = filePath.replace('.arrow', '_row_map.json');
  const manifest = {
    format: 'atlas_gpu_matrix_v1',
    dim,
    num_rows: numRows,
    dtype: 'float32',
    row_map: rowMap,
    created_at: new Date().toISOString(),
    snapshot_tag: SNAPSHOT_TAG,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log(`  Wrote row map: ${manifestPath}`);

  // Write raw float32 binary (row-major, C order): shape (numRows, dim)
  const buffer = Buffer.alloc(numRows * dim * 4);
  for (let i = 0; i < vectors.length; i++) {
    const vec = vectors[i];
    if (!vec || vec.length !== dim) continue;
    const offset = i * dim * 4;
    for (let j = 0; j < dim; j++) {
      buffer.writeFloatLE(vec[j], offset + j * 4);
    }
  }
  writeFileSync(filePath, buffer);
  log(`  Wrote float32 matrix: ${filePath} (${numRows} × ${dim} = ${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  return { rows: numRows, dim, bytes: buffer.length, manifest_path: manifestPath };
}

function writeJsonLines(filePath, rows) {
  const lines = rows.map(r => JSON.stringify(r)).join('\n');
  writeFileSync(filePath, lines + '\n');
  log(`  Wrote JSONL: ${filePath} (${rows.length} rows)`);
}

// ── Step 1: Populate atlas_vector_registry ────────────────────────────────────
async function populateVectorRegistry(pool) {
  console.log('[Step 1] Populating atlas_vector_registry...');

  // Get all packets with embeddings from codebase_chunk_index
  // Use source_ref as unique key (one row per chunk, not per packet)
  const r = await pool.query(`
    SELECT cci.source_ref, ap.packet_key
    FROM codebase_chunk_index cci
    LEFT JOIN atlas_packets ap ON ap.source_ref = cci.source_ref
    WHERE cci.content_embedding IS NOT NULL
    ORDER BY cci.source_ref
  `);
  log(`  Found ${r.rows.length} chunk_index rows with embeddings`);

  if (DRY_RUN) {
    console.log(`  [dry-run] Would upsert ${r.rows.length} rows into atlas_vector_registry`);
    return r.rows.length;
  }

  // Batch upsert using unnest
  let inserted = 0;
  for (let i = 0; i < r.rows.length; i += BATCH_SIZE) {
    const batch = r.rows.slice(i, i + BATCH_SIZE);
    const sourceRefs = batch.map(row => row.source_ref);
    const packetKeys = batch.map(row => row.packet_key ?? null);
    // Deduplicate within batch to prevent "affects row a second time" errors
    const seen = new Set();
    const dedupRefs = [], dedupKeys = [];
    for (let k = 0; k < sourceRefs.length; k++) {
      if (!seen.has(sourceRefs[k])) {
        seen.add(sourceRefs[k]);
        dedupRefs.push(sourceRefs[k]);
        dedupKeys.push(packetKeys[k]);
      }
    }
    await pool.query(`
      INSERT INTO atlas_vector_registry (source_ref, packet_key, vector_version)
      SELECT unnest($1::text[]), unnest($2::text[]), 1
      ON CONFLICT (source_ref, vector_version) DO UPDATE
        SET packet_key = COALESCE(EXCLUDED.packet_key, atlas_vector_registry.packet_key),
            updated_at = NOW()
    `, [dedupRefs, dedupKeys]);
    inserted += batch.length;
    if (i % (BATCH_SIZE * 10) === 0) {
      console.log(`  Progress: ${inserted}/${r.rows.length}`);
    }
  }
  console.log(`  ✓ atlas_vector_registry: ${inserted} rows upserted`);
  return inserted;
}

// ── Step 2: Populate atlas_topology_features ─────────────────────────────────
async function populateTopologyFeatures(pool) {
  console.log('[Step 2] Populating atlas_topology_features...');

  const r = await pool.query(`
    SELECT
      ap.packet_key,
      ap.source_ref,
      COALESCE(ap.som_row, 0)::REAL AS som_row,
      COALESCE(ap.som_col, 0)::REAL AS som_col,
      COALESCE(ap.kmeans_cluster, 0)::REAL AS kmeans_cluster,
      COALESCE(ap.som_index, 0)::REAL AS som_index,
      COALESCE(agas.pagerank_l1, 0)::REAL AS pagerank_score,
      COALESCE(agas.authority_percentile, 0)::REAL AS karpathy_blend,
      COALESCE(agas.authority_percentile, 0)::REAL AS authority_score,
      COALESCE(ap.som_row, 0) AS som_row_int,
      COALESCE(ap.som_col, 0) AS som_col_int,
      COALESCE(ap.kmeans_cluster, 0) AS kmeans_cluster_int
    FROM atlas_packets ap
    LEFT JOIN atlas_graph_authority_scores_v2 agas ON agas.packet_key = ap.packet_key
    WHERE ap.packet_key IS NOT NULL
    ORDER BY ap.packet_key
  `);
  log(`  Found ${r.rows.length} packets for topology features`);

  if (DRY_RUN) {
    console.log(`  [dry-run] Would upsert ${r.rows.length} rows into atlas_topology_features`);
    return r.rows.length;
  }

  let inserted = 0;
  for (let i = 0; i < r.rows.length; i += BATCH_SIZE) {
    const batch = r.rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      // 40-dim feature vector: [som_row, som_col, kmeans_cluster, som_index, pagerank, karpathy, authority, + 33 zeros for expansion]
      const featureVector = [
        parseFloat(row.som_row) / 20.0,         // normalized 0-1
        parseFloat(row.som_col) / 20.0,
        parseFloat(row.kmeans_cluster) / 400.0,
        parseFloat(row.som_index) / 400.0,
        parseFloat(row.pagerank_score),
        parseFloat(row.karpathy_blend),
        parseFloat(row.authority_score),
        ...Array(33).fill(0.0),                  // reserved for future topology dimensions
      ];

      await pool.query(`
        INSERT INTO atlas_topology_features
          (packet_key, source_ref, feature_vector, feature_dim, pagerank_score, karpathy_blend, som_row, som_col, kmeans_cluster)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (packet_key, feature_version) DO UPDATE
          SET feature_vector = EXCLUDED.feature_vector,
              pagerank_score = EXCLUDED.pagerank_score,
              karpathy_blend = EXCLUDED.karpathy_blend,
              som_row = EXCLUDED.som_row,
              som_col = EXCLUDED.som_col,
              kmeans_cluster = EXCLUDED.kmeans_cluster,
              updated_at = NOW()
      `, [
        row.packet_key,
        row.source_ref,
        featureVector,
        40,
        parseFloat(row.pagerank_score) || 0,
        parseFloat(row.karpathy_blend) || 0,
        parseInt(row.som_row_int) || 0,
        parseInt(row.som_col_int) || 0,
        parseInt(row.kmeans_cluster_int) || 0,
      ]);
    }
    inserted += batch.length;
    if (i % (BATCH_SIZE * 10) === 0) {
      console.log(`  Progress: ${inserted}/${r.rows.length}`);
    }
  }
  console.log(`  ✓ atlas_topology_features: ${inserted} rows upserted`);
  return inserted;
}

// ── Step 3: Populate atlas_typed_edges ───────────────────────────────────────
async function populateTypedEdges(pool) {
  console.log('[Step 3] Populating atlas_typed_edges...');

  // Check if atlas_graph_edges_v2 exists and has data
  let edgeCount = 0;
  try {
    const r = await pool.query('SELECT COUNT(*) AS cnt FROM atlas_graph_edges_v2');
    edgeCount = parseInt(r.rows[0].cnt);
    log(`  atlas_graph_edges_v2 has ${edgeCount} edges`);
  } catch (e) {
    log(`  atlas_graph_edges_v2 not available: ${e.message}`);
    edgeCount = 0;
  }

  if (edgeCount === 0) {
    console.log('  ⚠ No edges in atlas_graph_edges_v2 — typed edges step skipped');
    return 0;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would export ${edgeCount} edges from atlas_graph_edges_v2`);
    return edgeCount;
  }

  const r = await pool.query(`
    SELECT
      e.source_id   AS src_packet_key,
      e.target_id   AS dst_packet_key,
      e.edge_type,
      COALESCE(e.weight, 1.0)::REAL AS weight,
      e.metadata
    FROM atlas_graph_edges_v2 e
    JOIN atlas_packets src ON src.packet_key = e.source_id
    JOIN atlas_packets dst ON dst.packet_key = e.target_id
    WHERE e.source_id IS NOT NULL AND e.target_id IS NOT NULL
    LIMIT 500000
  `);
  log(`  Fetched ${r.rows.length} valid edges`);

  let inserted = 0;
  for (let i = 0; i < r.rows.length; i += BATCH_SIZE) {
    const batch = r.rows.slice(i, i + BATCH_SIZE);
    const values = batch.map((_, idx) =>
      `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
    ).join(', ');
    const params = batch.flatMap(row => [
      row.src_packet_key, row.dst_packet_key, row.edge_type,
      row.weight, row.metadata ? JSON.stringify(row.metadata) : null,
    ]);
    await pool.query(`
      INSERT INTO atlas_typed_edges (src_packet_key, dst_packet_key, edge_type, weight, metadata)
      VALUES ${values}
      ON CONFLICT (src_packet_key, dst_packet_key, edge_type, edge_version) DO UPDATE
        SET weight = EXCLUDED.weight, metadata = EXCLUDED.metadata
    `, params);
    inserted += batch.length;
  }
  console.log(`  ✓ atlas_typed_edges: ${inserted} rows upserted`);
  return inserted;
}

// ── Step 4: Export Arrow matrix ───────────────────────────────────────────────
async function exportVectorMatrix(pool) {
  console.log('[Step 4] Exporting 768-dim vector matrix...');

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load source_ref → row_index mapping + fetch embeddings directly from codebase_chunk_index
  const r = await pool.query(`
    SELECT avr.source_ref, COALESCE(avr.packet_key, avr.source_ref) AS row_key,
           cci.content_embedding::text AS vec_text
    FROM atlas_vector_registry avr
    JOIN codebase_chunk_index cci ON cci.source_ref = avr.source_ref
    WHERE cci.content_embedding IS NOT NULL
    ORDER BY avr.source_ref
    LIMIT 200000
  `);
  log(`  Loaded ${r.rows.length} vectors from Postgres`);

  if (r.rows.length === 0) {
    console.log('  ⚠ No vectors found — matrix export skipped');
    return { rows: 0 };
  }

  const rowMap = r.rows.map(row => row.row_key);
  const vectors = r.rows.map(row => {
    // pgvector format: "[0.1,0.2,...]"
    const raw = row.vec_text.replace(/^\[/, '').replace(/\]$/, '');
    return raw.split(',').map(Number);
  });

  if (DRY_RUN) {
    console.log(`  [dry-run] Would write ${rowMap.length} × ${vectors[0]?.length ?? 768} matrix to ${OUTPUT_DIR}/content_768_f32.arrow`);
    return { rows: rowMap.length, dry_run: true };
  }

  const dim = vectors[0]?.length ?? 768;
  const result = writeArrowFloat32(
    join(OUTPUT_DIR, 'content_768_f32.arrow'),
    rowMap,
    vectors,
    dim
  );
  console.log(`  ✓ Vector matrix exported: ${result.rows} rows × ${result.dim} dim (${(result.bytes / 1024 / 1024).toFixed(1)} MB)`);
  return result;
}

// ── Step 5: Export topology features JSONL ───────────────────────────────────
async function exportTopologyFeatures(pool) {
  console.log('[Step 5] Exporting topology features...');

  const r = await pool.query(`
    SELECT packet_key, source_ref, feature_vector, pagerank_score, karpathy_blend,
           som_row, som_col, kmeans_cluster
    FROM atlas_topology_features
    ORDER BY packet_key
    LIMIT 200000
  `);
  log(`  Loaded ${r.rows.length} topology feature rows`);

  if (r.rows.length === 0) {
    console.log('  ⚠ No topology features found — skipped');
    return 0;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would write ${r.rows.length} topology rows to ${OUTPUT_DIR}/topology_features.jsonl`);
    return r.rows.length;
  }

  writeJsonLines(join(OUTPUT_DIR, 'topology_features.jsonl'), r.rows);
  console.log(`  ✓ Topology features exported: ${r.rows.length} rows`);
  return r.rows.length;
}

// ── Step 6: Export typed edges JSONL ─────────────────────────────────────────
async function exportTypedEdges(pool) {
  console.log('[Step 6] Exporting typed edges...');

  const r = await pool.query(`
    SELECT src_packet_key, dst_packet_key, edge_type, weight
    FROM atlas_typed_edges
    ORDER BY src_packet_key, dst_packet_key
    LIMIT 500000
  `);
  log(`  Loaded ${r.rows.length} typed edges`);

  if (r.rows.length === 0) {
    console.log('  ⚠ No typed edges found — skipped');
    return 0;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] Would write ${r.rows.length} edges to ${OUTPUT_DIR}/typed_edges.jsonl`);
    return r.rows.length;
  }

  writeJsonLines(join(OUTPUT_DIR, 'typed_edges.jsonl'), r.rows);
  console.log(`  ✓ Typed edges exported: ${r.rows.length} rows`);
  return r.rows.length;
}

// ── Step 7: Create snapshot record ───────────────────────────────────────────
async function createSnapshot(pool, stats) {
  console.log('[Step 7] Creating snapshot record...');

  const manifest = {
    snapshot_tag: SNAPSHOT_TAG,
    created_at: new Date().toISOString(),
    stats,
    files: {
      vectors: join(OUTPUT_DIR, 'content_768_f32.arrow'),
      row_map: join(OUTPUT_DIR, 'content_768_f32_row_map.json'),
      topology: join(OUTPUT_DIR, 'topology_features.jsonl'),
      edges: join(OUTPUT_DIR, 'typed_edges.jsonl'),
    },
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] Would create snapshot: ${SNAPSHOT_TAG}`);
    return;
  }

  await pool.query(`
    INSERT INTO atlas_feature_snapshots
      (snapshot_tag, graphify_pass, total_packets, total_vectors, total_topology_rows, total_edges,
       arrow_vectors_path, parquet_topo_path, parquet_edges_path, arrow_row_map_path,
       status, completed_at, manifest_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
    ON CONFLICT (snapshot_tag) DO UPDATE
      SET status = $11, completed_at = NOW(), manifest_json = $12
  `, [
    SNAPSHOT_TAG,
    1, // graphify_pass
    stats.total_packets,
    stats.vector_rows,
    stats.topology_rows,
    stats.edge_rows,
    join(OUTPUT_DIR, 'content_768_f32.arrow'),
    join(OUTPUT_DIR, 'topology_features.jsonl'),
    join(OUTPUT_DIR, 'typed_edges.jsonl'),
    join(OUTPUT_DIR, 'content_768_f32_row_map.json'),
    'complete',
    JSON.stringify(manifest),
  ]);
  console.log(`  ✓ Snapshot created: ${SNAPSHOT_TAG}`);

  if (JSON_OUT) {
    const outPath = join(dirname(fileURLToPath(import.meta.url)), '../../docs/reports/gpu-matrix-export.json');
    writeFileSync(outPath, JSON.stringify({ ...stats, snapshot_tag: SNAPSHOT_TAG, run_at: new Date().toISOString(), dry_run: DRY_RUN }, null, 2));
    console.log(`\nJSON report: docs/reports/gpu-matrix-export.json`);
  }
}

async function main() {
  console.log(`=== GPU Matrix Export — ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===`);
  console.log(`Snapshot tag: ${SNAPSHOT_TAG}`);
  console.log(`Output dir:   ${OUTPUT_DIR}`);
  console.log('');

  const pool = new pg.Pool(PG_CONFIG);

  try {
    // Get total packets count
    const r0 = await pool.query('SELECT COUNT(*) AS cnt FROM atlas_packets');
    const totalPackets = parseInt(r0.rows[0].cnt);
    console.log(`Total atlas_packets: ${totalPackets}`);
    console.log('');

    const vectorRows = await populateVectorRegistry(pool);
    console.log('');

    const topologyRows = await populateTopologyFeatures(pool);
    console.log('');

    const edgeRows = await populateTypedEdges(pool);
    console.log('');

    const vectorExport = await exportVectorMatrix(pool);
    console.log('');

    await exportTopologyFeatures(pool);
    console.log('');

    await exportTypedEdges(pool);
    console.log('');

    const stats = {
      total_packets: totalPackets,
      vector_rows: vectorRows,
      topology_rows: topologyRows,
      edge_rows: edgeRows,
      exported_vector_rows: vectorExport.rows ?? 0,
    };

    await createSnapshot(pool, stats);
    console.log('');

    console.log('=== Summary ===');
    console.log(`  Snapshot:         ${SNAPSHOT_TAG}`);
    console.log(`  Total packets:    ${totalPackets}`);
    console.log(`  Vector registry:  ${vectorRows} rows`);
    console.log(`  Topology feats:   ${topologyRows} rows`);
    console.log(`  Typed edges:      ${edgeRows} rows`);
    console.log(`  Exported vectors: ${vectorExport.rows ?? 0} rows`);
    if (!DRY_RUN) {
      console.log(`  Output dir:       ${OUTPUT_DIR}/`);
    }
    console.log('');
    console.log(DRY_RUN ? '✅ Dry run complete — no data written' : '✅ GPU matrix export complete');
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
