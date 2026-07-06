#!/usr/bin/env node
/**
 * Phase 106: Audit Topology Completion Gaps
 *
 * Purpose:
 *   Verify SOM, PageRank, tree_node_id, and Qdrant indexing coverage
 *   across all packets. Reports gaps for backfill.
 *
 * Coverage metrics:
 *   - SOM cells present / target (10x10 = 100 cells, upgrading to 20x20 = 400)
 *   - Packets missing SOM cell assignment
 *   - Packets missing tree_node_id
 *   - Packets missing qdrant_point_id
 *   - Packets missing title_id
 *   - PageRank scores present / missing
 *   - Community assignments present / missing
 *
 * Output:
 *   - Console summary (dry-run or apply mode)
 *   - JSON report: docs/reports/audit-topology-completion-gaps.json
 *   - Markdown report: docs/reports/audit-topology-completion-gaps.md
 *
 * Usage:
 *   npm run atlas:audit:topology:gaps
 *   npm run atlas:audit:topology:gaps --apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const isApply = process.argv.includes('--apply');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function main() {
  console.log(`\n[PHASE 106] Audit Topology Completion Gaps\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch overall packet counts
    console.log('Step 1: Fetch packet counts...');

    const countResult = await client.query(`
      SELECT COUNT(*) AS total_packets
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const totalPackets = parseInt(countResult.rows[0].total_packets);
    console.log(`  Total packets: ${totalPackets}\n`);

    // 2. Audit SOM cells
    console.log('Step 2: Audit SOM topology...');

    const somResult = await client.query(`
      SELECT
        COUNT(DISTINCT som_cluster) AS som_cells_populated,
        COUNT(DISTINCT som_row) AS som_rows,
        COUNT(DISTINCT som_col) AS som_cols,
        COUNT(CASE WHEN som_cluster IS NULL THEN 1 END) AS packets_missing_som
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const somData = somResult.rows[0];
    const somCellsPopulated = parseInt(somData.som_cells_populated) || 0;
    const somRowsCount = parseInt(somData.som_rows) || 0;
    const somColsCount = parseInt(somData.som_cols) || 0;
    const packetsMissingSom = parseInt(somData.packets_missing_som) || 0;

    console.log(`  SOM cells populated: ${somCellsPopulated} (target: 400 = 20×20)`);
    console.log(`  SOM grid: ${somRowsCount}×${somColsCount}`);
    console.log(`  Packets missing SOM: ${packetsMissingSom}\n`);

    // 3. Audit PageRank
    console.log('Step 3: Audit PageRank scores...');

    const pageRankResult = await client.query(`
      SELECT
        COUNT(CASE WHEN page_rank_score IS NOT NULL THEN 1 END) AS packets_with_pagerank,
        COUNT(CASE WHEN page_rank_score IS NULL THEN 1 END) AS packets_missing_pagerank,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) AS packets_with_community
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const prData = pageRankResult.rows[0];
    const packetsWithPageRank = parseInt(prData.packets_with_pagerank) || 0;
    const packetsMissingPageRank = parseInt(prData.packets_missing_pagerank) || 0;
    const packetsWithCommunity = parseInt(prData.packets_with_community) || 0;

    console.log(`  Packets with PageRank: ${packetsWithPageRank}`);
    console.log(`  Packets missing PageRank: ${packetsMissingPageRank}`);
    console.log(`  Packets with community: ${packetsWithCommunity}\n`);

    // 4. Audit tree_node_id
    console.log('Step 4: Audit tree_node_id...');

    const treeNodeResult = await client.query(`
      SELECT
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) AS packets_with_tree_node_id,
        COUNT(CASE WHEN tree_node_id IS NULL THEN 1 END) AS packets_missing_tree_node_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const treeData = treeNodeResult.rows[0];
    const packetsWithTreeNodeId = parseInt(treeData.packets_with_tree_node_id) || 0;
    const packetsMissingTreeNodeId = parseInt(treeData.packets_missing_tree_node_id) || 0;

    console.log(`  Packets with tree_node_id: ${packetsWithTreeNodeId}`);
    console.log(`  Packets missing tree_node_id: ${packetsMissingTreeNodeId}\n`);

    // 5. Audit Qdrant indexing
    console.log('Step 5: Audit Qdrant point IDs...');

    const qdrantResult = await client.query(`
      SELECT
        COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) AS packets_with_qdrant_point_id,
        COUNT(CASE WHEN qdrant_point_id IS NULL THEN 1 END) AS packets_missing_qdrant_point_id,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) AS packets_with_embedding
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const qdrantData = qdrantResult.rows[0];
    const packetsWithQdrantPointId = parseInt(qdrantData.packets_with_qdrant_point_id) || 0;
    const packetsMissingQdrantPointId = parseInt(qdrantData.packets_missing_qdrant_point_id) || 0;
    const packetsWithEmbedding = parseInt(qdrantData.packets_with_embedding) || 0;

    console.log(`  Packets with Qdrant point_id: ${packetsWithQdrantPointId}`);
    console.log(`  Packets missing Qdrant point_id: ${packetsMissingQdrantPointId}`);
    console.log(`  Packets with embedding: ${packetsWithEmbedding}\n`);

    // 6. Audit title_id
    console.log('Step 6: Audit title_id...');

    const titleResult = await client.query(`
      SELECT
        COUNT(CASE WHEN title_id IS NOT NULL THEN 1 END) AS packets_with_title_id,
        COUNT(CASE WHEN title_id IS NULL THEN 1 END) AS packets_missing_title_id
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
    `);

    const titleData = titleResult.rows[0];
    const packetsWithTitleId = parseInt(titleData.packets_with_title_id) || 0;
    const packetsMissingTitleId = parseInt(titleData.packets_missing_title_id) || 0;

    console.log(`  Packets with title_id: ${packetsWithTitleId}`);
    console.log(`  Packets missing title_id: ${packetsMissingTitleId}\n`);

    // 7. Identify packets to backfill
    if (!isApply) {
      console.log('Step 7: Sample packets for backfill (first 5)...\n');

      const sampleResult = await client.query(`
        SELECT
          packet_key,
          feature_id,
          source_ref,
          som_cluster,
          tree_node_id,
          qdrant_point_id,
          title_id,
          page_rank_score,
          community_id
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
          AND (som_cluster IS NULL OR tree_node_id IS NULL OR qdrant_point_id IS NULL)
        LIMIT 5
      `);

      sampleResult.rows.forEach((row, idx) => {
        console.log(`  [${idx + 1}] ${row.packet_key}`);
        console.log(`       SOM: ${row.som_cluster || 'MISSING'}`);
        console.log(`       Tree: ${row.tree_node_id || 'MISSING'}`);
        console.log(`       Qdrant: ${row.qdrant_point_id || 'MISSING'}`);
        console.log();
      });
    }

    // 8. Generate report
    console.log('Step 8: Generate audit report...');

    const reportsDir = path.join(process.cwd(), 'docs', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_packets: totalPackets,
        coverage: {
          som_cells: {
            present: somCellsPopulated,
            target: 400,
            coverage_pct: (somCellsPopulated / 400 * 100).toFixed(2)
          },
          tree_node_id: {
            present: packetsWithTreeNodeId,
            total: totalPackets,
            coverage_pct: (packetsWithTreeNodeId / totalPackets * 100).toFixed(2)
          },
          qdrant_point_id: {
            present: packetsWithQdrantPointId,
            total: totalPackets,
            coverage_pct: (packetsWithQdrantPointId / totalPackets * 100).toFixed(2)
          },
          pagerank: {
            present: packetsWithPageRank,
            total: totalPackets,
            coverage_pct: (packetsWithPageRank / totalPackets * 100).toFixed(2)
          },
          community: {
            present: packetsWithCommunity,
            total: totalPackets,
            coverage_pct: (packetsWithCommunity / totalPackets * 100).toFixed(2)
          },
          title_id: {
            present: packetsWithTitleId,
            total: totalPackets,
            coverage_pct: (packetsWithTitleId / totalPackets * 100).toFixed(2)
          }
        },
        gaps: {
          packets_missing_som: packetsMissingSom,
          packets_missing_tree_node_id: packetsMissingTreeNodeId,
          packets_missing_qdrant_point_id: packetsMissingQdrantPointId,
          packets_missing_pagerank: packetsMissingPageRank,
          packets_missing_title_id: packetsMissingTitleId
        }
      },
      topology_info: {
        som_grid_dims: `${somRowsCount}×${somColsCount}`,
        som_target_grid: '20×20 (400 cells)',
        som_cells_populated: somCellsPopulated,
        som_upgrade_gap: Math.max(0, 400 - somCellsPopulated)
      }
    };

    const reportPath = path.join(reportsDir, 'audit-topology-completion-gaps.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  [OK] Report written to ${reportPath}\n`);

    // 9. Generate Markdown report
    const mdReport = `# Topology Completion Audit

**Generated:** ${new Date().toISOString()}

## Summary

- **Total packets:** ${totalPackets}
- **SOM cells populated:** ${somCellsPopulated} / 400 (${(somCellsPopulated / 400 * 100).toFixed(1)}%)
- **Packets with tree_node_id:** ${packetsWithTreeNodeId} / ${totalPackets} (${(packetsWithTreeNodeId / totalPackets * 100).toFixed(1)}%)
- **Packets with qdrant_point_id:** ${packetsWithQdrantPointId} / ${totalPackets} (${(packetsWithQdrantPointId / totalPackets * 100).toFixed(1)}%)
- **Packets with PageRank:** ${packetsWithPageRank} / ${totalPackets} (${(packetsWithPageRank / totalPackets * 100).toFixed(1)}%)
- **Packets with title_id:** ${packetsWithTitleId} / ${totalPackets} (${(packetsWithTitleId / totalPackets * 100).toFixed(1)}%)

## Gaps to Backfill

| Gap | Count | Coverage |
|-----|-------|----------|
| Missing SOM cluster | ${packetsMissingSom} | ${(1 - packetsMissingSom / totalPackets).toFixed(1)}% |
| Missing tree_node_id | ${packetsMissingTreeNodeId} | ${(packetsWithTreeNodeId / totalPackets * 100).toFixed(1)}% |
| Missing qdrant_point_id | ${packetsMissingQdrantPointId} | ${(packetsWithQdrantPointId / totalPackets * 100).toFixed(1)}% |
| Missing PageRank score | ${packetsMissingPageRank} | ${(packetsWithPageRank / totalPackets * 100).toFixed(1)}% |
| Missing title_id | ${packetsMissingTitleId} | ${(packetsWithTitleId / totalPackets * 100).toFixed(1)}% |

## Topology Info

- **Current SOM grid:** ${somRowsCount}×${somColsCount}
- **Target SOM grid:** 20×20 (400 cells)
- **SOM upgrade gap:** ${Math.max(0, 400 - somCellsPopulated)} cells

## Next Steps

1. Backfill missing SOM clusters via \`npm run atlas:som:backfill\`
2. Backfill missing tree_node_id via \`npm run atlas:tree-node:backfill\`
3. Sync missing qdrant_point_id via \`npm run atlas:qdrant:sync\`
4. Regenerate PageRank via \`npm run atlas:pagerank:compute\`
5. Assign title_id via \`npm run atlas:title:assign\`
`;

    const mdPath = path.join(reportsDir, 'audit-topology-completion-gaps.md');
    fs.writeFileSync(mdPath, mdReport);
    console.log(`  [OK] Markdown report written to ${mdPath}\n`);

    // 10. Summary
    console.log('Audit Summary:');
    console.log(`  Total packets: ${totalPackets}`);
    console.log(`  SOM cell coverage: ${somCellsPopulated}/400 cells`);
    console.log(`  Tree node ID coverage: ${packetsWithTreeNodeId}/${totalPackets}`);
    console.log(`  Qdrant point ID coverage: ${packetsWithQdrantPointId}/${totalPackets}`);
    console.log(`  PageRank coverage: ${packetsWithPageRank}/${totalPackets}`);
    console.log(`  Title ID coverage: ${packetsWithTitleId}/${totalPackets}`);
    console.log();

    console.log('[SUCCESS] Topology Audit Complete.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
