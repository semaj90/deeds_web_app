#!/usr/bin/env node
/**
 * Phase D — Tree Node Ingestion
 *
 * Extracts page index tree structure from codebase:
 * - atlas_tree_nodes (files, folders, packages)
 * - atlas_tree_edges (parent→child relationships)
 * - Links tree nodes to atlas_packets canonical ledger
 *
 * Hard rules:
 * - JSONB for searchable metadata
 * - Preserve tree structure; chunks are leaves
 * - Link to packet_key/source_ref via atlas_packets
 * - Node IDs stable across runs (deterministic hash)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SVELTEKIT_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '1000');

/**
 * Generate stable node ID from source_ref and path
 */
function generateNodeId(sourceRef, nodeType) {
  const hash = createHash('sha256')
    .update(`${sourceRef}:${nodeType}`)
    .digest('hex')
    .slice(0, 16);
  return `node:${hash}`;
}

/**
 * Extract tree nodes from filesystem
 */
async function extractTreeNodes() {
  const nodes = [];
  const edges = [];
  const nodeMap = new Map(); // sourceRef → node

  try {
    // Walk directory tree starting from src/
    async function walkDir(dirPath, parentId, rootId) {
      let fileCount = 0;

      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (fileCount >= limit) break;
          if (entry.name.startsWith('.')) continue;

          const fullPath = path.join(dirPath, entry.name);
          const relPath = path.relative(SVELTEKIT_ROOT, fullPath).replace(/\\/g, '/');
          const sourceRef = relPath;

          if (entry.isDirectory()) {
            // Directory node
            const nodeId = generateNodeId(sourceRef, 'directory');
            const dirName = entry.name;

            nodes.push({
              node_id: nodeId,
              parent_id: parentId,
              root_id: rootId || nodeId,
              node_type: 'directory',
              title: dirName,
              source_ref: sourceRef,
              file_path: sourceRef,
              page_index_path: `/${sourceRef}`,
              metadata: {
                type: 'directory',
                entries: 0,
              },
            });

            nodeMap.set(sourceRef, { nodeId, node_type: 'directory' });

            // Create edge
            if (parentId) {
              edges.push({
                source_id: parentId,
                target_id: nodeId,
                edge_type: 'CONTAINS',
                weight: 1.0,
              });
            }

            // Recurse
            await walkDir(fullPath, nodeId, rootId || nodeId);
          } else if (entry.isFile()) {
            // File node
            const ext = path.extname(entry.name);
            const nodeId = generateNodeId(sourceRef, 'file');

            nodes.push({
              node_id: nodeId,
              parent_id: parentId,
              root_id: rootId,
              node_type: 'file',
              title: entry.name,
              source_ref: sourceRef,
              file_path: sourceRef,
              page_index_path: `/${sourceRef}`,
              metadata: {
                type: 'file',
                extension: ext,
                is_code: ['.ts', '.tsx', '.js', '.svelte', '.sql'].includes(ext),
              },
            });

            nodeMap.set(sourceRef, { nodeId, node_type: 'file' });

            // Create edge
            if (parentId) {
              edges.push({
                source_id: parentId,
                target_id: nodeId,
                edge_type: 'CONTAINS',
                weight: 1.0,
              });
            }

            fileCount += 1;
          }
        }
      } catch (err) {
        if (verbose) console.error(`[tree] Walk failed at ${dirPath}:`, err.message);
      }
    }

    // Start walk from src/
    const srcPath = path.join(SVELTEKIT_ROOT, 'src');
    await walkDir(srcPath, null, null);

    console.log(`[tree] Extracted ${nodes.length} nodes and ${edges.length} edges`);
    return { nodes, edges, nodeMap };
  } catch (err) {
    console.error('[tree] Extraction failed:', err.message);
    return { nodes: [], edges: [], nodeMap: new Map() };
  }
}

/**
 * Create tree node schema in Postgres
 */
async function initSchema(pool) {
  if (dryRun) {
    console.log('[schema] DRY-RUN: would create tables');
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS atlas_tree_nodes (
        node_id VARCHAR PRIMARY KEY,
        parent_id VARCHAR,
        root_id VARCHAR,
        node_type VARCHAR NOT NULL,
        title VARCHAR,
        text TEXT,
        summary TEXT,
        source_ref VARCHAR UNIQUE,
        file_path VARCHAR,
        file_url VARCHAR,
        page_index_path VARCHAR,
        packet_key VARCHAR,
        feature_id VARCHAR,
        feature_label VARCHAR,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_tree_nodes_parent ON atlas_tree_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_root ON atlas_tree_nodes(root_id);
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_feature ON atlas_tree_nodes(feature_id);
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_source_ref ON atlas_tree_nodes(source_ref);
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_packet_key ON atlas_tree_nodes(packet_key);
      CREATE INDEX IF NOT EXISTS idx_tree_nodes_metadata ON atlas_tree_nodes USING GIN (metadata);

      CREATE TABLE IF NOT EXISTS atlas_tree_edges (
        source_id VARCHAR NOT NULL,
        target_id VARCHAR NOT NULL,
        edge_type VARCHAR NOT NULL,
        weight FLOAT8,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (source_id, target_id, edge_type),
        FOREIGN KEY (source_id) REFERENCES atlas_tree_nodes(node_id),
        FOREIGN KEY (target_id) REFERENCES atlas_tree_nodes(node_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tree_edges_source ON atlas_tree_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_tree_edges_target ON atlas_tree_edges(target_id);
    `);

    console.log('[schema] ✅ Created atlas_tree_nodes and atlas_tree_edges tables');
  } catch (err) {
    console.error('[schema] Creation failed:', err.message);
    throw err;
  }
}

/**
 * Link tree nodes to atlas_packets
 */
async function linkTreeNodesToPackets(pool, nodes) {
  let linked = 0;
  let failed = 0;

  for (const node of nodes) {
    if (!node.source_ref) continue;

    try {
      // Find matching packet
      const res = await pool.query(
        `SELECT packet_key, feature_id, feature_label FROM atlas_packets
         WHERE source_ref = $1 LIMIT 1`,
        [node.source_ref]
      );

      if (res.rows.length > 0) {
        const packet = res.rows[0];
        node.packet_key = packet.packet_key;
        node.feature_id = packet.feature_id;
        node.feature_label = packet.feature_label;
        linked += 1;
      }
    } catch (err) {
      if (verbose) console.error(`[link] Failed for ${node.source_ref}:`, err.message);
      failed += 1;
    }
  }

  console.log(`[link] Linked ${linked}/${nodes.length} tree nodes to packets (${failed} failed)`);
  return linked;
}

/**
 * Ingest tree nodes into Postgres
 */
async function ingestTreeNodes(pool, nodes) {
  if (dryRun) {
    console.log(`[ingest] DRY-RUN: would insert ${nodes.length} tree nodes`);
    return { inserted: 0, failed: 0 };
  }

  let inserted = 0;
  let failed = 0;

  for (const node of nodes) {
    try {
      await pool.query(
        `INSERT INTO atlas_tree_nodes
         (node_id, parent_id, root_id, node_type, title, source_ref, file_path,
          page_index_path, packet_key, feature_id, feature_label, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (node_id) DO UPDATE SET
          parent_id = EXCLUDED.parent_id,
          packet_key = EXCLUDED.packet_key,
          feature_id = EXCLUDED.feature_id,
          updated_at = NOW()`,
        [
          node.node_id,
          node.parent_id,
          node.root_id,
          node.node_type,
          node.title,
          node.source_ref,
          node.file_path,
          node.page_index_path,
          node.packet_key || null,
          node.feature_id || null,
          node.feature_label || null,
          JSON.stringify(node.metadata || {}),
        ]
      );

      inserted += 1;
    } catch (err) {
      if (verbose) console.error(`[ingest] Failed to insert ${node.node_id}:`, err.message);
      failed += 1;
    }
  }

  console.log(`[ingest] ✅ Inserted ${inserted}/${nodes.length} tree nodes (${failed} failed)`);
  return { inserted, failed };
}

/**
 * Ingest tree edges into Postgres
 */
async function ingestTreeEdges(pool, edges) {
  if (dryRun) {
    console.log(`[edges] DRY-RUN: would insert ${edges.length} tree edges`);
    return { inserted: 0, failed: 0 };
  }

  let inserted = 0;
  let failed = 0;

  for (const edge of edges) {
    try {
      await pool.query(
        `INSERT INTO atlas_tree_edges (source_id, target_id, edge_type, weight)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_id, target_id, edge_type) DO NOTHING`,
        [edge.source_id, edge.target_id, edge.edge_type, edge.weight]
      );

      inserted += 1;
    } catch (err) {
      // Silently skip if nodes don't exist yet
      if (!err.message.includes('FOREIGN KEY')) {
        if (verbose) console.error(`[edges] Failed to insert edge:`, err.message);
      }
      failed += 1;
    }
  }

  console.log(`[edges] ✅ Inserted ${inserted}/${edges.length} tree edges (${failed} skipped)`);
  return { inserted, failed };
}

/**
 * Audit tree node integrity
 */
async function auditTreeNodes(pool) {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_nodes,
        COUNT(DISTINCT root_id) as root_count,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as linked_to_packets,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as with_feature_id,
        MAX(
          (WITH RECURSIVE path AS (
            SELECT node_id, parent_id, 1 as depth
            FROM atlas_tree_nodes
            WHERE parent_id IS NULL
            UNION ALL
            SELECT tn.node_id, tn.parent_id, p.depth + 1
            FROM atlas_tree_nodes tn
            JOIN path p ON tn.parent_id = p.node_id
          )
          SELECT MAX(depth) FROM path)
        ) as max_depth
      FROM atlas_tree_nodes;
    `);

    const stats = result.rows[0] || {};
    return {
      total_nodes: stats.total_nodes || 0,
      root_count: stats.root_count || 0,
      linked_to_packets: stats.linked_to_packets || 0,
      with_feature_id: stats.with_feature_id || 0,
      max_depth: stats.max_depth || 0,
    };
  } catch (err) {
    console.error('[audit] Failed:', err.message);
    return {};
  }
}

/**
 * Main pipeline
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const startTime = Date.now();

  console.log('[tree-ingest] Phase D: Tree Node Ingestion');
  console.log(`[tree-ingest] Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'VERIFY'}`);

  try {
    // Initialize schema
    console.log('\n[step-1] Initialize schema');
    await initSchema(pool);

    // Extract nodes
    console.log('\n[step-2] Extract tree nodes from filesystem');
    const { nodes, edges } = await extractTreeNodes();

    // Link to packets
    console.log('\n[step-3] Link tree nodes to atlas_packets');
    await linkTreeNodesToPackets(pool, nodes);

    // Ingest
    if (apply) {
      console.log('\n[step-4] Ingest tree nodes');
      await ingestTreeNodes(pool, nodes);

      console.log('\n[step-5] Ingest tree edges');
      await ingestTreeEdges(pool, edges);

      // Audit
      console.log('\n[step-6] Audit tree integrity');
      const stats = await auditTreeNodes(pool);
      console.log(`[audit] Total nodes: ${stats.total_nodes}`);
      console.log(`[audit] Roots: ${stats.root_count}`);
      console.log(`[audit] Linked to packets: ${stats.linked_to_packets}`);
      console.log(`[audit] With feature_id: ${stats.with_feature_id}`);
      console.log(`[audit] Max depth: ${stats.max_depth}`);

      console.log('\n[summary] ✅ Tree node ingestion complete');
      console.log('[summary] Next: npm run atlas:tree:audit');
    } else {
      console.log('\n[step-4] Skip ingestion (use --apply to persist)');
    }

    const elapsed = Date.now() - startTime;
    console.log(`\n[timing] Completed in ${(elapsed / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
