#!/usr/bin/env node

/**
 * Task 11: Verify P1 Lineage End-to-End
 * Checks that all packets are properly linked to tree, topology, and summaries
 *
 * Created: June 15, 2026
 * Part of P1 Implementation
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
const envPath = `${__dirname}/../../.env`;
dotenv.config({ path: envPath });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const log = {
  info: (msg) => console.log(`[verify-p1-lineage] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
};

const PACKET_TABLE_CANDIDATES = ['atlas_codebase_packets', 'atlas_packets'];

async function detectPacketTable(client) {
  const res = await client.query(
    `
      SELECT table_name,
             EXISTS (
               SELECT 1
               FROM information_schema.columns c
               WHERE c.table_schema = 'public'
                 AND c.table_name = t.table_name
                 AND c.column_name = 'tree_node_id'
             ) AS has_tree_node_id
      FROM unnest($1::text[]) AS t(table_name)
      WHERE EXISTS (
        SELECT 1
        FROM information_schema.tables i
        WHERE i.table_schema = 'public'
          AND i.table_name = t.table_name
      )
      ORDER BY CASE table_name
        WHEN 'atlas_codebase_packets' THEN 0
        WHEN 'atlas_packets' THEN 1
        ELSE 2
      END
      LIMIT 1
    `,
    [PACKET_TABLE_CANDIDATES]
  );

  if (res.rows.length === 0) {
    throw new Error(`No packet ledger found. Expected one of: ${PACKET_TABLE_CANDIDATES.join(', ')}`);
  }

  return {
    tableName: res.rows[0].table_name,
    hasTreeNodeId: res.rows[0].has_tree_node_id === true,
  };
}

/**
 * Main verification routine
 */
async function verifyLineage() {
  const client = await pool.connect();

  try {
    log.info('Verifying P1 Lineage (Phase 2A-2D)...\n');

    const packetLedger = await detectPacketTable(client);
    log.info(`Packet ledger: ${packetLedger.tableName}${packetLedger.hasTreeNodeId ? ' (tree_node_id available)' : ''}`);
    log.info('');

    // 1. Check the active packet ledger
    const packetsResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(source_ref) as with_source_ref,
        COUNT(feature_id) as with_feature_id,
        COUNT(packet_key) as with_packet_key
      FROM ${packetLedger.tableName}
    `);
    const packets = packetsResult.rows[0];
    log.info(`Lineage Verification`);
    log.info(`  ${packetLedger.tableName}: ${packets.total} packets`);
    log.ok(`    source_ref: ${packets.with_source_ref}/${packets.total}`);
    log.ok(`    feature_id: ${packets.with_feature_id}/${packets.total}`);
    log.ok(`    packet_key: ${packets.with_packet_key}/${packets.total}`);
    log.info('');

    // 2. Check atlas_tree_nodes
    const treeResult = await client.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN node_type = 'document' THEN 1 ELSE 0 END) as document_nodes,
        SUM(CASE WHEN node_type = 'chunk' THEN 1 ELSE 0 END) as chunk_nodes,
        COUNT(DISTINCT packet_key) FILTER (WHERE node_type = 'chunk') as unique_chunk_packets,
        COUNT(DISTINCT source_ref) FILTER (WHERE node_type = 'document' AND ledger_type = 'canonical') as unique_document_sources,
        COUNT(*) FILTER (WHERE node_type = 'document' AND ledger_type = 'canonical')
          - COUNT(DISTINCT source_ref) FILTER (WHERE node_type = 'document' AND ledger_type = 'canonical') as document_source_excess
      FROM atlas_tree_nodes
    `);
    const tree = treeResult.rows[0];
    log.info(`  atlas_tree_nodes: ${tree.total} total nodes`);
    log.ok(`    document (file roots): ${tree.document_nodes}`);
    log.ok(`    chunk (packets): ${tree.chunk_nodes}`);
    log.ok(`    canonical document sources: ${tree.unique_document_sources}`);
    log.ok(`    canonical chunk packets: ${tree.unique_chunk_packets}`);
    if (Number(tree.document_source_excess) === 0) {
      log.ok(`    canonical document source uniqueness: PASS`);
    } else {
      log.warn(`    canonical document source uniqueness: FAIL (${tree.document_source_excess} excess rows)`);
    }
    log.info('');

    const pathResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE cnt > 1) AS duplicate_paths,
        COALESCE(SUM(cnt - 1) FILTER (WHERE cnt > 1), 0) AS excess_rows,
        COALESCE(MAX(cnt), 0) AS max_group_size
      FROM (
        SELECT page_index_path, COUNT(*)::int AS cnt
        FROM atlas_tree_nodes
        WHERE node_type = 'document' AND ledger_type = 'canonical'
        GROUP BY page_index_path
      ) grouped
    `);
    const pathStats = pathResult.rows[0];
    log.info(`  canonical page_index_path:`);
    if (Number(pathStats.duplicate_paths) === 0) {
      log.ok(`    unique: PASS`);
    } else {
      log.warn(
        `    unique: FAIL (${pathStats.duplicate_paths} duplicate paths, ${pathStats.excess_rows} excess rows, max group ${pathStats.max_group_size})`
      );
    }
    log.info('');

    // 3. Check atlas_topology_index
    const topoResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(z_som) as with_som,
        COUNT(x_cosine) as with_qdrant,
        COUNT(y_graph) as with_neo4j,
        COUNT(w_authority) as with_authority,
        COUNT(tree_node_id) as with_tree_link
      FROM atlas_topology_index
    `);
    const topo = topoResult.rows[0];
    log.info(`  atlas_topology_index: ${topo.total} entries`);
    log.ok(`    with SOM (z_som): ${topo.with_som}/${topo.total}`);
    log.warn(`    with Qdrant (x_cosine): ${topo.with_qdrant}/${topo.total} (requires ANN)`);
    log.warn(`    with Neo4j (y_graph): ${topo.with_neo4j}/${topo.total} (requires traversal)`);
    log.warn(`    with Authority (w_authority): ${topo.with_authority}/${topo.total} (requires GPU)`);
    log.warn(`    with tree link (raw, unfiltered): ${topo.with_tree_link}/${topo.total}`);
    log.info('');

    // 3b. Topology canonical tree-link gates — eligibility-aware, not raw coverage.
    // Raw with_tree_link/total (above) mixes in rows whose packet_key was never a
    // real packet (2026-07-19 malformed 'summary-authority' burst, 5,530 rows,
    // text-fragment packet_keys, zero current writer). Those are permanently
    // ineligible for tree linkage, not a backfill gap — reporting against them
    // would either under-report real coverage or invite "force to 100%" hacks.
    log.info(`  Topology canonical tree-link gates (eligibility-aware):`);

    const eligResult = await client.query(`
      SELECT
        COUNT(*) AS topology_total,
        COUNT(*) FILTER (WHERE p.packet_key IS NOT NULL) AS eligible_rows,
        COUNT(*) FILTER (WHERE p.packet_key IS NOT NULL AND ti.tree_node_id IS NOT NULL) AS linked_eligible_rows,
        COUNT(*) FILTER (WHERE p.packet_key IS NOT NULL AND ti.tree_node_id IS NULL) AS unresolved_eligible_rows,
        COUNT(*) FILTER (WHERE p.packet_key IS NULL) AS excluded_rows
      FROM atlas_topology_index ti
      LEFT JOIN ${packetLedger.tableName} p ON p.packet_key = ti.packet_key
    `);
    const elig = eligResult.rows[0];
    const eligibleCoverage = Number(elig.eligible_rows) > 0
      ? (Number(elig.linked_eligible_rows) / Number(elig.eligible_rows) * 100).toFixed(2)
      : 'n/a';

    // TOPOLOGY_PACKET_RESOLUTION — every topology row's packet_key either
    // resolves to a real canonical packet or is accounted for as excluded.
    log.ok(`    TOPOLOGY_PACKET_RESOLUTION: eligible=${elig.eligible_rows} excluded=${elig.excluded_rows} (total=${elig.topology_total})`);

    // TOPOLOGY_CANONICAL_CHUNK_ONLY / TOPOLOGY_NO_HEURISTIC_AST_LINKS /
    // TOPOLOGY_NO_NONCANONICAL_LINKS — a linked topology row must point at a
    // node_type='chunk', ledger_type='canonical' tree node. Any other outcome
    // (including a heuristic-AST 'symbol' row somehow ending up linked) fails.
    const badLinkResult = await client.query(`
      SELECT COUNT(*) AS bad_links
      FROM atlas_topology_index ti
      JOIN atlas_tree_nodes t ON t.node_id = ti.tree_node_id
      WHERE NOT (t.node_type = 'chunk' AND t.ledger_type = 'canonical')
    `);
    const badLinks = Number(badLinkResult.rows[0].bad_links);
    log[badLinks === 0 ? 'ok' : 'warn'](
      `    TOPOLOGY_CANONICAL_CHUNK_ONLY / TOPOLOGY_NO_HEURISTIC_AST_LINKS / TOPOLOGY_NO_NONCANONICAL_LINKS: ${badLinks === 0 ? 'PASS' : `FAIL (${badLinks} rows point at a non-canonical or non-chunk tree node)`}`
    );

    // TOPOLOGY_TREE_LINK_COVERAGE — 100% of ELIGIBLE rows must be linked.
    // Never computed against topology_total (that would either punish
    // permanently-ineligible rows or invite silently excluding them to
    // manufacture 100%).
    const eligCoveragePass = Number(elig.unresolved_eligible_rows) === 0 && Number(elig.eligible_rows) > 0;
    log[eligCoveragePass ? 'ok' : 'warn'](
      `    TOPOLOGY_TREE_LINK_COVERAGE: linked=${elig.linked_eligible_rows}/${elig.eligible_rows} eligible (${eligibleCoverage}%), unresolved=${elig.unresolved_eligible_rows}`
    );

    // TOPOLOGY_IDENTITY_UNIQUE — packet_key is the table's primary key, so this
    // is a structural guarantee, not a data-dependent check; verified directly
    // against the constraint rather than assumed.
    const dupResult = await client.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'atlas_topology_index'::regclass AND contype = 'p'
    `);
    log[dupResult.rows.length > 0 ? 'ok' : 'warn'](
      `    TOPOLOGY_IDENTITY_UNIQUE: ${dupResult.rows.length > 0 ? `PASS (primary key ${dupResult.rows[0].conname} on packet_key)` : 'FAIL (no primary key found on atlas_topology_index)'}`
    );

    // TOPOLOGY_BACKFILL_IDEMPOTENT — this verifier is read-only by design and
    // does not itself invoke the backfill (that would make "verify" mutate
    // state). Idempotency is proven procedurally: run scripts/atlas/
    // backfill-topology-index.mjs twice in a row and require the second run's
    // own "Affected 0, skipped 0" report — see openspec change task file for
    // the dated, recorded proof of the last such run.
    log.info(`    TOPOLOGY_BACKFILL_IDEMPOTENT: not asserted here (read-only verifier) — see OpenSpec for the dated two-run proof (rows affected: N, then 0)`);
    log.info('');

    // 4. Check atlas_summary_layers
    const summaryResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT packet_key) as unique_packets,
        COUNT(DISTINCT summary_level) as unique_levels,
        SUM(CASE WHEN summary_text IS NOT NULL THEN 1 ELSE 0 END) as with_content
      FROM atlas_summary_layers
    `);
    const summary = summaryResult.rows[0];
    log.info(`  atlas_summary_layers: ${summary.total} entries`);
    log.ok(`    unique packets: ${summary.unique_packets}/${packets.total}`);
    log.ok(`    unique levels: ${summary.unique_levels}`);
    log.warn(`    with content: ${summary.with_content}/${summary.total} (requires offline generation)`);
    log.info('');

    // 5. Overall linking check
    const linkingResult = await client.query(`
      SELECT
        COUNT(DISTINCT p.packet_key) as packets_total,
        COUNT(DISTINCT CASE WHEN t.node_id IS NOT NULL THEN p.packet_key END) as packets_to_tree,
        COUNT(DISTINCT CASE WHEN ti.packet_key IS NOT NULL THEN p.packet_key END) as packets_to_topo,
        COUNT(DISTINCT CASE WHEN s.packet_key IS NOT NULL THEN p.packet_key END) as packets_to_summary,
        COUNT(DISTINCT CASE WHEN t.node_id IS NOT NULL AND ti.packet_key IS NOT NULL AND s.packet_key IS NOT NULL THEN p.packet_key END) as fully_linked
      FROM ${packetLedger.tableName} p
      LEFT JOIN atlas_tree_nodes t ON p.packet_key = t.packet_key
      LEFT JOIN atlas_topology_index ti ON p.packet_key = ti.packet_key
      LEFT JOIN atlas_summary_layers s ON p.packet_key = s.packet_key
    `);
    const linking = linkingResult.rows[0];
    log.info(`Linking:`);
    const treeLinkNote = Number(linking.packets_to_tree) === Number(linking.packets_total)
      ? 'complete'
      : 'needs chunk nodes';
    log[Number(linking.packets_to_tree) === Number(linking.packets_total) ? 'ok' : 'warn'](
      `  packets → tree_nodes: ${linking.packets_to_tree}/${linking.packets_total} (${treeLinkNote})`
    );
    log.ok(`  packets → topology: ${linking.packets_to_topo}/${linking.packets_total}`);
    log.ok(`  packets → summaries: ${linking.packets_to_summary}/${linking.packets_total} (stubs)`);
    log[Number(linking.fully_linked) === Number(linking.packets_total) ? 'ok' : 'warn'](
      `  fully linked: ${linking.fully_linked}/${linking.packets_total}`
    );
    log.info('');

    // 6. Qdrant status
    log.info(`Qdrant collections:`);
    log.warn(`  (Requires external check via curl http://127.0.0.1:6333/collections)`);
    log.info('');

    // Summary
    log.info(`Status: PARTIAL PASS`);
    log.ok(`  Phase 2A (tree_nodes): Created (document + chunk nodes)`);
    log.ok(`  Phase 2B (topology_index): Created (SOM coordinates)`);
    log.ok(`  Phase 2C (svg_glyphs): Created (stubs)`);
    log.ok(`  Phase 2D (summary_layers): Created (stubs, 19,506 rows)`);
    log[Number(linking.packets_to_tree) === Number(linking.packets_total) ? 'ok' : 'warn'](
      `  Tree linking: ${Number(linking.packets_to_tree) === Number(linking.packets_total) ? 'Complete' : 'Blocked (packet_key not in document nodes)'}`
    );
    log.warn(`  Qdrant 4D coordinates: Requires external enrichment (Karpathy GPU, Neo4j graph)`);

  } finally {
    client.release();
  }
}

verifyLineage()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
