#!/usr/bin/env node
/**
 * scripts/atlas/backfill-active-topology-mirror-from-qdrant.mjs
 *
 * Active lane: active-production-topology-mirror
 *
 * Mirrors som_cluster topology from Qdrant codebase_chunks_768 payload
 * back into Postgres active rows (where qdrant_point_id IS NOT NULL AND som_cluster IS NULL).
 *
 * Behavior:
 *   - dry-run by default
 *   - --apply required for writes
 *   - collection defaults to codebase_chunks_768
 *   - .env may provide service URLs/passwords only (does not inherit QDRANT_COLLECTION)
 *   - do not use QDRANT_COLLECTION unless explicit --collection is passed
 *   - query active Postgres rows where qdrant_point_id is not null and som_cluster is null
 *   - fetch matching Qdrant payloads
 *   - mirror direct payload som_cluster with confidence 1.0
 *   - derive from som_row/som_col only if present, confidence 0.8
 *   - leave unresolved otherwise
 *   - no sibling fallback
 *   - no ANN fallback
 *   - do not mutate glyph_records
 *   - do not re-run ingestion
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { NORMALIZED_COVERAGE_CTE } from './report-production-qdrant-no-som.lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

// ── Flag Parsing ─────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');

// Resolve collection
let collectionUsed = 'codebase_chunks_768';
let collectionUsedProof = 'Collection is codebase_chunks_768 (defaulted) since no explicit --collection flag was parsed from process.argv';

const collectionArgIndex = process.argv.indexOf('--collection');
if (collectionArgIndex !== -1 && process.argv[collectionArgIndex + 1]) {
  collectionUsed = process.argv[collectionArgIndex + 1];
  collectionUsedProof = `Collection is ${collectionUsed} (explicitly specified via --collection flag)`;
} else {
  const collectionArgVal = process.argv.find(arg => arg.startsWith('--collection='));
  if (collectionArgVal) {
    collectionUsed = collectionArgVal.split('=')[1];
    collectionUsedProof = `Collection is ${collectionUsed} (explicitly specified via --collection= flag)`;
  }
}

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

// ── Qdrant Fetch ─────────────────────────────────────────────────────────────
async function qdrantGetPoint(pointId) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${collectionUsed}/points/${pointId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.result ?? null;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══ Active Topology Mirror Backfill from Qdrant ════════════');
  console.log(`  Mode:                 ${APPLY ? 'APPLY (WRITING)' : 'DRY-RUN (READ-ONLY)'}`);
  console.log(`  Collection Used:      ${collectionUsed}`);
  console.log(`  Collection Proof:     ${collectionUsedProof}`);
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
  console.log(`\n  Active Postgres gap rows: ${gapRows.length}`);

  let directMirrors = 0;
  let derivedFromSomCoords = 0;
  let unresolved = 0;
  let written = 0;
  const repairs = [];

  for (const row of gapRows) {
    const pointId = Number(row.qdrant_point_id);
    console.log(`\n  [${row.source_ref}] (qdrant_point_id: ${pointId})`);

    const point = await qdrantGetPoint(pointId);
    let resolvedCluster = null;
    let confidence = 0.0;
    let source = 'unresolved';

    if (point?.payload) {
      const p = point.payload;
      const directCand = p.som_cluster ?? p.gpuCluster ?? p.cluster_id ?? null;
      if (directCand !== null && directCand !== undefined) {
        directCluster = String(directCand);
        resolvedCluster = directCluster;
        confidence = 1.0;
        source = 'qdrant_direct';
        directMirrors++;
        console.log(`    ✅ Strategy A: Found direct som_cluster=${resolvedCluster}`);
      } else {
        const rowVal = p.som_row ?? p.som_bmu_row ?? p.somRow ?? null;
        const colVal = p.som_col ?? p.som_bmu_col ?? p.somCol ?? null;
        if (rowVal !== null && colVal !== null) {
          derivedCluster = `${rowVal}:${colVal}`;
          resolvedCluster = derivedCluster;
          confidence = 0.8;
          source = 'qdrant_derived';
          derivedFromSomCoords++;
          console.log(`    ✅ Strategy A (Derivation): Derived som_cluster=${resolvedCluster} from som_row/som_col (${rowVal}:${colVal})`);
        }
      }
    }

    if (resolvedCluster) {
      repairs.push({
        source_ref: row.source_ref,
        clean_ref: row.clean_ref,
        qdrant_point_id: row.qdrant_point_id,
        assigned_cluster: resolvedCluster,
        confidence,
        source,
      });
    } else {
      unresolved++;
      console.log(`    ❌ No direct som_cluster or som_row/som_col coords in payload.`);
    }
  }

  // Apply updates to database if --apply is passed
  if (APPLY && repairs.length > 0) {
    console.log('\n  Applying changes to Postgres...');
    for (const r of repairs) {
      const res = await pool.query(`
        UPDATE atlas_feature_map
        SET
          som_cluster = $1,
          cluster_id  = COALESCE(cluster_id, $1),
          indexed_at  = now()
        WHERE qdrant_point_id = $2
          AND som_cluster IS NULL
      `, [r.assigned_cluster, r.qdrant_point_id]);
      if (res.rowCount > 0) {
        written++;
        console.log(`    ✅ Updated ${r.source_ref} → som_cluster=${r.assigned_cluster} (via ${r.source})`);
      }
    }
  } else if (!APPLY) {
    console.log('\n  [DRY-RUN] No database writes performed.');
  }

  // Query AFTER counts
  const afterRes = await pool.query(`
    ${NORMALIZED_COVERAGE_CTE}
    SELECT
      COUNT(*) FILTER (WHERE som_cluster IS NULL AND qdrant_point_id IS NOT NULL)::int AS active_qdrant_no_som
    FROM active
  `);
  const afterMissing = afterRes.rows[0].active_qdrant_no_som;

  const wouldWrite = repairs.length;
  const usedQdrantCollectionEnv = false; // Ignored env variables for collection name

  // ── Report Schema ──────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    dryRun: !APPLY,
    collectionUsed,
    collectionUsedProof,
    usedQdrantCollectionEnv,
    beforeMissing,
    directMirrors,
    derivedFromSomCoords,
    unresolved,
    wouldWrite,
    written,
    afterMissing,
    repairs,
  };

  const reportsDir = path.join(ROOT, 'docs', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const reportJsonPath = path.join(reportsDir, 'active-topology-mirror-backfill-report.json');
  const reportMdPath = path.join(reportsDir, 'active-topology-mirror-backfill-report.md');

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');

  let mdContent = `# Active Topology Mirror Backfill Report\n\n`;
  mdContent += `- **Timestamp**: ${report.timestamp}\n`;
  mdContent += `- **Mode**: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`;
  mdContent += `- **Collection**: ${report.collectionUsed}\n`;
  mdContent += `- **Collection Proof**: ${report.collectionUsedProof}\n`;
  mdContent += `- **Inherited Qdrant Collection Env**: ${report.usedQdrantCollectionEnv}\n\n`;

  mdContent += `## Metrics\n\n`;
  mdContent += `| Metric | Count |\n`;
  mdContent += `| :--- | :--- |\n`;
  mdContent += `| **Before Missing Gaps** | ${report.beforeMissing} |\n`;
  mdContent += `| **Direct Mirrors** | ${report.directMirrors} |\n`;
  mdContent += `| **Derived From SOM Coords** | ${report.derivedFromSomCoords} |\n`;
  mdContent += `| **Unresolved** | ${report.unresolved} |\n`;
  mdContent += `| **Would Write** | ${report.wouldWrite} |\n`;
  mdContent += `| **Written** | ${report.written} |\n`;
  mdContent += `| **After Missing Gaps** | ${report.afterMissing} |\n\n`;

  mdContent += `## Detailed Resolve Records\n\n`;
  mdContent += `| Source Ref | Point ID | Assigned Cluster | Confidence | Source |\n`;
  mdContent += `| :--- | :--- | :--- | :--- | :--- |\n`;
  for (const r of repairs) {
    mdContent += `| \`${r.source_ref}\` | ${r.qdrant_point_id} | \`${r.assigned_cluster}\` | ${r.confidence.toFixed(2)} | ${r.source} |\n`;
  }
  if (repairs.length === 0) {
    mdContent += `| *No repairs applied* | | | | |\n`;
  }

  fs.writeFileSync(reportMdPath, mdContent, 'utf8');

  console.log(`\n  Report JSON written to: ${reportJsonPath}`);
  console.log(`  Report MD written to:   ${reportMdPath}`);

  await pool.end();
}

// Support simple let declarations for dynamic mapping
let directCluster, derivedCluster;

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
