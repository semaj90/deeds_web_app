#!/usr/bin/env node
/**
 * scripts/atlas/route-runtime-packet-recommendations.mjs
 *
 * Converts docs/reports/route-runtime-packets-report.json into self-healing
 * recommendations. Dry-run by default; pass --apply to merge into
 * .opencode/recommendations/recommendations.{json,md}.
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'route-runtime-packets-report.json');
const RECS_JSON = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
const RECS_MD = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.md');

function recId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function priority(high, medium) {
  if (high) return 'high';
  if (medium) return 'medium';
  return 'low';
}

function buildRecommendations(report) {
  const recs = [];
  const total = Number(report.summary?.total ?? 0);
  const emptySourceRefs = Number(report.summary?.empty_source_refs ?? 0);
  const emptyFeatureIds = Number(report.summary?.empty_feature_ids ?? 0);
  const missingSom = Number(report.summary?.empty_som_cluster ?? 0);
  const lowDensity = Number(report.summary?.low_context_density ?? 0);
  const redisMissing = Number(report.redis_lod0?.missing ?? 0);
  const redisChecked = Number(report.redis_lod0?.checked ?? 0);
  const unknownHits = Number(
    (report.top_source_refs ?? []).find((row) => row.source_ref === 'sveltekit-frontend/unknown')?.hits ?? 0
  );

  if (lowDensity > 0) {
    recs.push({
      id: recId('runtime_packet'),
      type: 'retrieval:low-context-density',
      cluster: 'Self-Healing Retrieval',
      title: `${lowDensity} runtime packets returned fewer than 8 sourceRefs`,
      why: `Route runtime telemetry shows ${lowDensity}/${total} packets with Qdrant hits but low sourceRef density. This weakens replay, traversal, and recommendation lineage.`,
      sourceRefs: ['scripts/atlas/report-route-runtime-packets.mjs', 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts'],
      action: 'Review CHR97 cartridge hit expansion and sourceRef density thresholds; replay a representative packet before changing scoring.',
      next_command: 'npm run atlas:runtime-packets:report && cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs',
      priority: priority(lowDensity > total * 0.5, lowDensity > 5),
      featureStatus: 'degraded',
      metrics: { total, lowDensity },
    });
  }

  if (emptySourceRefs > 0 || unknownHits > 0) {
    recs.push({
      id: recId('runtime_packet'),
      type: 'retrieval:source-ref-provenance-gap',
      cluster: 'Self-Healing Retrieval',
      title: `${emptySourceRefs} empty-sourceRef packets and ${unknownHits} historical unknown sourceRef hits`,
      why: 'Runtime packets must be replayable from sourceRef lineage. Empty or placeholder sourceRefs break Parent Atlas joins and Redis packet decoding.',
      sourceRefs: ['sveltekit-frontend/src/lib/server/features/ai/ace/telemetry-source-ref-fallback.ts'],
      action: 'Keep the sourceRef normalizer in the hot path and monitor new route_runtime_packets rows for empty/unknown refs.',
      next_command: 'npm run atlas:runtime-packets:report',
      priority: priority(emptySourceRefs > 0, unknownHits > 0),
      featureStatus: emptySourceRefs > 0 ? 'degraded' : 'watch',
      metrics: { emptySourceRefs, unknownHits },
    });
  }

  if (emptyFeatureIds > 0) {
    recs.push({
      id: recId('runtime_packet'),
      type: 'retrieval:feature-id-provenance-gap',
      cluster: 'Self-Healing Retrieval',
      title: `${emptyFeatureIds} runtime packets have no featureIds`,
      why: 'Feature IDs are the join spine for recommendations, Neo4j ParentAtlasFeature nodes, and packet replay ranking.',
      sourceRefs: ['sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts'],
      action: 'Backfill feature IDs from parent_atlas_documents for telemetry sourceRefs before writing the runtime packet.',
      next_command: 'cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-route-runtime-packets.mjs',
      priority: 'medium',
      featureStatus: 'degraded',
      metrics: { emptyFeatureIds },
    });
  }

  if (missingSom > 0) {
    recs.push({
      id: recId('runtime_packet'),
      type: 'retrieval:missing-runtime-som-cluster',
      cluster: 'Self-Healing Retrieval',
      title: `${missingSom} runtime packets are missing SOM/cluster telemetry`,
      why: 'Active production files have Qdrant and SOM coverage, but the runtime telemetry row is not always carrying the selected SOM cluster.',
      sourceRefs: ['sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts', 'scripts/atlas/sync-graph-truth-neo4j.mjs'],
      action: 'Resolve SOM cluster from sourceRefs or qdrant IDs before writing route_runtime_packets.',
      next_command: 'npm run atlas:coverage:qdrant-no-som -- --limit=25',
      priority: priority(missingSom > total * 0.5, missingSom > 5),
      featureStatus: 'degraded',
      metrics: { missingSom, total },
    });
  }

  if (redisMissing > 0) {
    recs.push({
      id: recId('runtime_packet'),
      type: 'cache:missing-runtime-lod0-packets',
      cluster: 'Self-Healing Retrieval',
      title: `${redisMissing}/${redisChecked} recent runtime packets missing Redis LOD0 replay keys`,
      why: 'A route_runtime_packets row without ace:telemetry:{id}:lod0 cannot be replayed from packet_id alone.',
      sourceRefs: ['sveltekit-frontend/src/lib/server/features/ai/ace/telemetry-compressor.ts'],
      action: 'Replay smoke should continue checking Redis LOD0 coverage; investigate fire-and-forget compression misses if this remains nonzero.',
      next_command: 'cd sveltekit-frontend && npx tsx ../scripts/tests/smoke-runtime-packet-replay.mjs',
      priority: priority(redisMissing > redisChecked * 0.25, redisMissing > 0),
      featureStatus: 'degraded',
      metrics: { redisMissing, redisChecked },
    });
  }

  return recs;
}

function buildMarkdown(output) {
  const lines = [
    `# Recommendations - ${output.generatedAt}`,
    '',
    `**Total**: ${output.totalCount} recommendations across ${Object.keys(output.clusters).length} clusters`,
    '',
    '## Top 10',
    ...output.top10.map(
      (r, i) =>
        `${i + 1}. **[${String(r.priority).toUpperCase()}]** \`${r.type}\` - ${r.title}\n   - ${r.why}\n   - Action: ${r.action}${r.next_command ? `\n   - \`${r.next_command}\`` : ''}`
    ),
    '',
    '## By Cluster',
    ...Object.entries(output.clusters).map(([cluster, recs]) =>
      [`### ${cluster}`, ...recs.map((r) => `- [${r.priority}] ${r.title}`), ''].join('\n')
    ),
  ];
  return lines.join('\n');
}

async function mergeRecommendations(newRecs) {
  let existing = {
    generatedAt: new Date().toISOString(),
    totalCount: 0,
    clusters: {},
    top10: [],
    inputs: {},
  };
  if (existsSync(RECS_JSON)) {
    try {
      existing = JSON.parse(await fs.readFile(RECS_JSON, 'utf8'));
    } catch {
      // Start fresh if the existing file is not parseable.
    }
  }

  existing.clusters['Self-Healing Retrieval'] = newRecs;
  existing.inputs = {
    ...(existing.inputs ?? {}),
    routeRuntimePacketsReport: path.relative(ROOT, REPORT_JSON).replace(/\\/g, '/'),
  };

  const allRecs = Object.values(existing.clusters).flat();
  const order = { high: 0, medium: 1, low: 2 };
  allRecs.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));
  existing.generatedAt = new Date().toISOString();
  existing.totalCount = allRecs.length;
  existing.top10 = allRecs.slice(0, 10);

  await fs.mkdir(path.dirname(RECS_JSON), { recursive: true });
  await fs.writeFile(RECS_JSON, JSON.stringify(existing, null, 2), 'utf8');
  await fs.writeFile(RECS_MD, buildMarkdown(existing), 'utf8');
}

async function main() {
  if (!existsSync(REPORT_JSON)) {
    throw new Error(`${REPORT_JSON} is missing. Run npm run atlas:runtime-packets:report first.`);
  }

  const report = JSON.parse(await fs.readFile(REPORT_JSON, 'utf8'));
  const recs = buildRecommendations(report);

  console.log(`Runtime packet recommendations: ${recs.length}`);
  for (const rec of recs) {
    console.log(`- [${rec.priority}] ${rec.type}: ${rec.title}`);
  }

  if (!APPLY) {
    console.log('\nDry-run only. Pass --apply to merge into .opencode/recommendations.');
    return;
  }

  await mergeRecommendations(recs);
  console.log(`\nUpdated ${RECS_JSON}`);
  console.log(`Updated ${RECS_MD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
