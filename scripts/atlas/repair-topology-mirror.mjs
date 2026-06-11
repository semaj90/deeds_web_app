#!/usr/bin/env node
/**
 * scripts/atlas/repair-topology-mirror.mjs
 *
 * Active lane: active-production-topology-mirror
 *
 * Resolves the gap where active production rows in atlas_feature_map have
 * Qdrant points (in codebase_chunks_768) but no som_cluster mirrored back
 * to Postgres.
 *
 * Flags:
 *   --apply                    : required for writes (writes Strategy A only)
 *   --allow-sibling-fallback   : allow directory sibling inference (writes A + C, confidence 0.55)
 *
 * Strategies:
 *   A. Direct Mirror           : direct payload som_cluster (confidence 1.0) or derived from som_row/som_col (confidence 0.8)
 *   C. Sibling Fallback        : Postgres directory sibling cluster (confidence 0.55)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NORMALIZED_COVERAGE_CTE } from './report-production-qdrant-no-som.lib.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const APPLY = process.argv.includes('--apply');
const ALLOW_SIBLING = process.argv.includes('--allow-sibling-fallback');

const COLLECTION = 'codebase_chunks_768'; // Hard default

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

// ── Qdrant Fetchers ──────────────────────────────────────────────────────────
async function qdrantGetPoint(pointId) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/${pointId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result ?? null;
  } catch {
    return null;
  }
}

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
  console.log('\n══ Topology Mirror Repair ═════════════════════════════════');
  console.log(`  Mode:                 ${APPLY ? 'APPLY (WRITING)' : 'DRY-RUN (READ-ONLY)'}`);
  console.log(`  Allow Sibling:        ${ALLOW_SIBLING}`);
  console.log(`  Collection:           ${COLLECTION}`);
  console.log(`  Qdrant URL:           ${QDRANT_URL}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // ── BEFORE counts ─────────────────────────────────────────────────────────
  const beforeRes = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT
      COUNT(*)::int AS active_total,
      COUNT(*) FILTER (WHERE som_cluster IS NOT NULL)::int AS active_has_som,
      COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL)::int AS active_has_qdrant,
      COUNT(*) FILTER (WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL)::int AS active_qdrant_no_som,
      ROUND(100.0 * COUNT(*) FILTER (WHERE som_cluster IS NOT NULL) / NULLIF(COUNT(*), 0), 1)::numeric(5,1) AS active_som_pct
    FROM active
  `);
  const before = beforeRes.rows[0];
  console.log('\n  BEFORE:');
  console.log(`    active total:          ${before.active_total}`);
  console.log(`    active has SOM:        ${before.active_has_som}`);
  console.log(`    active has Qdrant:     ${before.active_has_qdrant}`);
  console.log(`    active Qdrant no SOM:  ${before.active_qdrant_no_som}`);
  console.log(`    active SOM coverage:   ${before.active_som_pct}%`);

  // ── Find the gap rows ─────────────────────────────────────────────────────
  const gapRes = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT source_ref, feature_id, qdrant_point_id, clean_ref
    FROM active
    WHERE qdrant_point_id IS NOT NULL
      AND som_cluster IS NULL
    ORDER BY source_ref
  `);
  const gapRows = gapRes.rows;
  console.log(`\n  Gap rows to repair: ${gapRows.length}`);

  if (gapRows.length === 0) {
    console.log('  ✅ No gap rows — topology mirror is clean.');
    await pool.end();
    return;
  }

  // ── Process candidates ─────────────────────────────────────────────────────
  const repairs = [];
  let directMirrorsCount = 0;
  let siblingFallbackCandidatesCount = 0;
  let writtenCount = 0;
  let unresolvedCount = 0;

  for (const row of gapRows) {
    const pointId = Number(row.qdrant_point_id);
    console.log(`\n  [${row.source_ref}] (qdrant_point_id: ${pointId})`);

    // ──────────────── Strategy A: Direct Qdrant Payload ────────────────
    let directCluster = null;
    let directConfidence = 0.0;
    let directSource = null;

    const point = await qdrantGetPoint(pointId);
    if (point?.payload) {
      const p = point.payload;
      const directCand = p.som_cluster ?? p.gpuCluster ?? p.cluster_id ?? null;
      if (directCand != null) {
        directCluster = String(directCand);
        directConfidence = 1.0;
        directSource = 'qdrant_direct';
        console.log(`    Strategy A: Found direct som_cluster=${directCluster}`);
      } else {
        const rowVal = p.som_row ?? p.som_bmu_row ?? p.somRow ?? null;
        const colVal = p.som_col ?? p.som_bmu_col ?? p.somCol ?? null;
        if (rowVal !== null && colVal !== null) {
          directCluster = `${rowVal}:${colVal}`;
          directConfidence = 0.8;
          directSource = 'qdrant_derived';
          console.log(`    Strategy A: Derived som_cluster=${directCluster} from som_row/som_col (${rowVal}:${colVal})`);
        }
      }
    }

    // ──────────────── Strategy C: Directory Sibling ────────────────
    let siblingCluster = null;
    let siblingSource = null;
    let matchedSiblingRef = null;

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
      console.log(`    Strategy C (Candidate): Dir sibling (${matchedSiblingRef}) has som_cluster=${siblingCluster}`);
    } else {
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
        console.log(`    Strategy C (Candidate): Parent dir (${matchedSiblingRef}) has som_cluster=${siblingCluster}`);
      } else {
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
            console.log(`    Strategy C (Candidate): Grandparent dir (${matchedSiblingRef}) has som_cluster=${siblingCluster}`);
          }
        }
      }
    }

    // ── Update Candidate Counts ──────────────────────────────────────────────
    if (directCluster) {
      directMirrorsCount++;
    } else if (siblingCluster) {
      siblingFallbackCandidatesCount++;
    }

    // ── Resolution Logic based on Flags ──────────────────────────────────────
    let resolvedCluster = null;
    let resolvedConfidence = 0.0;
    let resolvedSource = 'unresolved';
    let resolvedSiblingRef = null;

    if (directCluster) {
      resolvedCluster = directCluster;
      resolvedConfidence = directConfidence;
      resolvedSource = directSource;
      console.log(`    => Resolved via Strategy A (Direct Mirror)`);
    } else if (ALLOW_SIBLING && siblingCluster) {
      resolvedCluster = siblingCluster;
      resolvedConfidence = 0.55; // Required confidence value
      resolvedSource = siblingSource;
      resolvedSiblingRef = matchedSiblingRef;
      console.log(`    => Resolved via Strategy C (Sibling Fallback)`);
    } else {
      console.log(`    => Unresolved under current configuration flags`);
    }

    if (resolvedCluster) {
      repairs.push({
        source_ref: row.source_ref,
        clean_ref: row.clean_ref,
        qdrant_point_id: row.qdrant_point_id,
        assigned_cluster: resolvedCluster,
        confidence: resolvedConfidence,
        source: resolvedSource,
        resolved_sibling_source_ref: resolvedSiblingRef,
      });
    } else {
      unresolvedCount++;
    }
  }

  // ── Apply database and Qdrant updates if requested ──────────────────────────
  if (APPLY && repairs.length > 0) {
    console.log('\n  Applying changes to Postgres and Qdrant...');
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

        // 2. Update Qdrant payload if Strategy C was used
        if (r.source.startsWith('pg_')) {
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
            console.log(`    ✅ Updated Qdrant point ${r.qdrant_point_id} with provenance payload.`);
          } else {
            console.log(`    ❌ Failed to update Qdrant payload for point ${r.qdrant_point_id}`);
          }
        }
      }
    }
  } else if (!APPLY) {
    console.log('\n  [DRY-RUN] No database or Qdrant writes were performed.');
  }

  // ── AFTER counts ──────────────────────────────────────────────────────────
  const afterRes = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT
      COUNT(*)::int AS active_total,
      COUNT(*) FILTER (WHERE som_cluster IS NOT NULL)::int AS active_has_som,
      COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL)::int AS active_has_qdrant,
      COUNT(*) FILTER (WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL)::int AS active_qdrant_no_som,
      ROUND(100.0 * COUNT(*) FILTER (WHERE som_cluster IS NOT NULL) / NULLIF(COUNT(*), 0), 1)::numeric(5,1) AS active_som_pct
    FROM active
  `);
  const after = afterRes.rows[0];
  console.log('\n  AFTER:');
  console.log(`    active total:          ${after.active_total}`);
  console.log(`    active has SOM:        ${after.active_has_som}`);
  console.log(`    active has Qdrant:     ${after.active_has_qdrant}`);
  console.log(`    active Qdrant no SOM:  ${after.active_qdrant_no_som}`);
  console.log(`    active SOM coverage:   ${after.active_som_pct}%`);

  // ── Generate Reports ───────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY-RUN',
    collection: COLLECTION,
    flags: {
      apply: APPLY,
      allowSiblingFallback: ALLOW_SIBLING,
    },
    before: {
      active_total: before.active_total,
      active_has_som: before.active_has_som,
      active_has_qdrant: before.active_has_qdrant,
      active_qdrant_no_som: before.active_qdrant_no_som,
      active_som_pct: Number(before.active_som_pct),
    },
    after: {
      active_total: after.active_total,
      active_has_som: after.active_has_som,
      active_has_qdrant: after.active_has_qdrant,
      active_qdrant_no_som: after.active_qdrant_no_som,
      active_som_pct: Number(after.active_som_pct),
    },
    directMirrors: directMirrorsCount,
    siblingFallbackCandidates: siblingFallbackCandidatesCount,
    written: writtenCount,
    unresolved: unresolvedCount,
    repairs,
  };

  const reportsDir = path.join(ROOT, 'docs', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const reportJsonPath = path.join(reportsDir, 'active-topology-mirror-backfill-report.json');
  const reportMdPath = path.join(reportsDir, 'active-topology-mirror-backfill-report.md');

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');

  let mdContent = `# Active Topology Mirror Backfill Report (Inference Mode)\n\n`;
  mdContent += `- **Timestamp**: ${report.timestamp}\n`;
  mdContent += `- **Mode**: ${report.mode}\n`;
  mdContent += `- **Collection**: ${report.collection}\n`;
  mdContent += `- **Flags**:\n`;
  mdContent += `  - \`--apply\`: ${APPLY}\n`;
  mdContent += `  - \`--allow-sibling-fallback\`: ${ALLOW_SIBLING}\n\n`;

  mdContent += `## Metrics\n\n`;
  mdContent += `| Metric | Count |\n`;
  mdContent += `| :--- | :--- |\n`;
  mdContent += `| **Direct Mirrors (A)** | ${report.directMirrors} |\n`;
  mdContent += `| **Sibling Fallback Candidates (C)** | ${report.siblingFallbackCandidates} |\n`;
  mdContent += `| **Written** | ${report.written} |\n`;
  mdContent += `| **Unresolved** | ${report.unresolved} |\n\n`;

  mdContent += `## Database Coverage Summary\n\n`;
  mdContent += `| State | Active Total | Has SOM | Has Qdrant | Qdrant No SOM | SOM Coverage Pct |\n`;
  mdContent += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  mdContent += `| **Before** | ${before.active_total} | ${before.active_has_som} | ${before.active_has_qdrant} | ${before.active_qdrant_no_som} | ${before.active_som_pct}% |\n`;
  mdContent += `| **After** | ${after.active_total} | ${after.active_has_som} | ${after.active_has_qdrant} | ${after.active_qdrant_no_som} | ${after.active_som_pct}% |\n\n`;

  mdContent += `## Detailed Resolve Records\n\n`;
  mdContent += `| Source Ref | Point ID | Assigned Cluster | Confidence | Source | Sibling Source Ref |\n`;
  mdContent += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of repairs) {
    mdContent += `| \`${r.source_ref}\` | ${r.qdrant_point_id} | \`${r.assigned_cluster}\` | ${r.confidence.toFixed(2)} | ${r.source} | \`${r.resolved_sibling_source_ref ?? ''}\` |\n`;
  }
  if (repairs.length === 0) {
    mdContent += `| *No repairs applied* | | | | | |\n`;
  }

  fs.writeFileSync(reportMdPath, mdContent, 'utf8');

  // Backwards compatibility output to old filename:
  const oldJsonPath = path.join(reportsDir, 'topology-mirror-repair-report.json');
  fs.writeFileSync(oldJsonPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n  Report JSON written to: ${reportJsonPath}`);
  console.log(`  Report MD written to:   ${reportMdPath}`);

  await pool.end();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
