#!/usr/bin/env node
/**
 * parent-atlas-coverage-recommendations.mjs
 *
 * Reads .tmp/parent-atlas-postgres-lineage-report.json (written by
 * daily-graphify-cold-processing.mjs or atlas:daily:graphify:cold) and
 * converts every coverage gap into a typed recommendation in the same
 * schema used by build-recommendations.mjs.
 *
 * Merges the results into .opencode/recommendations/recommendations.json
 * as a new "Parent Atlas Coverage" cluster — does NOT overwrite other
 * clusters produced by the main recommendation pipeline.
 *
 * Usage:
 *   node scripts/atlas/parent-atlas-coverage-recommendations.mjs
 *   node scripts/atlas/parent-atlas-coverage-recommendations.mjs --dry-run
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT    = path.resolve(process.cwd());
const DRY_RUN = process.argv.includes('--dry-run');

const LINEAGE_REPORT = path.join(ROOT, '.tmp', 'parent-atlas-postgres-lineage-report.json');
const RECS_JSON      = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
const RECS_MD        = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.md');

function recId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

// ── Coverage gap → recommendation ─────────────────────────────────────────────

function buildCoverageRecommendations(report) {
  const recs = [];
  const pad  = report.parent_atlas_documents ?? {};
  const afm  = report.atlas_feature_map      ?? {};
  const afs  = report.atlas_feature_synthesis ?? {};
  const rrp  = report.route_runtime_packets   ?? {};

  const total = pad.total ?? 0;
  if (!total) return recs;

  // ── Qdrant coverage gap ──────────────────────────────────────────────────────
  const qdrantMissing = total - (pad.has_qdrant_point_id ?? 0);
  const qdrantPct     = total ? Math.round((pad.has_qdrant_point_id ?? 0) / total * 100) : 0;
  if (qdrantPct < 90) {
    recs.push({
      id: recId('atlas_coverage'),
      type: 'atlas_coverage_gap',
      cluster: 'Parent Atlas Coverage',
      title: `Qdrant coverage: ${qdrantPct}% (${qdrantMissing} files unembedded)`,
      why: `${qdrantMissing} parent_atlas_documents rows have no qdrant_point_id. ` +
           `ACE packet source_refs will be empty for these files until embedded.`,
      sourceRefs: ['scripts/graphify/semantic-index.mjs'],
      action: `Run graphify:semantic to embed ${qdrantMissing} missing files`,
      next_command: 'npm run graphify:semantic',
      priority: qdrantPct < 50 ? 'high' : 'medium',
      featureStatus: 'degraded',
      metrics: { total, covered: pad.has_qdrant_point_id ?? 0, pct: qdrantPct },
    });
  }

  // ── Cluster coverage gap ─────────────────────────────────────────────────────
  const clusterMissing = total - (pad.has_cluster_id ?? 0);
  const clusterPct     = total ? Math.round((pad.has_cluster_id ?? 0) / total * 100) : 0;
  if (clusterPct < 90) {
    recs.push({
      id: recId('atlas_coverage'),
      type: 'atlas_coverage_gap',
      cluster: 'Parent Atlas Coverage',
      title: `SOM cluster coverage: ${clusterPct}% (${clusterMissing} files unclassified)`,
      why: `${clusterMissing} parent_atlas_documents rows have no cluster_id. ` +
           `ACE packet cluster_id, som_cluster, and topology boosting are unavailable for these files.`,
      sourceRefs: ['scripts/graphify/semantic-cluster.mjs'],
      action: `Run graphify:semantic-cluster to assign cluster_id to ${clusterMissing} files`,
      next_command: 'npm run graphify:semantic-cluster',
      priority: clusterPct < 50 ? 'high' : 'medium',
      featureStatus: 'degraded',
      metrics: { total, covered: pad.has_cluster_id ?? 0, pct: clusterPct },
    });
  }

  // ── atlas_feature_synthesis is sparse ───────────────────────────────────────
  const synthTotal = afs.total ?? 0;
  if (synthTotal < 20) {
    recs.push({
      id: recId('atlas_coverage'),
      type: 'atlas_coverage_gap',
      cluster: 'Parent Atlas Coverage',
      title: `atlas_feature_synthesis has only ${synthTotal} rows — feature rollups incomplete`,
      why: `Feature-level ACE context (feature_ids, lane_ids) is sparse. ` +
           `Only ${synthTotal} features have synthesized rollups; full codebase has hundreds of features.`,
      sourceRefs: ['scripts/atlas/gemma4-parent-atlas-summaries.mjs'],
      action: 'Run Gemma4 parent atlas summary pipeline to build feature synthesis rows',
      next_command: 'npm run atlas:summaries:apply',
      priority: synthTotal < 5 ? 'high' : 'medium',
      featureStatus: 'degraded',
      metrics: { synthTotal },
    });
  }

  // ── atlas_feature_map ↔ parent_atlas_documents join gap ──────────────────────
  const afmNotInPad = afm.not_in_parent_atlas_documents ?? 0;
  if (afmNotInPad > 0) {
    recs.push({
      id: recId('atlas_coverage'),
      type: 'atlas_coverage_gap',
      cluster: 'Parent Atlas Coverage',
      title: `${afmNotInPad} atlas_feature_map rows not joined to parent_atlas_documents`,
      why: `These files have feature map entries but no canonical parent_atlas_documents record. ` +
           `They are invisible to ACE packet assembly and cannot contribute to feature_ids.`,
      sourceRefs: ['scripts/atlas/sync-parent-atlas.mjs'],
      action: 'Re-run atlas sync to backfill missing parent_atlas_documents rows',
      next_command: 'npm run atlas:sync',
      priority: afmNotInPad > 1000 ? 'high' : 'medium',
      featureStatus: 'degraded',
      metrics: { afmTotal: afm.total ?? 0, notInPad: afmNotInPad, matched: afm.matched_parent_atlas_documents ?? 0 },
    });
  }

  // ── SOM cluster gap in atlas_feature_map ─────────────────────────────────────
  const afmTotal      = afm.total ?? 0;
  const afmWithSom    = afm.has_som_cluster ?? 0;
  const afmSomPct     = afmTotal ? Math.round(afmWithSom / afmTotal * 100) : 0;
  if (afmSomPct < 90 && afmTotal > 0) {
    recs.push({
      id: recId('atlas_coverage'),
      type: 'atlas_coverage_gap',
      cluster: 'Parent Atlas Coverage',
      title: `SOM cluster on atlas_feature_map: ${afmSomPct}% (${afmTotal - afmWithSom} missing)`,
      why: `${afmTotal - afmWithSom} atlas_feature_map rows have no som_cluster. ` +
           `SOM topology boosting in ACE scoring is limited to ${afmSomPct}% of the feature map.`,
      sourceRefs: ['scripts/graphify/som-topology-pipeline.mjs'],
      action: 'Run graphify:semantic-cluster to populate som_cluster on atlas_feature_map',
      next_command: 'npm run graphify:semantic-cluster',
      priority: 'medium',
      featureStatus: 'degraded',
      metrics: { afmTotal, afmWithSom, afmSomPct },
    });
  }

  // ── Route runtime packets empty ───────────────────────────────────────────────
  const rrpTotal = rrp.total ?? 0;
  if (rrpTotal === 0) {
    recs.push({
      id: recId('atlas_coverage'),
      type: 'atlas_coverage_gap',
      cluster: 'Parent Atlas Coverage',
      title: 'route_runtime_packets is empty — hot-path scoring unavailable',
      why: 'ACE hot-path scoring (route_runtime_packets) has 0 rows. ' +
           'Routes cannot be boosted by actual request frequency. redis_hot_keys will be empty.',
      sourceRefs: ['src/routes/api/sse/chat/+server.ts'],
      action: 'Instrument routes to emit runtime telemetry packets',
      next_command: '',
      priority: 'low',
      featureStatus: 'missing',
      metrics: { rrpTotal },
    });
  }

  return recs;
}

// ── Rebuild markdown from clusters ────────────────────────────────────────────

function buildMarkdown(output) {
  const { generatedAt, totalCount, clusters, top10 } = output;
  const lines = [
    `# Recommendations — ${generatedAt}`,
    ``,
    `**Total**: ${totalCount} recommendations across ${Object.keys(clusters).length} clusters`,
    ``,
    `## Top 10`,
    ...top10.map((r, i) =>
      `${i + 1}. **[${r.priority.toUpperCase()}]** \`${r.type}\` — ${r.title}\n   - ${r.why}\n   - Action: ${r.action}${r.next_command ? `\n   - \`${r.next_command}\`` : ''}`
    ),
    ``,
    `## By Cluster`,
    ...Object.entries(clusters).map(([cluster, recs]) =>
      [`### ${cluster}`, ...recs.map(r => `- [${r.priority}] ${r.title}`), ''].join('\n')
    ),
  ];
  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Parent Atlas Coverage Recommendations ─────────────────────');

  // Load lineage report
  if (!existsSync(LINEAGE_REPORT)) {
    console.warn(`  ⚠  Lineage report not found: ${LINEAGE_REPORT}`);
    console.warn(`     Run: npm run atlas:daily:graphify:cold  (generates the report)`);
    process.exit(0);
  }
  const report = JSON.parse(await fs.readFile(LINEAGE_REPORT, 'utf8'));

  const newRecs = buildCoverageRecommendations(report);
  console.log(`  coverage gaps found: ${newRecs.length}`);
  if (newRecs.length === 0) {
    console.log('  ✓ No coverage gaps detected — all thresholds met');
    return;
  }

  for (const r of newRecs) {
    const pct = r.metrics?.pct != null ? ` (${r.metrics.pct}%)` : '';
    console.log(`    [${r.priority}] ${r.title.slice(0, 80)}${pct}`);
  }

  if (DRY_RUN) {
    console.log('\n  --dry-run: skipping write');
    return;
  }

  // Load existing recommendations (may not exist yet)
  let existing = { generatedAt: new Date().toISOString(), totalCount: 0, clusters: {}, top10: [], inputs: {} };
  if (existsSync(RECS_JSON)) {
    try {
      existing = JSON.parse(await fs.readFile(RECS_JSON, 'utf8'));
    } catch {
      // corrupt or missing — start fresh
    }
  }

  // Replace "Parent Atlas Coverage" cluster only; keep all other clusters intact
  existing.clusters['Parent Atlas Coverage'] = newRecs;

  // Recompute totalCount and top10
  const allRecs = Object.values(existing.clusters).flat();
  const order   = { high: 0, medium: 1, low: 2 };
  allRecs.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));

  existing.generatedAt = new Date().toISOString();
  existing.totalCount  = allRecs.length;
  existing.top10       = allRecs.slice(0, 10);

  await fs.mkdir(path.dirname(RECS_JSON), { recursive: true });
  await fs.writeFile(RECS_JSON, JSON.stringify(existing, null, 2), 'utf8');
  await fs.writeFile(RECS_MD, buildMarkdown(existing), 'utf8');

  console.log(`\n  ✓ Merged ${newRecs.length} Parent Atlas Coverage recommendations`);
  console.log(`  ✓ Total recommendations: ${allRecs.length}`);
  console.log(`  ✓ wrote ${RECS_JSON}`);
}

main().catch(err => { console.error(err); process.exit(1); });
