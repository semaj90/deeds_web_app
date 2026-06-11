#!/usr/bin/env node
/**
 * scripts/atlas/infer-siblings.mjs
 *
 * Resolves the 5 remaining topology mirror gaps by searching directory trees
 * for nearby siblings that have a som_cluster assigned, updating Postgres and Qdrant
 * with low-confidence (0.55) sibling inference.
 *
 * Usage:
 *   node scripts/atlas/infer-siblings.mjs             # dry-run
 *   node scripts/atlas/infer-siblings.mjs --apply     # apply updates
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NORMALIZED_COVERAGE_CTE } from './report-production-qdrant-no-som.lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const COLLECTION = 'codebase_chunks_768';

// ── Environment ──────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? 'legal_password'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;
const QDRANT_URL = env.QDRANT_URL ?? env.QDRANT_HOST ?? 'http://127.0.0.1:6333';

// ── Qdrant Set Payload ────────────────────────────────────────────────────────
async function qdrantSetPayload(pointId, payload) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [pointId],
        payload,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error(`  ❌ Failed to update Qdrant payload for point ${pointId}:`, err.message);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══ Topology Mirror Sibling Inference ══════════════════════');
  console.log(`  Mode:                 ${APPLY ? 'APPLY (WRITING)' : 'DRY-RUN (READ-ONLY)'}`);
  console.log(`  Qdrant Collection:    ${COLLECTION}`);
  console.log(`  Qdrant URL:           ${QDRANT_URL}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Query BEFORE counts
  const beforeRes = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT
      COUNT(*) FILTER (WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL)::int AS active_qdrant_no_som
    FROM active
  `);
  const beforeMissing = beforeRes.rows[0].active_qdrant_no_som;

  // Query actual gap rows
  const gapRes = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT source_ref, feature_id, qdrant_point_id, clean_ref
    FROM active
    WHERE qdrant_point_id IS NOT NULL
      AND som_cluster IS NULL
    ORDER BY source_ref
  `);
  const gapRows = gapRes.rows;
  console.log(`\n  Active Postgres gap rows to resolve: ${gapRows.length}`);

  let resolvedCount = 0;
  let unresolvedCount = 0;
  let writtenCount = 0;
  const repairs = [];

  for (const row of gapRows) {
    const pointId = Number(row.qdrant_point_id);
    console.log(`\n  [${row.source_ref}] (qdrant_point_id: ${pointId})`);

    let siblingCluster = null;
    let siblingSource = null;
    let matchedSiblingRef = null;

    // 1. Check Directory Sibling
    const dirPath = row.clean_ref.replace(/\/[^/]+$/, '/%');
    const siblingRes = await pool.query(`
      SELECT source_ref, som_cluster FROM atlas_feature_map
      WHERE source_ref LIKE $1
        AND som_cluster IS NOT NULL
      LIMIT 1
    `, [dirPath]);

    if (siblingRes.rows.length > 0) {
      siblingCluster = String(siblingRes.rows[0].som_cluster);
      matchedSiblingRef = siblingRes.rows[0].source_ref;
      siblingSource = `pg_dir_sibling`;
      console.log(`    Strategy C: Match dir sibling (${matchedSiblingRef}) → som_cluster=${siblingCluster}`);
    } else {
      // 2. Check Parent Directory Sibling
      const parentPath = row.clean_ref.replace(/\/[^/]+\/[^/]+$/, '/%');
      const parentRes = await pool.query(`
        SELECT source_ref, som_cluster FROM atlas_feature_map
        WHERE source_ref LIKE $1
          AND som_cluster IS NOT NULL
        LIMIT 1
      `, [parentPath]);
      if (parentRes.rows.length > 0) {
        siblingCluster = String(parentRes.rows[0].som_cluster);
        matchedSiblingRef = parentRes.rows[0].source_ref;
        siblingSource = `pg_parent_sibling`;
        console.log(`    Strategy C: Match parent sibling (${matchedSiblingRef}) → som_cluster=${siblingCluster}`);
      } else {
        // 3. Check Grandparent Directory Sibling
        const grandparentPath = row.clean_ref.replace(/\/[^/]+\/[^/]+\/[^/]+$/, '/%');
        if (grandparentPath !== parentPath && grandparentPath.includes('/')) {
          const gpRes = await pool.query(`
            SELECT source_ref, som_cluster FROM atlas_feature_map
            WHERE source_ref LIKE $1
              AND som_cluster IS NOT NULL
            LIMIT 1
          `, [grandparentPath]);
          if (gpRes.rows.length > 0) {
            siblingCluster = String(gpRes.rows[0].som_cluster);
            matchedSiblingRef = gpRes.rows[0].source_ref;
            siblingSource = `pg_grandparent_sibling`;
            console.log(`    Strategy C: Match grandparent sibling (${matchedSiblingRef}) → som_cluster=${siblingCluster}`);
          }
        }
      }
    }

    if (siblingCluster) {
      resolvedCount++;
      repairs.push({
        source_ref: row.source_ref,
        clean_ref: row.clean_ref,
        qdrant_point_id: row.qdrant_point_id,
        assigned_cluster: siblingCluster,
        confidence: 0.55,
        source: siblingSource,
        resolved_sibling_source_ref: matchedSiblingRef,
      });
    } else {
      unresolvedCount++;
      console.log(`    ❌ No directory siblings found in directory tree.`);
    }
  }

  // Apply updates to database and Qdrant if --apply is passed
  if (APPLY && repairs.length > 0) {
    console.log('\n  Applying sibling updates to Postgres and Qdrant...');
    for (const r of repairs) {
      // 1. Update PostgreSQL
      const dbRes = await pool.query(`
        UPDATE atlas_feature_map
        SET
          som_cluster = $1,
          cluster_id  = COALESCE(cluster_id, $1),
          indexed_at  = now()
        WHERE qdrant_point_id = $2
          AND som_cluster IS NULL
      `, [r.assigned_cluster, r.qdrant_point_id]);

      if (dbRes.rowCount > 0) {
        writtenCount++;
        console.log(`    ✅ Updated Postgres: ${r.source_ref} → som_cluster=${r.assigned_cluster} (via ${r.source})`);

        // 2. Update Qdrant payload
        console.log(`    ⏳ Updating Qdrant point ${r.qdrant_point_id} payload...`);
        const qPayload = {
          som_cluster: r.assigned_cluster,
          topologyMirror: {
            source: 'postgres_directory_sibling',
            confidence: 0.55,
            matchedSourceRef: r.resolved_sibling_source_ref,
            mirroredAt: new Date().toISOString(),
          }
        };
        const qSuccess = await qdrantSetPayload(Number(r.qdrant_point_id), qPayload);
        if (qSuccess) {
          console.log(`    ✅ Updated Qdrant point ${r.qdrant_point_id} with sibling provenance.`);
        } else {
          console.log(`    ❌ Failed to update Qdrant payload for point ${r.qdrant_point_id}`);
        }
      }
    }
  } else if (!APPLY) {
    console.log('\n  [DRY-RUN] No database or Qdrant writes were performed.');
  }

  // Query AFTER counts
  const afterRes = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT
      COUNT(*) FILTER (WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL)::int AS active_qdrant_no_som
    FROM active
  `);
  const afterMissing = afterRes.rows[0].active_qdrant_no_som;

  // ── Report Schema ──────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    dryRun: !APPLY,
    beforeMissing,
    resolvedCount,
    unresolvedCount,
    writtenCount,
    afterMissing,
    repairs,
  };

  const reportsDir = path.join(ROOT, 'docs', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const reportJsonPath = path.join(reportsDir, 'sibling-inference-report.json');
  const reportMdPath = path.join(reportsDir, 'sibling-inference-report.md');

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');

  let mdContent = `# Sibling Inference Report\n\n`;
  mdContent += `- **Timestamp**: ${report.timestamp}\n`;
  mdContent += `- **Mode**: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n\n`;

  mdContent += `## Metrics\n\n`;
  mdContent += `| Metric | Count |\n`;
  mdContent += `| :--- | :--- |\n`;
  mdContent += `| **Before Missing Gaps** | ${report.beforeMissing} |\n`;
  mdContent += `| **Resolved via Sibling Inference** | ${report.resolvedCount} |\n`;
  mdContent += `| **Unresolved** | ${report.unresolvedCount} |\n`;
  mdContent += `| **Written** | ${report.writtenCount} |\n`;
  mdContent += `| **After Missing Gaps** | ${report.afterMissing} |\n\n`;

  mdContent += `## Detailed Sibling Mappings\n\n`;
  mdContent += `| Source Ref | Point ID | Sibling Cluster | Sibling Source Ref | Sibling Level |\n`;
  mdContent += `| :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of repairs) {
    mdContent += `| \`${r.source_ref}\` | ${r.qdrant_point_id} | \`${r.assigned_cluster}\` | \`${r.resolved_sibling_source_ref}\` | ${r.source} |\n`;
  }
  if (repairs.length === 0) {
    mdContent += `| *No sibling mappings resolved* | | | | |\n`;
  }

  fs.writeFileSync(reportMdPath, mdContent, 'utf8');

  console.log(`\n  Report JSON written to: ${reportJsonPath}`);
  console.log(`  Report MD written to:   ${reportMdPath}`);

  await pool.end();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
