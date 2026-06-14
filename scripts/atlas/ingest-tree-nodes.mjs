#!/usr/bin/env node
/**
 * Phase D: Tree Node Ingestion
 *
 * Extracts filesystem hierarchy from src/ directory and creates:
 * - atlas_tree_nodes (deterministic sha256 node IDs, hierarchy preserved)
 * - atlas_tree_edges (CONTAINS relationships)
 *
 * Links tree nodes to atlas_packets via source_ref
 *
 * Hard Rules:
 * - node_id = sha256(source_ref:node_type)
 * - source_ref = relative path from SVELTEKIT_ROOT
 * - parent_id set for hierarchy (null for root)
 * - No orphaned nodes (all parents must exist)
 */

import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const SVELTEKIT_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function deterministic_node_id(source_ref, node_type) {
  return sha256(`${source_ref}:${node_type}`);
}

/**
 * Walk directory tree and extract hierarchy
 */
async function extractFileSystemHierarchy(baseDir) {
  const nodes = [];
  const edges = [];
  const processed = new Set();

  async function walk(dir, parentId = null, rootId = null) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip node_modules, dist, build artifacts
        if (['.git', 'node_modules', 'dist', 'build', '.next', '.svelte-kit'].includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(SVELTEKIT_ROOT, fullPath).replace(/\\/g, '/');

        // Only process files/dirs under src/
        if (!relativePath.startsWith('src/')) {
          continue;
        }

        const node_type = entry.isDirectory() ? 'directory' : 'file';
        const node_id = deterministic_node_id(relativePath, node_type);

        // Skip duplicates
        if (processed.has(node_id)) {
          continue;
        }
        processed.add(node_id);

        const extension = entry.isFile() ? path.extname(entry.name).slice(1) : null;
        const isCode = entry.isFile() && [
          'ts', 'tsx', 'svelte', 'js', 'jsx', 'mjs', 'cjs',
          'py', 'go', 'rs', 'sql', 'json'
        ].includes(extension);

        const metadata = {
          type: node_type,
          extension: extension || null,
          is_code: isCode || false,
          created_at: new Date().toISOString()
        };

        // Determine the root_id
        const effectiveRootId = rootId || node_id;

        nodes.push({
          node_id,
          parent_id: parentId,
          root_id: effectiveRootId,
          node_type,
          title: entry.name,
          source_ref: relativePath,
          file_path: relativePath,
          page_index_path: `/${relativePath}`,
          packet_key: null, // Will be filled by join with atlas_packets
          feature_id: null,
          feature_label: null,
          metadata
        });

        // Create edge if parent exists
        if (parentId) {
          edges.push({
            source_id: parentId,
            target_id: node_id,
            edge_type: 'CONTAINS',
            weight: 1.0
          });
        }

        // Recurse into directories
        if (entry.isDirectory()) {
          await walk(fullPath, node_id, effectiveRootId);
        }
      }
    } catch (err) {
      if (verbose) console.error(`[walk] Error in ${dir}:`, err.message);
    }
  }

  await walk(SVELTEKIT_ROOT);
  return { nodes, edges };
}

/**
 * Join tree nodes with atlas_packets to get feature_id, feature_label, packet_key
 */
async function enrichTreeNodesWithPackets(pool, nodes) {
  try {
    const res = await pool.query(`
      SELECT source_ref, packet_key, feature_id, feature_label
      FROM atlas_packets
      WHERE source_ref IS NOT NULL
      AND packet_key IS NOT NULL
    `);

    const packetMap = new Map(res.rows.map(row => [row.source_ref, row]));

    return nodes.map(node => {
      const packet = packetMap.get(node.source_ref);
      return {
        ...node,
        packet_key: packet?.packet_key || null,
        feature_id: packet?.feature_id || null,
        feature_label: packet?.feature_label || null
      };
    });
  } catch (err) {
    console.error('[enrichTreeNodesWithPackets]', err.message);
    return nodes; // Return without enrichment on error
  }
}

/**
 * Ingest tree nodes and edges into Postgres
 */
async function ingestTreeNodes(pool, nodes, edges) {
  if (dryRun) {
    console.log(`[dry-run] Would ingest ${nodes.length} tree nodes and ${edges.length} edges`);
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  try {
    // Insert nodes
    for (const node of nodes) {
      try {
        await pool.query(`
          INSERT INTO atlas_tree_nodes (
            node_id, parent_id, root_id, node_type, title, source_ref,
            file_path, page_index_path, packet_key, feature_id, feature_label,
            metadata, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (node_id) DO UPDATE SET
            updated_at = NOW(),
            packet_key = COALESCE($9, packet_key),
            feature_id = COALESCE($10, feature_id),
            feature_label = COALESCE($11, feature_label)
        `, [
          node.node_id,
          node.parent_id,
          node.root_id,
          node.node_type,
          node.title,
          node.source_ref,
          node.file_path,
          node.page_index_path,
          node.packet_key,
          node.feature_id,
          node.feature_label,
          JSON.stringify(node.metadata),
          node.metadata.created_at,
          new Date().toISOString()
        ]);
        success += 1;
      } catch (err) {
        if (verbose) console.error(`[insert-node] ${node.source_ref}:`, err.message);
        failed += 1;
      }
    }

    // Insert edges
    for (const edge of edges) {
      try {
        await pool.query(`
          INSERT INTO atlas_tree_edges (source_id, target_id, edge_type, weight, created_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (source_id, target_id, edge_type) DO NOTHING
        `, [
          edge.source_id,
          edge.target_id,
          edge.edge_type,
          edge.weight,
          new Date().toISOString()
        ]);
      } catch (err) {
        if (verbose) console.error(`[insert-edge] ${edge.source_id} → ${edge.target_id}:`, err.message);
      }
    }

    console.log(`[phase-d] ✅ Ingested ${success}/${nodes.length} tree nodes (${failed} failed)`);
    return { success, failed };
  } catch (err) {
    console.error('[error]', err.message);
    return { success: 0, failed: nodes.length };
  }
}

/**
 * Main
 */
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  console.log('[phase-d] Phase D: Tree Node Ingestion');
  console.log(`[phase-d] Mode: ${dryRun ? 'DRY-RUN' : apply ? 'APPLY' : 'VERIFY'}`);
  console.log(`[phase-d] SVELTEKIT_ROOT: ${SVELTEKIT_ROOT}\n`);

  try {
    // Step 1: Extract filesystem hierarchy
    console.log('[step-1] Extract filesystem hierarchy from src/');
    const { nodes, edges } = await extractFileSystemHierarchy(SVELTEKIT_ROOT);
    console.log(`[phase-d] Extracted ${nodes.length} nodes, ${edges.length} edges\n`);

    // Step 2: Enrich with packet data
    console.log('[step-2] Enrich tree nodes with atlas_packets linkage');
    const enrichedNodes = await enrichTreeNodesWithPackets(pool, nodes);
    const linkedCount = enrichedNodes.filter(n => n.packet_key).length;
    console.log(`[phase-d] Linked ${linkedCount}/${enrichedNodes.length} nodes to atlas_packets\n`);

    // Step 3: Ingest
    if (apply) {
      console.log('[step-3] Ingest tree nodes and edges');
      const result = await ingestTreeNodes(pool, enrichedNodes, edges);

      console.log('\n[summary] ✅ Phase D tree node ingestion complete');
      console.log(`[summary] Ingested: ${result.success}/${enrichedNodes.length}`);
      console.log('[summary] Next: npm run atlas:tree:audit');
    } else {
      console.log('[step-3] Skip ingestion (use --apply to persist)');
      console.log(`[summary] Preview: Would ingest ${enrichedNodes.length} nodes, ${edges.length} edges`);
    }
  } catch (err) {
    console.error('[error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
