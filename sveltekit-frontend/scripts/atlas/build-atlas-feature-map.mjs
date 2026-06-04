#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function normPath(p) {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^sveltekit-frontend\//, '')
    .split('#')[0]
    .trim();
}

async function main() {
  console.log(`=== build-atlas-feature-map.mjs ===`);
  console.log(`Database URL:      ${DATABASE_URL}`);
  console.log(`Qdrant Collection: ${QDRANT_COLLECTION}`);
  console.log(`Dry run:           ${dryRun ? 'YES' : 'NO'}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const client = await pool.connect();

  try {
    // ── Phase 3: Create & Populate atlas_feature_map in Postgres ──
    console.log('\n[Phase 3] Building atlas_feature_map in Postgres...');
    
    if (!dryRun) {
      await client.query(`DROP TABLE IF EXISTS atlas_feature_map`);
      await client.query(`
        CREATE TABLE atlas_feature_map (
          normalized_path TEXT PRIMARY KEY,
          source_ref TEXT NOT NULL,
          feature_id TEXT,
          related_feature_ids JSONB DEFAULT '[]',
          cluster_id TEXT,
          centroid_id TEXT,
          qdrant_point_id TEXT
        )
      `);
      console.log('  Created table atlas_feature_map');
    }

    const { rows: atlasDocs } = await client.query(`
      SELECT source_ref, feature_id, related_feature_ids, cluster_id, centroid_id, qdrant_point_id
      FROM parent_atlas_documents
      WHERE source_ref IS NOT NULL AND source_ref <> ''
    `);

    console.log(`  Loaded ${atlasDocs.length} records from parent_atlas_documents`);

    let inserted = 0;
    if (!dryRun) {
      const batchSize = 200;
      for (let i = 0; i < atlasDocs.length; i += batchSize) {
        const batch = atlasDocs.slice(i, i + batchSize);
        const valueStrings = [];
        const params = [];
        batch.forEach((row, idx) => {
          const baseOffset = idx * 7;
          valueStrings.push(`($${baseOffset+1}, $${baseOffset+2}, $${baseOffset+3}, $${baseOffset+4}, $${baseOffset+5}, $${baseOffset+6}, $${baseOffset+7})`);
          params.push(
            normPath(row.source_ref),
            row.source_ref,
            row.feature_id,
            JSON.stringify(row.related_feature_ids ?? []),
            row.cluster_id,
            row.centroid_id,
            row.qdrant_point_id
          );
        });

        await client.query(`
          INSERT INTO atlas_feature_map (normalized_path, source_ref, feature_id, related_feature_ids, cluster_id, centroid_id, qdrant_point_id)
          VALUES ${valueStrings.join(', ')}
          ON CONFLICT (normalized_path) DO NOTHING
        `, params);
        inserted += batch.length;
      }
      console.log(`  Populated atlas_feature_map with ${inserted} rows`);
    } else {
      console.log(`  [Dry run] Would insert ${atlasDocs.length} rows into atlas_feature_map`);
    }    // ── Phase 4: Postgres Backfill ──
    console.log('\n[Phase 4] Backfilling Postgres tables...');

    // 1. Backfill task_semantic_packets using alias_id (which contains the file path)
    const { rows: taskPackets } = await client.query(`SELECT id, alias_id FROM task_semantic_packets WHERE alias_id IS NOT NULL AND alias_id <> ''`);
    console.log(`  Auditing ${taskPackets.length} task_semantic_packets with alias_id`);
    
    let taskUpdated = 0;
    for (const packet of taskPackets) {
      const norm = normPath(packet.alias_id);
      const match = atlasDocs.find(d => normPath(d.source_ref) === norm);
      if (match) {
        taskUpdated++;
        if (!dryRun) {
          await client.query(`
            UPDATE task_semantic_packets
            SET feature_id = $1, related_feature_ids = $2, cluster_id = $3, centroid_id = $4, qdrant_point_id = $5
            WHERE id = $6
          `, [match.feature_id, JSON.stringify(match.related_feature_ids ?? []), match.cluster_id, match.centroid_id, match.qdrant_point_id, packet.id]);
        }
      }
    }
    console.log(`  task_semantic_packets: matched and updated ${taskUpdated}/${taskPackets.length} rows`);
    // 2. Backfill nes_chrom_packets
    const { rows: nesPackets } = await client.query(`SELECT id, source_ref FROM nes_chrom_packets WHERE source_ref IS NOT NULL AND source_ref <> ''`);
    console.log(`  Auditing ${nesPackets.length} nes_chrom_packets with source_ref`);

    let nesUpdated = 0;
    for (const packet of nesPackets) {
      const norm = normPath(packet.source_ref);
      const match = atlasDocs.find(d => normPath(d.source_ref) === norm);
      if (match) {
        nesUpdated++;
        if (!dryRun) {
          // nes_chrom_packets contains feature_ids array, som_cluster
          const featureIds = [match.feature_id, ...(match.related_feature_ids ?? [])].filter(Boolean);
          const somCluster = match.cluster_id ? `${match.cluster_id}:0` : null; // format as row:col or similar if known, default fallback
          await client.query(`
            UPDATE nes_chrom_packets
            SET feature_id = $1, feature_ids = $2, som_cluster = $3, qdrant_point_id = $4
            WHERE id = $5
          `, [match.feature_id, featureIds, somCluster, match.qdrant_point_id, packet.id]);
        }
      }
    }
    console.log(`  nes_chrom_packets: matched and updated ${nesUpdated}/${nesPackets.length} rows`);

    // ── Phase 5: Qdrant Payload Backfill ──
    console.log('\n[Phase 5] Patching Qdrant codebase_chunks_768 payloads...');
    
    // Create mapping index for fast lookups
    const pgMap = new Map();
    atlasDocs.forEach(row => {
      pgMap.set(normPath(row.source_ref), row);
    });

    let offset = null;
    let pointsScrolled = 0;
    let qdrantPatched = 0;
    let patchBatch = [];

    const flushPatches = async () => {
      if (patchBatch.length === 0) return;
      if (!dryRun) {
        await Promise.all(patchBatch.map(item => {
          return fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload?wait=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              points: [item.id],
              payload: item.payload,
            }),
            signal: AbortSignal.timeout(15_000),
          }).catch(err => console.warn(`  ⚠ Failed to patch Qdrant point ${item.id}:`, err.message));
        }));
      }
      qdrantPatched += patchBatch.length;
      patchBatch = [];
    };

    while (true) {
      const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 1000,
          offset,
          with_payload: true,
          with_vector: false,
        }),
      });
      if (!res.ok) {
        console.error(`  Error scrolling Qdrant: ${res.status}`);
        break;
      }
      const data = await res.json();
      const points = data?.result?.points ?? [];
      if (points.length === 0) break;

      for (const pt of points) {
        const fp = pt.payload?.file_path ?? pt.payload?.relativePath ?? pt.payload?.sourceRef ?? '';
        if (!fp) continue;
        const norm = normPath(fp);
        const match = pgMap.get(norm);

        if (match) {
          // Check if payload already matches to avoid redundant updates
          const current = pt.payload ?? {};
          const needsUpdate = 
            current.feature_id !== match.feature_id ||
            !Array.isArray(current.related_feature_ids) ||
            current.cluster_id !== match.cluster_id ||
            current.centroid_id !== match.centroid_id;

          if (needsUpdate) {
            patchBatch.push({
              id: pt.id,
              payload: {
                feature_id: match.feature_id,
                related_feature_ids: match.related_feature_ids ?? [],
                cluster_id: match.cluster_id,
                centroid_id: match.centroid_id,
                som_cluster: match.cluster_id ? `${match.cluster_id}:0` : undefined,
              }
            });
            if (patchBatch.length >= 100) {
              await flushPatches();
            }
          }
        }
      }

      pointsScrolled += points.length;
      process.stdout.write(`  Scrolled ${pointsScrolled} points... Patched ${qdrantPatched}   \r`);

      offset = data?.result?.next_page_offset;
      if (!offset) break;
    }
    await flushPatches();
    console.log(`\n  Qdrant backfill complete. Scrolled ${pointsScrolled} points, patched ${qdrantPatched} points.`);

  } catch (err) {
    console.error('Execution failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
