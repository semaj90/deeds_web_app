#!/usr/bin/env node
/**
 * Phase D: Tree Node Ingestion
 *
 * Builds a simple PageIndex hierarchy from the active packet ledger:
 * - one document node per unique source_ref/file_path
 * - one chunk node per packet_key under that document
 *
 * Live schema contract:
 * - node_type: document | page | section | subsection | chunk
 * - ledger_type: canonical | legacy | synthetic
 * - page_index_path must start with doc:
 * - root nodes: parent_id IS NULL, tree_depth = 0
 * - child nodes: parent_id IS NOT NULL, tree_depth > 0
 *
 * Modes:
 *   --dry-run (default)
 *   --apply
 *   --limit N
 *   --verify
 *   --refresh        re-sync existing nodes instead of skipping them
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: `${__dirname}/../../.env` });

const PACKET_TABLE_CANDIDATES = ['atlas_codebase_packets', 'atlas_packets'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--apply');
const refresh = args.includes('--refresh');
const verifyOnly = args.includes('--verify');
const limitIndex = args.findIndex((a) => a === '--limit');
const limitEqArg = args.find((a) => a.startsWith('--limit='));
const limitValue = limitIndex >= 0 ? args[limitIndex + 1] : limitEqArg ? limitEqArg.split('=')[1] : null;
const limit = Number(limitValue ?? 999999);

function slug(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\.{2}\/)+/g, '')
    .replace(/^deeds-web-app\//i, '')
    .replace(/^sveltekit-frontend\//i, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function shortText(value, max = 500) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

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

async function getExistingNodeId(client, pageIndexPath, nodeType) {
  const res = await client.query(
    `SELECT node_id
       FROM atlas_tree_nodes
      WHERE page_index_path = $1
        AND node_type = $2
      ORDER BY created_at ASC NULLS LAST, updated_at ASC NULLS LAST
      LIMIT 1`,
    [pageIndexPath, nodeType]
  );
  return res.rows[0]?.node_id ?? null;
}

async function ensureTreeNode(client, payload, options = {}) {
  const existingId = await getExistingNodeId(client, payload.page_index_path, payload.node_type);
  const nodeId = existingId || randomUUID();
  const rootId = payload.root_id ?? nodeId;
  const shouldInsert = !existingId || refresh;

  if (!dryRun && shouldInsert) {
    await client.query(
      `
        INSERT INTO atlas_tree_nodes (
          node_id, parent_id, root_id, page_index_path, node_type, tree_depth,
          source_ref, file_path, file_url, packet_key, feature_id, title, summary,
          content_preview, page_start, page_end, keywords, tags, ontology, domain,
          som_cluster, community_id, metadata, ledger_type, lineage_version
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23::jsonb, $24, $25
        )
        ON CONFLICT (node_id) DO UPDATE SET
          parent_id = EXCLUDED.parent_id,
          root_id = EXCLUDED.root_id,
          page_index_path = EXCLUDED.page_index_path,
          node_type = EXCLUDED.node_type,
          tree_depth = EXCLUDED.tree_depth,
          source_ref = EXCLUDED.source_ref,
          file_path = EXCLUDED.file_path,
          file_url = EXCLUDED.file_url,
          packet_key = COALESCE(EXCLUDED.packet_key, atlas_tree_nodes.packet_key),
          feature_id = COALESCE(EXCLUDED.feature_id, atlas_tree_nodes.feature_id),
          title = COALESCE(EXCLUDED.title, atlas_tree_nodes.title),
          summary = COALESCE(EXCLUDED.summary, atlas_tree_nodes.summary),
          content_preview = COALESCE(EXCLUDED.content_preview, atlas_tree_nodes.content_preview),
          page_start = COALESCE(EXCLUDED.page_start, atlas_tree_nodes.page_start),
          page_end = COALESCE(EXCLUDED.page_end, atlas_tree_nodes.page_end),
          keywords = COALESCE(EXCLUDED.keywords, atlas_tree_nodes.keywords),
          tags = COALESCE(EXCLUDED.tags, atlas_tree_nodes.tags),
          ontology = COALESCE(EXCLUDED.ontology, atlas_tree_nodes.ontology),
          domain = COALESCE(EXCLUDED.domain, atlas_tree_nodes.domain),
          som_cluster = COALESCE(EXCLUDED.som_cluster, atlas_tree_nodes.som_cluster),
          community_id = COALESCE(EXCLUDED.community_id, atlas_tree_nodes.community_id),
          metadata = COALESCE(EXCLUDED.metadata, atlas_tree_nodes.metadata),
          ledger_type = COALESCE(EXCLUDED.ledger_type, atlas_tree_nodes.ledger_type),
          lineage_version = COALESCE(EXCLUDED.lineage_version, atlas_tree_nodes.lineage_version),
          updated_at = NOW()
      `,
      [
        nodeId,
        payload.parent_id,
        rootId,
        payload.page_index_path,
        payload.node_type,
        payload.tree_depth,
        payload.source_ref,
        payload.file_path,
        payload.file_url,
        payload.packet_key,
        payload.feature_id,
        payload.title,
        payload.summary,
        payload.content_preview,
        payload.page_start,
        payload.page_end,
        payload.keywords,
        payload.tags,
        payload.ontology,
        payload.domain,
        payload.som_cluster,
        payload.community_id,
        JSON.stringify(payload.metadata ?? {}),
        payload.ledger_type ?? 'canonical',
        payload.lineage_version ?? 'tree-nodes-v1',
      ]
    );
  }

  return { nodeId, existingId, inserted: shouldInsert };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  const stats = {
    packetLedger: null,
    packetLedgerHasTreeNodeId: false,
    filesProcessed: 0,
    documentsCreated: 0,
    documentsReused: 0,
    chunksCreated: 0,
    chunksReused: 0,
    packetLinksUpdated: 0,
    packetLinksSkipped: 0,
    duplicatePageIndexPaths: 0,
    orphanChildNodes: 0,
    sourceRefCoverage: 0,
    packetKeyCoverage: 0,
    errors: [],
  };

  try {
    const packetLedger = await detectPacketTable(client);
    stats.packetLedger = packetLedger.tableName;
    stats.packetLedgerHasTreeNodeId = packetLedger.hasTreeNodeId;

    if (verifyOnly) {
      console.log('[phase-d] verify mode');
    } else {
      console.log(`[phase-d] mode: ${dryRun ? 'dry-run' : refresh ? 'apply+refresh' : 'apply'}`);
    }
    console.log(`[phase-d] packet ledger: ${packetLedger.tableName}`);

    const filesRes = await client.query(
      `SELECT source_ref, file_path
         FROM ${packetLedger.tableName}
        WHERE source_ref IS NOT NULL
        ORDER BY source_ref
        LIMIT $1`,
      [limit]
    );

    const files = filesRes.rows;
    const selectedSourceRefs = files.map((row) => String(row.source_ref));
    const fileStats = new Map();
    for (const row of files) {
      const sourceRef = String(row.source_ref);
      if (!fileStats.has(sourceRef)) {
        fileStats.set(sourceRef, { file_path: row.file_path ?? sourceRef, packets: [] });
      }
    }

    const packetsRes = await client.query(
      `SELECT packet_key, source_ref, file_path, feature_id, feature_label, summary, community_id, som_cluster
         FROM ${packetLedger.tableName}
        WHERE source_ref IS NOT NULL
          AND source_ref = ANY($1::text[])
        ORDER BY source_ref, packet_key
        `,
      [selectedSourceRefs]
    );

    for (const packet of packetsRes.rows) {
      const sourceRef = String(packet.source_ref);
      if (!fileStats.has(sourceRef)) {
        fileStats.set(sourceRef, { file_path: packet.file_path ?? sourceRef, packets: [] });
      }
      fileStats.get(sourceRef).packets.push(packet);
    }

    let pageIndexPaths = [];

    for (const [sourceRef, file] of fileStats.entries()) {
      const packets = file.packets;
      if (packets.length === 0) continue;
      stats.filesProcessed += 1;

      const rootPageIndexPath = `doc:${slug(sourceRef)}`;
      const rootTitle = path.basename(String(file.file_path ?? sourceRef)) || sourceRef;
      const rootMetadata = {
        source: packetLedger.tableName,
        backfill: 'tree-nodes-v1',
        file_packet_count: packets.length,
        dominant_feature_id: packets[0]?.feature_id ?? null,
      };

      const root = await ensureTreeNode(client, {
        page_index_path: rootPageIndexPath,
        node_type: 'document',
        tree_depth: 0,
        parent_id: null,
        root_id: null,
        source_ref: sourceRef,
        file_path: file.file_path ?? sourceRef,
        file_url: null,
        packet_key: null,
        feature_id: packets[0]?.feature_id ?? null,
        title: rootTitle,
        summary: null,
        content_preview: null,
        page_start: null,
        page_end: null,
        keywords: null,
        tags: null,
        ontology: null,
        domain: null,
        som_cluster: null,
        community_id: packets[0]?.community_id ?? null,
        metadata: rootMetadata,
        ledger_type: 'canonical',
        lineage_version: 'tree-nodes-v1',
      });

      const rootId = root.nodeId;
      pageIndexPaths.push(rootPageIndexPath);
      if (root.inserted) {
        stats.documentsCreated += 1;
      } else {
        stats.documentsReused += 1;
      }

      for (const packet of packets) {
        const pageIndexPath = `${rootPageIndexPath}/chunk:${slug(packet.packet_key)}`;
        pageIndexPaths.push(pageIndexPath);
        const title = packet.feature_label || packet.packet_key;
        const contentPreview = shortText(packet.summary, 500);
        const metadata = {
          source: packetLedger.tableName,
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          backfill: 'tree-nodes-v1',
        };

        const chunk = await ensureTreeNode(client, {
          page_index_path: pageIndexPath,
          node_type: 'chunk',
          tree_depth: 1,
          parent_id: rootId,
          root_id: rootId,
          source_ref: packet.source_ref,
          file_path: packet.file_path ?? sourceRef,
          file_url: null,
          packet_key: packet.packet_key,
          feature_id: packet.feature_id,
          title,
          summary: packet.summary ?? null,
          content_preview: contentPreview,
          page_start: null,
          page_end: null,
          keywords: null,
          tags: null,
          ontology: null,
          domain: null,
          som_cluster: packet.som_cluster ?? null,
          community_id: packet.community_id ?? null,
          metadata,
          ledger_type: 'canonical',
          lineage_version: 'tree-nodes-v1',
        }, { refresh });

        if (chunk.inserted) {
          stats.chunksCreated += 1;
        } else {
          stats.chunksReused += 1;
        }

        if (!dryRun && packetLedger.hasTreeNodeId && packet.packet_key) {
          const updateRes = await client.query(
            `UPDATE ${packetLedger.tableName}
                SET tree_node_id = $1
              WHERE packet_key = $2
                AND (tree_node_id IS NULL OR tree_node_id <> $1)`,
            [chunk.nodeId, packet.packet_key]
          );
          stats.packetLinksUpdated += Number(updateRes.rowCount || 0);
        } else if (!packetLedger.hasTreeNodeId) {
          stats.packetLinksSkipped += 1;
        }
      }
    }

    const duplicatePageIndexRes = await client.query(
      `
        SELECT COUNT(*)::int AS duplicates
        FROM (
          SELECT page_index_path
          FROM atlas_tree_nodes
          GROUP BY page_index_path
          HAVING COUNT(*) > 1
        ) dup
      `
    );
    stats.duplicatePageIndexPaths = Number(duplicatePageIndexRes.rows[0]?.duplicates ?? 0);

    const orphanRes = await client.query(`
      SELECT COUNT(*)::int AS orphaned
      FROM atlas_tree_nodes t
      WHERE t.parent_id IS NOT NULL
        AND t.parent_id NOT IN (SELECT node_id FROM atlas_tree_nodes)
    `);
    stats.orphanChildNodes = Number(orphanRes.rows[0]?.orphaned ?? 0);

    const sourceCoverageRes = await client.query(
      `SELECT COUNT(*)::int AS total, COUNT(source_ref)::int AS with_source_ref, COUNT(packet_key)::int AS with_packet_key FROM atlas_tree_nodes`
    );
    stats.sourceRefCoverage = Number(sourceCoverageRes.rows[0]?.with_source_ref ?? 0);
    stats.packetKeyCoverage = Number(sourceCoverageRes.rows[0]?.with_packet_key ?? 0);

    const report = {
      timestamp: new Date().toISOString(),
      mode: dryRun ? 'dry-run' : refresh ? 'apply+refresh' : 'apply',
      packetLedger: packetLedger.tableName,
      packetLedgerHasTreeNodeId: packetLedger.hasTreeNodeId,
      stats,
      pageIndexPaths: pageIndexPaths.slice(0, 25),
    };

    const reportPath = path.join(__dirname, '../../docs/reports/tree-nodes-backfill.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(
      path.join(__dirname, '../../docs/reports/tree-nodes-backfill.md'),
      [
        '# Tree Nodes Backfill',
        '',
        `- packet ledger: ${report.packetLedger}`,
        `- packet ledger tree_node_id: ${report.packetLedgerHasTreeNodeId ? 'yes' : 'no'}`,
        `- files processed: ${stats.filesProcessed}`,
        `- documents created: ${stats.documentsCreated}`,
        `- documents reused: ${stats.documentsReused}`,
        `- chunks created: ${stats.chunksCreated}`,
        `- chunks reused: ${stats.chunksReused}`,
        `- packet links updated: ${stats.packetLinksUpdated}`,
        `- duplicate page_index_path groups: ${stats.duplicatePageIndexPaths}`,
        `- orphan child nodes: ${stats.orphanChildNodes}`,
        `- source_ref coverage rows: ${stats.sourceRefCoverage}`,
        `- packet_key coverage rows: ${stats.packetKeyCoverage}`,
        '',
      ].join('\n'),
      'utf8'
    );

    console.log(`[phase-d] ✅ files: ${stats.filesProcessed}`);
    console.log(`[phase-d] ✅ docs reused: ${stats.documentsReused}, chunks reused: ${stats.chunksReused}`);
    console.log(`[phase-d] ✅ packet links updated: ${stats.packetLinksUpdated}`);
    console.log(`[phase-d] ✅ duplicate page_index_path groups: ${stats.duplicatePageIndexPaths}`);
    console.log(`[phase-d] ✅ orphan child nodes: ${stats.orphanChildNodes}`);
    console.log(`[phase-d] ✅ source_ref coverage rows: ${stats.sourceRefCoverage}`);
    console.log(`[phase-d] ✅ packet_key coverage rows: ${stats.packetKeyCoverage}`);
    console.log(`[phase-d] ✅ wrote ${path.relative(path.join(__dirname, '../..'), reportPath)}`);
  } catch (err) {
    console.error('[error]', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
