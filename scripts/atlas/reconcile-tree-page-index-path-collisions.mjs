#!/usr/bin/env node

/**
 * Reconcile canonical atlas_tree_nodes page_index_path collisions.
 *
 * Purpose:
 * - Detect duplicate canonical page_index_path groups.
 * - Rebuild the affected tree subtrees with deterministic hash-stabilized paths.
 * - Default to dry-run. Use --apply to write updates.
 *
 * Safety:
 * - Never deletes rows.
 * - Only touches atlas_tree_nodes.
 * - Rewrites paths by subtree, preserving root_id / parent_id relationships.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const args = {
  apply: process.argv.includes('--apply'),
  limit: (() => {
    const argv = process.argv.slice(2);
    const eq = argv.find((a) => a.startsWith('--limit='));
    if (eq) return parseInt(eq.split('=')[1] || '999999', 10);
    const pos = argv.findIndex((a) => a === '--limit');
    return parseInt((pos >= 0 ? argv[pos + 1] : '999999') || '999999', 10);
  })(),
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[page-index-reconcile] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

function safeSlug(str) {
  return String(str ?? '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function canonicalPathSlug(str) {
  const raw = String(str ?? '');
  const base = safeSlug(raw) || 'root';
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 10);
  return `${base}-${hash}`;
}

function canonicalDocumentPath(sourceRef) {
  return `doc:${canonicalPathSlug(sourceRef)}`;
}

async function getDuplicateGroups(client) {
  const res = await client.query(`
    SELECT
      page_index_path,
      COUNT(*)::int AS row_count,
      COUNT(DISTINCT root_id)::int AS root_count,
      ARRAY_AGG(node_id ORDER BY created_at ASC NULLS LAST, node_id) AS node_ids,
      ARRAY_AGG(root_id ORDER BY created_at ASC NULLS LAST, node_id) AS root_ids,
      ARRAY_AGG(node_type ORDER BY created_at ASC NULLS LAST, node_id) AS node_types,
      ARRAY_AGG(source_ref ORDER BY created_at ASC NULLS LAST, node_id) AS source_refs,
      ARRAY_AGG(packet_key ORDER BY created_at ASC NULLS LAST, node_id) AS packet_keys
    FROM atlas_tree_nodes
    WHERE ledger_type = 'canonical'
      AND page_index_path IS NOT NULL
    GROUP BY page_index_path
    HAVING COUNT(*) > 1
    ORDER BY row_count DESC, page_index_path ASC
  `);

  return res.rows;
}

async function getSubtreeRows(client, rootId) {
  const res = await client.query(
    `
      SELECT
        node_id,
        root_id,
        parent_id,
        node_type,
        source_ref,
        packet_key,
        page_index_path,
        tree_depth,
        created_at
      FROM atlas_tree_nodes
      WHERE root_id = $1
      ORDER BY tree_depth ASC, created_at ASC NULLS LAST, node_id ASC
    `,
    [rootId]
  );

  return res.rows;
}

async function applyRootReconciliation(client, rootRow) {
  const oldRootPath = rootRow.page_index_path;
  const newRootPath = canonicalDocumentPath(rootRow.source_ref);

  const subtree = await getSubtreeRows(client, rootRow.node_id);
  const updates = [];
  const anomalies = [];

  for (const row of subtree) {
    let nextPath = row.page_index_path;

    if (row.node_id === rootRow.node_id) {
      nextPath = newRootPath;
    } else if (typeof row.page_index_path === 'string' && row.page_index_path.startsWith(oldRootPath)) {
      nextPath = `${newRootPath}${row.page_index_path.slice(oldRootPath.length)}`;
    } else if (row.node_type === 'chunk' && row.packet_key) {
      nextPath = `${newRootPath}/chunk:${canonicalPathSlug(row.packet_key)}`;
    } else {
      anomalies.push({
        nodeId: row.node_id,
        nodeType: row.node_type,
        pageIndexPath: row.page_index_path,
      });
      continue;
    }

    if (nextPath !== row.page_index_path) {
      updates.push({
        nodeId: row.node_id,
        oldPath: row.page_index_path,
        newPath: nextPath,
        nodeType: row.node_type,
      });
    }
  }

  return {
    rootId: rootRow.node_id,
    sourceRef: rootRow.source_ref,
    oldRootPath,
    newRootPath,
    subtreeSize: subtree.length,
    updates,
    anomalies,
  };
}

async function main() {
  const client = await pool.connect();
  try {
    log.info(`Mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);

    const duplicateGroups = await getDuplicateGroups(client);
    const collisionGroups = duplicateGroups.filter((group) => group.page_index_path.startsWith('doc:'));
    log.info(`Duplicate canonical page_index_path groups: ${duplicateGroups.length}`);
    log.info(`Document-root collision groups: ${collisionGroups.length}`);

    if (collisionGroups.length === 0) {
      log.ok('No canonical document page_index_path collisions found.');
      return;
    }

    const rootRowsResult = await client.query(
      `
        SELECT node_id, page_index_path, source_ref, tree_depth, node_type
        FROM atlas_tree_nodes
        WHERE ledger_type = 'canonical'
          AND node_type = 'document'
          AND page_index_path IS NOT NULL
          AND page_index_path = ANY($1::text[])
        ORDER BY page_index_path ASC, created_at ASC NULLS LAST, node_id ASC
      `,
      [collisionGroups.map((group) => group.page_index_path)]
    );

    const rootRows = rootRowsResult.rows;
    log.info(`Affected canonical document roots: ${rootRows.length}`);

    const plan = [];
    for (const rootRow of rootRows) {
      plan.push(await applyRootReconciliation(client, rootRow));
    }

    const totalUpdates = plan.reduce((sum, item) => sum + item.updates.length, 0);
    const totalAnomalies = plan.reduce((sum, item) => sum + item.anomalies.length, 0);

    for (const item of plan.slice(0, 10)) {
      log.info(
        `root ${item.sourceRef} :: ${item.oldRootPath} -> ${item.newRootPath} (${item.updates.length} row updates, ${item.anomalies.length} anomalies)`
      );
      for (const update of item.updates.slice(0, 3)) {
        log.info(`  ${update.nodeType} ${update.oldPath} -> ${update.newPath}`);
      }
      if (item.updates.length > 3) {
        log.info(`  ... ${item.updates.length - 3} more updates`);
      }
      if (item.anomalies.length > 0) {
        log.warn(`  anomalies: ${item.anomalies.length}`);
      }
    }

    if (plan.length > 10) {
      log.info(`... ${plan.length - 10} more root subtrees omitted from log`);
    }

    if (!args.apply) {
      log.warn(`Dry-run only. Would update ${totalUpdates} rows across ${plan.length} roots.`);
      if (totalAnomalies > 0) {
        log.warn(`Would skip ${totalAnomalies} anomalous rows that did not match the old root prefix.`);
      }
      return;
    }

    await client.query('BEGIN');
    try {
      let applied = 0;
      for (const item of plan) {
        for (const update of item.updates) {
          await client.query(
            `
              UPDATE atlas_tree_nodes
              SET page_index_path = $1,
                  updated_at = NOW()
              WHERE node_id = $2
                AND page_index_path <> $1
            `,
            [update.newPath, update.nodeId]
          );
          applied++;
        }
      }

      await client.query('COMMIT');
      log.ok(`Applied ${applied} row updates across ${plan.length} roots.`);
      if (totalAnomalies > 0) {
        log.warn(`Skipped ${totalAnomalies} anomalous rows that did not match the old root prefix.`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
  }
}

main()
  .then(() => {
    pool.end();
  })
  .catch((err) => {
    console.error(`[page-index-reconcile] ERROR: ${err.message}`);
    pool.end();
    process.exitCode = 1;
  });
