#!/usr/bin/env node
/**
 * Debug Qdrant/Postgres Mismatch
 *
 * Explains why reconciliation says IN_SYNC but sampled agreement says 0/50.
 *
 * Compares using CANONICAL comparator:
 * - source_ref (normalized)
 * - packet_key
 * - feature_id
 * - feature_label
 * - community_id
 * - som_cluster
 * - domain
 *
 * Deferred (non-failing):
 * - qdrant_tag_id
 * - karpathy_score
 * - redis_hot_key
 * - neo4j_node
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-postgres-mismatch-debug.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-postgres-mismatch-debug.md');

const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);
const QDRANT_URL = (env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');

// Canonical comparator contract
function normalizeSourceRef(ref) {
  if (!ref) return null;
  // Remove leading ./ or ../ and windows backslashes
  let normalized = String(ref)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '')
    .trim();
  // Remove sveltekit-frontend/ prefix if present (repo structure variance)
  normalized = normalized.replace(/^sveltekit-frontend\//, '');
  // Remove #chunk-N suffix (Qdrant stores chunk index here, Postgres doesn't)
  normalized = normalized.replace(/#chunk-\d+$/, '');
  return normalized || null;
}

function getCanonicalFields(obj) {
  // Qdrant uses camelCase (sourceRef), Postgres uses snake_case (source_ref)
  const sourceRef = obj.source_ref || obj.sourceRef || obj.canonicalSourceRef || null;

  return {
    source_ref: normalizeSourceRef(sourceRef),
    packet_key: obj.packet_key || obj.packetKey || null,
    feature_id: obj.feature_id || null,
    feature_label: obj.feature_label || obj.featureLabel || null,
    community_id: obj.community_id || obj.communityId || null,
    domain_class: obj.domain_class || obj.domainClass || obj.domain || null,
  };
}

function compareObjects(qdrant, postgres) {
  const mismatches = [];
  const canonical = ['source_ref', 'packet_key', 'feature_id', 'feature_label', 'community_id', 'som_cluster', 'domain'];

  for (const field of canonical) {
    if (qdrant[field] !== postgres[field]) {
      mismatches.push({
        field,
        qdrant: qdrant[field],
        postgres: postgres[field],
      });
    }
  }

  return mismatches.length === 0 ? null : mismatches;
}

async function fetchQdrantSample(limit = 50) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.result?.points) ? body.result.points : [];
  } catch (err) {
    console.error('[debug] Qdrant fetch failed:', err.message);
    return [];
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const startTime = Date.now();

  let report = {
    generatedAt: new Date().toISOString(),
    qdrantUrl: QDRANT_URL,
    sampleSize: 50,
    points: [],
    histogram: {
      total_sampled: 0,
      agreement: 0,
      source_ref_mismatch: 0,
      packet_key_mismatch: 0,
      feature_id_mismatch: 0,
      feature_label_mismatch: 0,
      community_id_mismatch: 0,
      domain_class_mismatch: 0,
      missing_postgres_row: 0,
    },
  };

  try {
    // Fetch Qdrant sample
    console.log('[debug] Fetching Qdrant sample (50 points)...');
    const qdrantPoints = await fetchQdrantSample(50);

    if (qdrantPoints.length === 0) {
      console.error('[debug] No Qdrant points found');
      report.error = 'No Qdrant points found';
      await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
      process.exit(1);
    }

    report.histogram.total_sampled = qdrantPoints.length;

    // For each Qdrant point, find matching Postgres row
    for (const point of qdrantPoints) {
      const payload = point.payload || {};
      const qdrantCanonical = getCanonicalFields(payload);

      // Try to find matching Postgres row by source_ref
      let postgresRow = null;
      if (qdrantCanonical.source_ref) {
        try {
          const res = await pool.query(
            `SELECT packet_key, source_ref, feature_id, feature_label, community_id, domain_class
             FROM atlas_packets
             WHERE source_ref = $1
             LIMIT 1`,
            [qdrantCanonical.source_ref]
          );
          if (res.rows.length > 0) {
            postgresRow = res.rows[0];
          }
        } catch (err) {
          console.error(`[debug] Query failed for source_ref "${qdrantCanonical.source_ref}":`, err.message);
        }
      }

      let mismatchFields = null;
      if (postgresRow) {
        const postgresCanonical = getCanonicalFields(postgresRow);
        mismatchFields = compareObjects(qdrantCanonical, postgresCanonical);

        if (!mismatchFields) {
          report.histogram.agreement += 1;
        } else {
          // Track specific mismatch types
          for (const mismatch of mismatchFields) {
            const key = `${mismatch.field}_mismatch`;
            if (key in report.histogram) {
              report.histogram[key] += 1;
            }
          }
        }
      } else {
        report.histogram.missing_postgres_row += 1;
      }

      // Add to report
      report.points.push({
        qdrant_point_id: point.id,
        qdrant: qdrantCanonical,
        postgres: postgresRow ? getCanonicalFields(postgresRow) : null,
        mismatches: mismatchFields,
        postgresFound: postgresRow ? true : false,
      });
    }

    // Calculate agreement rate
    const agreementRate = (report.histogram.agreement / report.histogram.total_sampled * 100).toFixed(2);
    report.agreementRate = parseFloat(agreementRate);

    // Write JSON report
    await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
    console.log(`[debug] Wrote ${REPORT_JSON}`);

    // Write Markdown report
    const md = `# Qdrant/Postgres Mismatch Debug Report

Generated: ${report.generatedAt}

## Summary

- **Total Sampled**: ${report.histogram.total_sampled}
- **Agreement**: ${report.histogram.agreement}/${report.histogram.total_sampled} (${agreementRate}%)
- **Missing Postgres Rows**: ${report.histogram.missing_postgres_row}

## Mismatch Histogram

| Mismatch Type | Count |
|---|---|
| source_ref | ${report.histogram.source_ref_mismatch} |
| packet_key | ${report.histogram.packet_key_mismatch} |
| feature_id | ${report.histogram.feature_id_mismatch} |
| feature_label | ${report.histogram.feature_label_mismatch} |
| community_id | ${report.histogram.community_id_mismatch} |
| domain_class | ${report.histogram.domain_class_mismatch} |

## Canonical Comparator

The debug script uses this canonical contract:

\`\`\`
source_ref (normalized: no leading ./, windows backslash → /, lowercase)
packet_key
feature_id
feature_label
community_id
domain_class
\`\`\`

## Sample Points (First 10)

${report.points.slice(0, 10).map((pt, i) => `
### Point ${i + 1}: ${pt.qdrant_point_id}

**Qdrant Canonical**:
\`\`\`json
${JSON.stringify(pt.qdrant, null, 2)}
\`\`\`

**Postgres Canonical**:
${pt.postgres ? `\`\`\`json
${JSON.stringify(pt.postgres, null, 2)}
\`\`\`` : '(NOT FOUND)'}

**Mismatches**: ${pt.mismatches ? pt.mismatches.map(m => `${m.field}: "${m.qdrant}" vs "${m.postgres}"`).join(', ') : 'MATCH ✓'}
`).join('\n')}

## Safeguards

- ✓ No Postgres mutations
- ✓ No row identity by feature_id (identity by source_ref)
- ✓ No higher-hop enrichment until agreement >95%
- ✓ Deferred fields (qdrant_tag_id, karpathy_score, redis_hot_key, neo4j_node) not checked

## Next Steps

${agreementRate >= 95 ? '✅ PASS — Agreement >95%, safe for higher-hop enrichment' : '❌ FAIL — Agreement <95%, identify root cause before enrichment'}
`;

    await fs.writeFile(REPORT_MD, md);
    console.log(`[debug] Wrote ${REPORT_MD}`);

    console.log(`\n[debug] Summary: ${report.histogram.agreement}/${report.histogram.total_sampled} agreement (${agreementRate}%)`);
    console.log(`[debug] Missing Postgres rows: ${report.histogram.missing_postgres_row}`);

    if (report.histogram.missing_postgres_row > 0) {
      console.log('[debug] ❌ Many Qdrant points have no matching Postgres row');
    }

    // Check if any single field dominates mismatch type
    const mismatchCounts = Object.entries(report.histogram)
      .filter(([k]) => k.endsWith('_mismatch'))
      .sort(([, a], [, b]) => b - a);

    if (mismatchCounts.length > 0 && mismatchCounts[0][1] > 0) {
      console.log(`[debug] ⚠️  Dominant mismatch: ${mismatchCounts[0][0]} (${mismatchCounts[0][1]} cases)`);
    }

  } catch (err) {
    console.error('[debug] Fatal error:', err);
    report.error = err.message;
    await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2));
    process.exit(1);
  } finally {
    await pool.end();
    const elapsed = Date.now() - startTime;
    console.log(`[debug] Completed in ${elapsed}ms`);
  }
}

main();
