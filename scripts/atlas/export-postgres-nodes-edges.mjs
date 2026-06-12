#!/usr/bin/env node
/**
 * export-postgres-nodes-edges.mjs
 *
 * Exports atlas_packets + concept_records + agent_traces into
 * CSV files suitable for neo4j-admin database import.
 *
 * Output (docs/graph/neo4j-import/):
 *   nodes-packets.csv    — Packet nodes (packet_id, source_ref, feature_id, community_id, packet_key, path, file_url, hash)
 *   nodes-features.csv   — Feature nodes (feature_id)
 *   nodes-concepts.csv   — Concept nodes (concept_id)
 *   nodes-traces.csv     — Trace nodes (trace_id)
 *   edges-implements.csv — Packet -[IMPLEMENTS]-> Feature
 *   edges-mentions.csv   — Packet -[MENTIONS]-> Concept  (from atlas_packets.concept_ids)
 *   edges-cluster.csv    — Packet -[SAME_COMMUNITY]-> Packet  (same community_id, capped per community)
 *   edges-trace-used.csv — Trace -[USED_CONCEPT]-> Concept   (from agent_traces.selected_concepts)
 *
 * Usage:
 *   node scripts/atlas/export-postgres-nodes-edges.mjs
 *   node scripts/atlas/export-postgres-nodes-edges.mjs --dry-run
 *
 * Neo4j import command (after running this script):
 *   neo4j-admin database import full neo4j \
 *     --nodes=docs/graph/neo4j-import/nodes-packets.csv \
 *     --nodes=docs/graph/neo4j-import/nodes-features.csv \
 *     --nodes=docs/graph/neo4j-import/nodes-concepts.csv \
 *     --nodes=docs/graph/neo4j-import/nodes-traces.csv \
 *     --relationships=docs/graph/neo4j-import/edges-implements.csv \
 *     --relationships=docs/graph/neo4j-import/edges-mentions.csv \
 *     --relationships=docs/graph/neo4j-import/edges-cluster.csv \
 *     --relationships=docs/graph/neo4j-import/edges-trace-used.csv \
 *     --overwrite-destination
 */

import pg from 'pg';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');
const OUT   = join(ROOT, 'docs', 'graph', 'neo4j-import');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DRY_RUN = process.argv.includes('--dry-run');
// Max SAME_COMMUNITY edges per community (avoid supernodes)
const MAX_CLUSTER_EDGES = parseInt(process.argv.find(a => a.startsWith('--max-cluster='))?.split('=')[1] ?? '20', 10);

function csvLine(...fields) {
  return fields.map(f => {
    const s = f == null ? '' : String(f);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',') + '\n';
}

class CsvWriter {
  constructor(path) {
    this.path = path;
    this.count = 0;
    if (!DRY_RUN) {
      this.stream = createWriteStream(path, { encoding: 'utf8' });
    }
  }
  write(...fields) {
    this.count++;
    if (!DRY_RUN) this.stream.write(csvLine(...fields));
  }
  close() {
    return new Promise((resolve) => {
      if (!DRY_RUN && this.stream) this.stream.end(resolve);
      else resolve();
    });
  }
}

async function main() {
  if (!DRY_RUN) mkdirSync(OUT, { recursive: true });

  const pool = new Pool({ connectionString: DATABASE_URL });

  console.log(`\n═══ Export Neo4j Import CSVs ${DRY_RUN ? '(dry-run)' : '(WRITE)'} ═══`);
  console.log(`Output dir: ${OUT}\n`);

  // ── Writers ───────────────────────────────────────────────────────────────
  const nodePackets  = new CsvWriter(join(OUT, 'nodes-packets.csv'));
  const nodeFeatures = new CsvWriter(join(OUT, 'nodes-features.csv'));
  const nodeConcepts = new CsvWriter(join(OUT, 'nodes-concepts.csv'));
  const nodeTraces   = new CsvWriter(join(OUT, 'nodes-traces.csv'));
  const edgeImpl     = new CsvWriter(join(OUT, 'edges-implements.csv'));
  const edgeMention  = new CsvWriter(join(OUT, 'edges-mentions.csv'));
  const edgeCluster  = new CsvWriter(join(OUT, 'edges-cluster.csv'));
  const edgeTrace    = new CsvWriter(join(OUT, 'edges-trace-used.csv'));

  // ── Headers (neo4j-admin import format) ───────────────────────────────────
  nodePackets.write(':ID(Packet)', 'source_ref', 'feature_id', 'community_id:int', 'packet_key', 'path', 'file_url', 'hash', ':LABEL');
  nodeFeatures.write(':ID(Feature)', 'name', ':LABEL');
  nodeConcepts.write(':ID(Concept)', 'name', ':LABEL');
  nodeTraces.write(':ID(Trace)', ':LABEL');
  edgeImpl.write(':START_ID(Packet)', ':END_ID(Feature)', ':TYPE');
  edgeMention.write(':START_ID(Packet)', ':END_ID(Concept)', ':TYPE');
  edgeCluster.write(':START_ID(Packet)', ':END_ID(Packet)', 'community_id:int', ':TYPE');
  edgeTrace.write(':START_ID(Trace)', ':END_ID(Concept)', ':TYPE');

  // ── 1. Packet nodes ───────────────────────────────────────────────────────
  const { rows: packets } = await pool.query(`
    SELECT packet_id, source_ref, feature_id, community_id, packet_key,
           concept_ids, source_path, sha256,
           payload->>'file_url' AS file_url
    FROM atlas_packets
    WHERE packet_id IS NOT NULL
    ORDER BY feature_id, community_id
  `);

  const featureSet = new Set();
  const conceptSet = new Set();
  // community → packet list for cluster edges
  const communityBuckets = new Map();

  for (const pkt of packets) {
    nodePackets.write(
      pkt.packet_id,
      pkt.source_ref,
      pkt.feature_id,
      pkt.community_id,
      pkt.packet_key,
      pkt.source_path ?? pkt.source_ref,
      pkt.file_url ?? '',
      pkt.sha256 ?? '',
      'Packet'
    );

    if (pkt.feature_id) featureSet.add(pkt.feature_id);

    // Collect concept_ids for MENTIONS edges
    const conceptIds = Array.isArray(pkt.concept_ids) ? pkt.concept_ids : [];
    for (const cid of conceptIds) {
      if (cid) {
        conceptSet.add(cid);
        edgeMention.write(pkt.packet_id, cid, 'MENTIONS');
      }
    }

    // Collect for cluster edges
    if (pkt.community_id != null) {
      if (!communityBuckets.has(pkt.community_id)) communityBuckets.set(pkt.community_id, []);
      communityBuckets.get(pkt.community_id).push(pkt.packet_id);
    }
  }
  console.log(`Packet nodes:     ${nodePackets.count - 1}`);  // -1 for header

  // ── 2. Feature nodes + IMPLEMENTS edges ──────────────────────────────────
  for (const fid of featureSet) {
    nodeFeatures.write(fid, fid, 'Feature');
  }
  // IMPLEMENTS: each packet → its feature
  for (const pkt of packets) {
    if (pkt.feature_id) edgeImpl.write(pkt.packet_id, pkt.feature_id, 'IMPLEMENTS');
  }
  console.log(`Feature nodes:    ${nodeFeatures.count - 1}`);
  console.log(`IMPLEMENTS edges: ${edgeImpl.count - 1}`);
  console.log(`MENTIONS edges:   ${edgeMention.count - 1}`);

  // ── 3. Concept nodes (union of atlas_packets + concept_records) ───────────
  const { rows: conceptRows } = await pool.query(`
    SELECT DISTINCT concept_id FROM concept_records ORDER BY concept_id
  `);
  for (const r of conceptRows) {
    conceptSet.add(r.concept_id);
  }
  for (const cid of conceptSet) {
    nodeConcepts.write(cid, cid, 'Concept');
  }
  console.log(`Concept nodes:    ${nodeConcepts.count - 1}`);

  // ── 4. SAME_COMMUNITY edges (capped per community) ────────────────────────
  // Chain edges within each community: A→B, B→C, ... (sparse, no supernodes)
  for (const [communityId, members] of communityBuckets) {
    const limit = Math.min(members.length - 1, MAX_CLUSTER_EDGES);
    for (let i = 0; i < limit; i++) {
      edgeCluster.write(members[i], members[i + 1], communityId, 'SAME_COMMUNITY');
    }
  }
  console.log(`SAME_COMMUNITY edges: ${edgeCluster.count - 1} (max ${MAX_CLUSTER_EDGES}/community)`);

  // ── 5. Trace nodes + USED_CONCEPT edges from agent_traces ─────────────────
  const { rows: traces } = await pool.query(`
    SELECT trace_id::text AS trace_id, selected_concepts
    FROM agent_traces
    WHERE selected_concepts IS NOT NULL
      AND jsonb_array_length(selected_concepts) > 0
  `);

  for (const t of traces) {
    nodeTraces.write(t.trace_id, 'Trace');
    const concepts = Array.isArray(t.selected_concepts) ? t.selected_concepts : [];
    for (const cid of concepts) {
      if (cid) edgeTrace.write(t.trace_id, cid, 'USED_CONCEPT');
    }
  }
  console.log(`Trace nodes:        ${nodeTraces.count - 1}`);
  console.log(`USED_CONCEPT edges: ${edgeTrace.count - 1}`);

  // ── Close all writers ─────────────────────────────────────────────────────
  await Promise.all([
    nodePackets.close(), nodeFeatures.close(), nodeConcepts.close(), nodeTraces.close(),
    edgeImpl.close(), edgeMention.close(), edgeCluster.close(), edgeTrace.close(),
  ]);
  await pool.end();

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalNodes = (nodePackets.count - 1) + (nodeFeatures.count - 1) +
                     (nodeConcepts.count - 1) + (nodeTraces.count - 1);
  const totalEdges = (edgeImpl.count - 1) + (edgeMention.count - 1) +
                     (edgeCluster.count - 1) + (edgeTrace.count - 1);

  console.log(`\n══ Summary ══════════════════════════════════════`);
  console.log(`  Total nodes: ${totalNodes}`);
  console.log(`  Total edges: ${totalEdges}`);
  if (!DRY_RUN) {
    console.log(`  Output:      ${OUT}/`);
    console.log(`\n  Neo4j import command:`);
    console.log(`  neo4j-admin database import full neo4j \\`);
    console.log(`    --nodes=${OUT}/nodes-packets.csv \\`);
    console.log(`    --nodes=${OUT}/nodes-features.csv \\`);
    console.log(`    --nodes=${OUT}/nodes-concepts.csv \\`);
    console.log(`    --nodes=${OUT}/nodes-traces.csv \\`);
    console.log(`    --relationships=${OUT}/edges-implements.csv \\`);
    console.log(`    --relationships=${OUT}/edges-mentions.csv \\`);
    console.log(`    --relationships=${OUT}/edges-cluster.csv \\`);
    console.log(`    --relationships=${OUT}/edges-trace-used.csv \\`);
    console.log(`    --overwrite-destination`);
  } else {
    console.log(`\n  (dry-run — no files written)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
