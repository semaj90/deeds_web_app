/**
 * propagate-manifold4-db.mjs
 * 
 * Standalone script to propagate 4D manifold coordinates to PostgreSQL.
 * Handles:
 *   1. Mirroring research_summaries from 5434 to 5432 (if needed)
 *   2. Backfilling manifold4 [x,y,z,w] from cluster topology
 * 
 * Usage: node scripts/propagate-manifold4-db.mjs
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const DB_5432 = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DB_5434 = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const CLUSTER_TOPOLOGY = './docs/graph/cluster-topology.json';

async function main() {
  const pool32 = new pg.Pool({ connectionString: DB_5432 });
  const pool34 = new pg.Pool({ connectionString: DB_5434 });

  console.log('--- Manifold Propagation ---');

  // 1. Mirror research_summaries (5434 -> 5432)
  console.log('Step 1: Mirroring research_summaries from 5434...');
  try {
    const { rows: summaries } = await pool34.query('SELECT * FROM research_summaries');
    console.log(`  Found ${summaries.length} summaries on 5434`);
    
    if (summaries.length > 0) {
      for (const s of summaries) {
        await pool32.query(
          `INSERT INTO research_summaries (
            id, source, pipeline, entity_type, query, query_hash, title, url, 
            collection, citation_label, section_path, jurisdiction, summary, 
            entity_tags, relevance_score, embedding, output_meta
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO NOTHING`,
          [
            s.id, s.source, s.pipeline, s.entity_type, s.query, s.query_hash, s.title, s.url,
            s.collection, s.citation_label, s.section_path, s.jurisdiction, s.summary,
            s.entity_tags, s.relevance_score, s.embedding, s.output_meta || {}
          ]
        );
      }
      console.log(`  ✓ Mirrored ${summaries.length} summaries to 5432`);
    }
  } catch (err) {
    console.warn(`  ⚠ Mirroring failed: ${err.message}`);
  }

  // 2. Load Topology & Clusters
  if (!fs.existsSync(CLUSTER_TOPOLOGY)) {
    console.error('❌ cluster-topology.json not found. Run npm run graphify:som first.');
    process.exit(1);
  }
  const topology = JSON.parse(fs.readFileSync(CLUSTER_TOPOLOGY, 'utf-8'));
  const clusterMap = new Map();
  for (const c of topology.clusters) {
    clusterMap.set(c.clusterId, { x: c.somCol, y: c.somRow });
  }
  console.log(`Step 2: Loaded ${clusterMap.size} cluster coordinates`);

  const CLUSTERS_JSON = './docs/graph/hypergraph-clusters.json';
  const clusterSummaries = new Map();
  if (fs.existsSync(CLUSTERS_JSON)) {
    const clusterData = JSON.parse(fs.readFileSync(CLUSTERS_JSON, 'utf-8'));
    for (const c of clusterData.clusters) {
      clusterSummaries.set(c.id, c.inferredTopic);
    }
    console.log(`  Loaded ${clusterSummaries.size} cluster summaries`);
  }

  // 3. Backfill codebase_chunk_index from Assignments
  const ASSIGNMENTS = './tmp/hypergraph-assignments.ndjson';
  if (fs.existsSync(ASSIGNMENTS)) {
    console.log('Step 3: Backfilling codebase_chunk_index from assignments.ndjson...');
    const lines = fs.readFileSync(ASSIGNMENTS, 'utf-8').split('\n');
    let updated = 0;
    
    // Batch updates for efficiency
    const BATCH_SIZE = 500;
    let batch = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      const { id, centroid } = JSON.parse(line);
      const coords = clusterMap.get(centroid);
      if (!coords) continue;
      const summary = clusterSummaries.get(centroid) || '';
      
      batch.push({ id, cid: centroid, x: coords.x, y: coords.y, summary });
      
      if (batch.length >= BATCH_SIZE) {
        await pool32.query(
          `UPDATE codebase_chunk_index AS cci
           SET    gpu_cluster = u.cid,
                  som_cluster = u.cid,
                  cluster_summary = jsonb_build_object('summary', u.summary),
                  manifold4   = ARRAY[u.x, u.y, 0.5, 0.5]::real[]
           FROM   unnest($1::text[], $2::int[], $3::real[], $4::real[], $5::text[]) AS u(id, cid, x, y, summary)
           WHERE  cci.qdrant_id = u.id`,
          [batch.map(b => b.id), batch.map(b => b.cid), batch.map(b => b.x), batch.map(b => b.y), batch.map(b => b.summary)]
        );
        updated += batch.length;
        batch = [];
        process.stdout.write('.');
      }
    }
    if (batch.length > 0) {
        await pool32.query(
          `UPDATE codebase_chunk_index AS cci
           SET    gpu_cluster = u.cid,
                  som_cluster = u.cid,
                  cluster_summary = jsonb_build_object('summary', u.summary),
                  manifold4   = ARRAY[u.x, u.y, 0.5, 0.5]::real[]
           FROM   unnest($1::text[], $2::int[], $3::real[], $4::real[], $5::text[]) AS u(id, cid, x, y, summary)
           WHERE  cci.qdrant_id = u.id`,
          [batch.map(b => b.id), batch.map(b => b.cid), batch.map(b => b.x), batch.map(b => b.y), batch.map(b => b.summary)]
        );
        updated += batch.length;
    }
    console.log(`\n  ✓ Updated ${updated} chunks in Postgres`);
  } else {
    console.warn('  ⚠ assignments.ndjson missing — skipping full backfill');
  }

  // 4. Backfill research_summaries (Map to nearest cluster or default)
  // For now, we'll use a simple strategy: if it has a collection that matches a known pattern,
  // or just use 0,0 for now to prove propagation.
  console.log('Step 4: Backfilling research_summaries manifold4...');
  const resSummaries = await pool32.query(
    `UPDATE research_summaries 
     SET manifold4 = ARRAY[0, 0, 0.5, 0.5]::real[]
     WHERE manifold4 IS NULL`
  );
  console.log(`  ✓ Updated ${resSummaries.rowCount} summaries with baseline 4D coords`);

  await pool32.end();
  await pool34.end();
  console.log('--- Done ---');
}

main().catch(console.error);
