#!/usr/bin/env node
/**
 * scripts/atlas/backfill-gds-som-topology.mjs
 *
 * Runs Neo4j GDS algorithms (PageRank, Louvain, Degree) over the imported Packet similarity graph,
 * resolves SOM 20x20 BMU coordinates and cluster IDs, and backfills these topology metrics
 * into addressable packets.
 *
 * Output:
 *   - .tmp/addressable-packets.topology.ndjson
 *   - docs/reports/addressable-packet-topology-report.json
 *   - docs/reports/addressable-packet-topology-report.md
 *
 * Usage:
 *   npx tsx scripts/atlas/backfill-gds-som-topology.mjs [--verbose] [--dry-run] [--apply] [--limit=N]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import neo4j from 'neo4j-driver';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const INPUT_CANDIDATES = [
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.enriched.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.validated.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson'),
];

const inputArg = process.argv.find(a => a.startsWith('--input='));
const inputPathOverride = inputArg ? path.resolve(REPO_ROOT, inputArg.split('=')[1]) : null;

const OUTPUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'addressable-packets.topology.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'addressable-packet-topology-report.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'addressable-packet-topology-report.md');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j123';

const VERBOSE = process.argv.includes('--verbose');
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function toFloat(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && typeof val.toNumber === 'function') return val.toNumber();
  return Number(val);
}

async function resolveTopologyRelationshipType(session) {
  const candidates = ['SIMILAR_TOPOLOGY', 'SIMILAR_TO'];
  try {
    const result = await session.run(`
      CALL db.relationshipTypes()
      YIELD relationshipType
      RETURN collect(relationshipType) AS relationshipTypes
    `);
    const row = result.records[0]?.toObject?.() ?? {};
    const types = Array.isArray(row.relationshipTypes) ? row.relationshipTypes.map(String) : [];
    for (const candidate of candidates) {
      if (types.includes(candidate)) {
        return candidate;
      }
    }
    return types[0] || candidates[0];
  } catch {
    return candidates[0];
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  GDS/SOM Topology Backfill Script                              ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (default)'}                                            ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Step 1: Run Neo4j GDS metrics
  console.log('🔌 Step 1: Connecting to Neo4j & running GDS centrality/community detection...');
  const neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const neo4jSession = neo4jDriver.session();
  const neo4jRawScores = new Map(); // rawId -> { node_id, pagerank, community_id, degree, neighbors }

  let neo4jReachable = false;
  try {
    // Check projection
    console.log('   - Checking GDS projection for topoGraph...');
    const topologyRelType = await resolveTopologyRelationshipType(neo4jSession);
    console.log(`   - Topology relationship type: ${topologyRelType}`);
    await neo4jSession.run("CALL gds.graph.drop('topoGraph', false)").catch(() => {});
    
    const projectRes = await neo4jSession.run(`
      CALL gds.graph.project(
        'topoGraph',
        'Packet',
        { ${topologyRelType}: { orientation: 'UNDIRECTED' } }
      )
      YIELD graphName, nodeCount, relationshipCount
      RETURN graphName, nodeCount, relationshipCount
    `);
    
    const proj = projectRes.records[0].toObject();
    console.log(`   - Projected GDS graph: ${proj.graphName} (${proj.nodeCount.toString()} nodes, ${proj.relationshipCount.toString()} relationships)`);

    // Run PageRank
    console.log('   - Calculating PageRank...');
    const prRes = await neo4jSession.run(`
      CALL gds.pageRank.stream('topoGraph')
      YIELD nodeId, score
      RETURN id(gds.util.asNode(nodeId)) AS node_id,
             COALESCE(gds.util.asNode(nodeId).packet_key, gds.util.asNode(nodeId).id, gds.util.asNode(nodeId).source_ref) AS id,
             score AS pagerank
    `);
    prRes.records.forEach(r => {
      const id = r.get('id');
      const nodeId = toFloat(r.get('node_id'));
      const pr = toFloat(r.get('pagerank'));
      if (id) {
        if (!neo4jRawScores.has(id)) {
          neo4jRawScores.set(id, { node_id: nodeId, pagerank: null, community_id: null, degree: null, neighbors: [] });
        }
        neo4jRawScores.get(id).pagerank = pr;
      }
    });

    // Run Louvain Community Detection
    console.log('   - Calculating Louvain community IDs...');
    const lvRes = await neo4jSession.run(`
      CALL gds.louvain.stream('topoGraph')
      YIELD nodeId, communityId
      RETURN COALESCE(gds.util.asNode(nodeId).packet_key, gds.util.asNode(nodeId).id, gds.util.asNode(nodeId).source_ref) AS id,
             communityId AS community_id
    `);
    lvRes.records.forEach(r => {
      const id = r.get('id');
      const comm = toFloat(r.get('community_id'));
      if (id) {
        if (!neo4jRawScores.has(id)) {
          neo4jRawScores.set(id, { node_id: null, pagerank: null, community_id: null, degree: null, neighbors: [] });
        }
        neo4jRawScores.get(id).community_id = comm;
      }
    });

    // Run Degree Centrality
    console.log('   - Calculating Degree Centrality...');
    const degRes = await neo4jSession.run(`
      CALL gds.degree.stream('topoGraph')
      YIELD nodeId, score
      RETURN COALESCE(gds.util.asNode(nodeId).packet_key, gds.util.asNode(nodeId).id, gds.util.asNode(nodeId).source_ref) AS id,
             score AS degree
    `);
    degRes.records.forEach(r => {
      const id = r.get('id');
      const deg = toFloat(r.get('degree'));
      if (id) {
        if (!neo4jRawScores.has(id)) {
          neo4jRawScores.set(id, { node_id: null, pagerank: null, community_id: null, degree: null, neighbors: [] });
        }
        neo4jRawScores.get(id).degree = deg;
      }
    });

    // Fetch neighbors
    console.log('   - Fetching neighbor relationships...');
    const neighborRes = await neo4jSession.run(`
      MATCH (p:Packet)-[:${topologyRelType}]->(n:Packet)
      RETURN COALESCE(p.packet_key, p.id, p.source_ref) AS source_id,
             collect(COALESCE(n.packet_key, n.id, n.source_ref)) AS neighbors
    `);
    neighborRes.records.forEach(r => {
      const srcId = r.get('source_id');
      const neighbors = r.get('neighbors');
      if (srcId) {
        if (!neo4jRawScores.has(srcId)) {
          neo4jRawScores.set(srcId, { node_id: null, pagerank: null, community_id: null, degree: null, neighbors: [] });
        }
        neo4jRawScores.get(srcId).neighbors = neighbors;
      }
    });

    neo4jReachable = true;
    console.log(`   ✅ GDS calculations completed. Scored ${neo4jRawScores.size} unique keys.`);
  } catch (err) {
    console.warn(`   ⚠️  Neo4j GDS failed or unreachable: ${err.message}. Proceeding without GDS metrics.`);
  } finally {
    await neo4jSession.close();
    await neo4jDriver.close();
  }

  // Step 2: Load SOM assignments
  console.log('\n💾 Step 2: Loading SOM assignments & Card mapping...');
  const cardMapPath = path.join(REPO_ROOT, 'memory', 'exports', 'sourceRef-cardId-map.json');
  const somMetricsPath = path.join(REPO_ROOT, 'memory', 'exports', 'som-metrics.json');
  const somAssignments = new Map(); // originalCardId -> SOM data
  const refToCardMap = new Map(); // normalized sourceRef -> originalCardId
  const cardToRefMap = new Map(); // originalCardId -> normalized sourceRef

  let somLoaded = false;
  if (fs.existsSync(cardMapPath) && fs.existsSync(somMetricsPath)) {
    try {
      const cardMap = JSON.parse(fs.readFileSync(cardMapPath, 'utf8'));
      for (const [key, val] of Object.entries(cardMap)) {
        if (val.originalCardId) {
          const normRef = key.replace(/\\/g, '/');
          refToCardMap.set(normRef, val.originalCardId);
          cardToRefMap.set(val.originalCardId, normRef);
        }
      }

      const somMetrics = JSON.parse(fs.readFileSync(somMetricsPath, 'utf8'));
      const assignments = somMetrics.allAssignments || somMetrics.sampleAssignments || [];
      assignments.forEach(assign => {
        if (assign.cardId) {
          somAssignments.set(assign.cardId, {
            som_x: assign.bmuCol,
            som_y: assign.bmuRow,
            som_index: assign.bmuIndex ?? (assign.bmuRow * 20 + assign.bmuCol),
            ae_distance: assign.bmuDistance,
            som_cluster: `${assign.bmuRow}:${assign.bmuCol}`
          });
        }
      });
      somLoaded = true;
      console.log(`   ✅ Loaded ${refToCardMap.size} card mappings and ${somAssignments.size} SOM cell assignments.`);
    } catch (err) {
      console.warn(`   ⚠️  Failed to load SOM files: ${err.message}. Proceeding without SOM coordinates.`);
    }
  } else {
    console.warn(`   ⚠️  SOM coordinate maps not found in memory/exports. Proceeding without SOM coordinates.`);
  }

  // Step 3: Find and read input NDJSON
  console.log('\n🔍 Step 3: Resolving input NDJSON file...');
  let inputPath = inputPathOverride;
  if (inputPath) {
    if (!fs.existsSync(inputPath)) {
      console.error(`   ❌ Override input path does not exist: ${inputPath}`);
      process.exit(1);
    }
  } else {
    for (const candidate of INPUT_CANDIDATES) {
      if (fs.existsSync(candidate)) {
        inputPath = candidate;
        break;
      }
    }
  }

  if (!inputPath) {
    console.error('   ❌ No input NDJSON found! Run materialize-addressable-packets.mjs first.');
    process.exit(1);
  }
  console.log(`   ✅ Selected input: ${path.relative(REPO_ROOT, inputPath)}`);

  const fileContent = fs.readFileSync(inputPath, 'utf8');
  const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
  const totalRows = lines.length;
  console.log(`   ✅ Read ${totalRows} lines.`);

  const limitCount = Math.min(totalRows, LIMIT);
  if (LIMIT !== Infinity) {
    console.log(`   ℹ️  Processing limit set to: ${limitCount}`);
  }

  // Build key & ref indexes to allow robust GDS matches
  const packetsList = [];
  const packetKeyMap = new Set();
  const sourceRefMap = new Map(); // normalized ref -> packet_key
  const packetKeyToRef = new Map(); // packet_key -> normalized ref

  for (let i = 0; i < limitCount; i++) {
    try {
      const p = JSON.parse(lines[i]);
      packetsList.push(p);
      if (p.packet_key) {
        packetKeyMap.add(p.packet_key);
        if (p.source_ref) {
          const normRef = p.source_ref.replace(/\\/g, '/');
          sourceRefMap.set(normRef, p.packet_key);
          packetKeyToRef.set(p.packet_key, normRef);
        }
      }
    } catch (err) {
      // skip invalid lines
    }
  }

  // Helper resolver
  function resolvePacketKey(rawId) {
    if (!rawId) return null;
    if (packetKeyMap.has(rawId)) return rawId;

    const normalized = rawId.replace(/\\/g, '/');
    if (sourceRefMap.has(normalized)) return sourceRefMap.get(normalized);

    // Check card path format: .opencode/cards/000678ef52ca67b0.json:L1
    const cardMatch = rawId.match(/([a-f0-9]{16})\.json/i);
    if (cardMatch) {
      const cardId = cardMatch[1];
      const sourceRef = cardToRefMap.get(cardId);
      if (sourceRef && sourceRefMap.has(sourceRef)) {
        return sourceRefMap.get(sourceRef);
      }
    }
    return null;
  }

  // Build GDS scores mapped by packet key
  const scoredByPacketKey = new Map();
  for (const [rawId, score] of neo4jRawScores.entries()) {
    const pKey = resolvePacketKey(rawId);
    if (pKey) {
      const resolvedNeighbors = (score.neighbors || [])
        .map(resolvePacketKey)
        .filter(Boolean);

      scoredByPacketKey.set(pKey, {
        node_id: score.node_id,
        pagerank: score.pagerank,
        community_id: score.community_id,
        degree: score.degree,
        neighbors: resolvedNeighbors
      });
    }
  }

  // Step 4: Merge topology envelopes and prepare outputs
  console.log('\n🔀 Step 4: Merging topology metrics into packet structures...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const pgClient = APPLY ? await pool.connect() : null;

  let successCount = 0;
  let gdsEnrichedCount = 0;
  let somEnrichedCount = 0;
  let errorCount = 0;
  const errorsList = [];
  const updatedPackets = [];

  for (const packet of packetsList) {
    const key = packet.packet_key;
    const ref = packetKeyToRef.get(key) || '';

    // A. Neo4j GDS Lookup
    const gds = scoredByPacketKey.get(key) || null;

    // B. SOM Lookup
    const cardId = refToCardMap.get(ref);
    const som = cardId ? somAssignments.get(cardId) : null;

    // Initialize or extend topology envelope
    packet.topology = {
      ...(packet.topology || {}),
      community_id: gds?.community_id !== undefined ? String(gds.community_id) : (packet.topology?.community_id ?? null),
      neo4j_node_id: gds?.node_id !== undefined ? String(gds.node_id) : (packet.topology?.neo4j_node_id ?? null),
      pagerank: gds?.pagerank ?? (packet.topology?.pagerank ?? null),
      degree: gds?.degree ?? (packet.topology?.degree ?? null),
      som_x: som?.som_x ?? (packet.topology?.som_x ?? null),
      som_y: som?.som_y ?? (packet.topology?.som_y ?? null),
      som_cluster: som?.som_cluster ?? (packet.topology?.som_cluster ?? null),
      ae_distance: som?.ae_distance ?? (packet.topology?.ae_distance ?? null),
      nearest_neighbors: gds?.neighbors && gds.neighbors.length > 0 ? gds.neighbors : (packet.topology?.nearest_neighbors ?? []),
      topology_version: "2026-06-18",
      topology_updated_at: new Date().toISOString()
    };

    const hasGds = gds || (packet.topology?.pagerank !== undefined && packet.topology?.pagerank !== null);
    if (hasGds) gdsEnrichedCount++;

    const hasSom = som || (packet.topology?.som_x !== undefined && packet.topology?.som_x !== null);
    if (hasSom) somEnrichedCount++;

    updatedPackets.push(packet);

    if (DRY_RUN) {
      if (VERBOSE && successCount < 5) {
        console.log(`[DRY-RUN] Packet ${key}:`);
        console.log(`  topology:`, JSON.stringify(packet.topology));
      }
      successCount++;
      continue;
    }

    // APPLY updates back to Postgres
    try {
      const som_row = packet.topology.som_y;
      const som_col = packet.topology.som_x;
      const som_index = (som_row !== null && som_col !== null) ? (som_row * 20 + som_col) : null;
      const community_id = packet.topology.community_id !== null ? parseInt(packet.topology.community_id, 10) : null;
      const pagerank = packet.topology.pagerank;
      const node_id = packet.topology.neo4j_node_id;

      const query = `
        UPDATE atlas_packets
        SET
          topology = $1,
          pagerank = $2,
          community_id = $3,
          som_row = $4,
          som_col = $5,
          som_index = $6,
          neo4j_node_id = $7,
          updated_at = NOW()
        WHERE packet_key = $8
      `;

      const res = await pgClient.query(query, [
        JSON.stringify(packet.topology),
        pagerank,
        community_id,
        som_row,
        som_col,
        som_index,
        node_id,
        key
      ]);

      if (res.rowCount > 0) {
        successCount++;
      } else {
        if (VERBOSE) {
          console.log(`   ℹ️  Packet ${key} not found in database table atlas_packets.`);
        }
        successCount++;
      }
    } catch (err) {
      errorCount++;
      errorsList.push({ packet_key: key, error: err.message });
      if (VERBOSE) {
        console.error(`   ❌ DB Update Error for ${key}:`, err.message);
      }
    }
  }

  // Write topology ndjson output
  if (APPLY) {
    fs.mkdirSync(path.dirname(OUTPUT_NDJSON), { recursive: true });
    const outputContent = updatedPackets.map(p => JSON.stringify(p)).join('\n') + '\n';
    fs.writeFileSync(OUTPUT_NDJSON, outputContent, 'utf8');
    console.log(`\n💾 Wrote updated NDJSON to: .tmp/addressable-packets.topology.ndjson`);
  }

  if (pgClient) {
    await pgClient.release();
    await pool.end();
  }

  // Step 5: Save Reports
  console.log('\n📊 Step 5: Generating reports...');
  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    input_file: path.relative(REPO_ROOT, inputPath).replace(/\\/g, '/'),
    statistics: {
      total_packets_processed: limitCount,
      success_count: successCount,
      gds_enriched: gdsEnrichedCount,
      som_enriched: somEnrichedCount,
      error_count: errorCount,
    },
    neo4j: {
      reachable: neo4jReachable,
      total_scored: neo4jRawScores.size,
      resolved_matches: scoredByPacketKey.size,
    },
    som: {
      loaded: somLoaded,
      total_assigned: somAssignments.size,
    },
    errors: errorsList,
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.log(`   - JSON report written to: docs/reports/addressable-packet-topology-report.json`);

  const mdReport = renderMarkdownReport(report);
  fs.writeFileSync(REPORT_MD, mdReport, 'utf8');
  console.log(`   - Markdown report written to: docs/reports/addressable-packet-topology-report.md`);

  console.log('\n═══ Execution Complete ═══════════════════════════════════════');
  console.log(`Packets processed:      ${report.statistics.total_packets_processed}`);
  console.log(`Neo4j GDS enriched:     ${report.statistics.gds_enriched}`);
  console.log(`SOM BMU coordinates:    ${report.statistics.som_enriched}`);
  console.log(`Errors encountered:     ${report.statistics.error_count}`);
  console.log(`Status:                 ${errorCount === 0 ? '✅ SUCCESS' : '⚠️  COMPLETED WITH ERRORS'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  process.exitCode = errorCount === 0 ? 0 : 1;
}

function renderMarkdownReport(report) {
  const stats = report.statistics;
  const pct = (val, base) => `${base > 0 ? (val / base * 100).toFixed(1) : '0.0'}%`;
  
  return `# GDS/SOM Topology Backfill Report

Generated: ${report.generated_at}
Mode: **${report.mode.toUpperCase()}**
Input File: \`${report.input_file}\`

## Executive Summary

This report captures the results of the Graph Data Science (GDS) and Self-Organizing Map (SOM) topology enrichment pass. Packet structures now carry community partitioning, graph centrality ranks, and SOM BMU grid projections directly inside the validated ` + '`topology` ' + `envelope.

## Statistics

| Metric | Count | Percentage |
|:---|:---|:---|
| **Total Processed** | ${stats.total_packets_processed} | 100% |
| **Success Updates** | ${stats.success_count} | ${pct(stats.success_count, stats.total_packets_processed)} |
| **Neo4j GDS Enriched** | ${stats.gds_enriched} | ${pct(stats.gds_enriched, stats.total_packets_processed)} |
| **SOM BMU Coords Enriched** | ${stats.som_enriched} | ${pct(stats.som_enriched, stats.total_packets_processed)} |
| **Errors** | ${stats.error_count} | ${pct(stats.error_count, stats.total_packets_processed)} |

## Component Status

- **Neo4j GDS**: ${report.neo4j.reachable ? '✅ REACHABLE' : '❌ UNREACHABLE'} (Scored nodes: ${report.neo4j.total_scored}, Resolved matches: ${report.neo4j.resolved_matches})
- **SOM BMU Coordinates**: ${report.som.loaded ? '✅ LOADED' : '❌ FAILED/MISSING'} (Assigned cells: ${report.som.total_assigned})

## Errors List

${stats.error_count > 0 
    ? report.errors.map(e => `- Packet \`${e.packet_key || 'unknown'}\`: ${e.error}`).join('\n') 
    : '*No errors encountered.*'}
`;
}

main().catch(err => {
  console.error('\n❌ Script crash:', err.message);
  process.exit(1);
});
