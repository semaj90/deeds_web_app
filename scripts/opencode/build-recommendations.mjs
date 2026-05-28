#!/usr/bin/env node
/**
 * build-recommendations.mjs
 *
 * Phase 11E: Recommendation Layer.
 * Reads real signals from ace-packets, atlas seeds, ranked cards, smoke reports,
 * and the codebase map. Emits compact actionable recommendations grouped by cluster.
 *
 * Inputs (all optional — gracefully skipped if missing):
 *   .opencode/ace-packets/index.ndjson
 *   .opencode/ace-packets/*.json
 *   .opencode/cards/summaries.merged.jsonl
 *   .tmp/retrieval-ranking-report.json
 *   .tmp/atlas-cartridge-seeds.jsonl
 *   .tmp/bifrost-trace-smoke.json
 *   .tmp/atlas-lane-health-loop.json
 *   reports/startup-truth-audit-report.md
 *
 * Outputs:
 *   .opencode/recommendations/recommendations.json
 *   .opencode/recommendations/recommendations.md
 *
 * Usage:
 *   node scripts/opencode/build-recommendations.mjs
 *   node scripts/opencode/build-recommendations.mjs --dry-run
 */

import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';

const ROOT    = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

const PATHS = {
  aceIndex:      path.join(ROOT, '.opencode', 'ace-packets', 'index.ndjson'),
  acePacketsDir: path.join(ROOT, '.opencode', 'ace-packets'),
  mergedCards:   path.join(ROOT, '.opencode', 'cards', 'summaries.merged.jsonl'),
  rankReport:    path.join(ROOT, '.tmp', 'retrieval-ranking-report.json'),
  atlasSeeds:    path.join(ROOT, '.tmp', 'atlas-cartridge-seeds.jsonl'),
  bifrostSmoke:  path.join(ROOT, '.tmp', 'bifrost-trace-smoke.json'),
  laneHealth:    path.join(ROOT, '.tmp', 'atlas-lane-health-loop.json'),
  startupReport: path.join(ROOT, 'reports', 'startup-truth-audit-report.md'),
  outDir:        path.join(ROOT, '.opencode', 'recommendations'),
  outJson:       path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json'),
  outMd:         path.join(ROOT, '.opencode', 'recommendations', 'recommendations.md'),
};

// ── Feature clusters ───────────────────────────────────────────────────────────
const CLUSTER_MAP = [
  { cluster: 'Context Engineering', patterns: [/ace.packet|startup.context|patch.card|sourceRef|atlas.seed|ace.context/i] },
  { cluster: 'Retrieval',           patterns: [/qdrant|turbovec|graphify|redis.cache|vector|embedding|rerank/i] },
  { cluster: 'Agent Workflow',      patterns: [/opencode|smoke.test|patch.promot|todo.track|recommend/i] },
  { cluster: 'Performance',         patterns: [/simdjson|messagepack|cuda|libtorch|hot.doc|cold.doc|bench/i] },
  { cluster: 'Legal Workspace',     patterns: [/evidence|case.summar|timeline|legal.doc|forensic/i] },
  { cluster: 'Infrastructure',      patterns: [/rabbitmq|postgres|redis|docker|startup|health.check/i] },
];

function assignCluster(text) {
  const t = (text || '').toLowerCase();
  for (const { cluster, patterns } of CLUSTER_MAP) {
    if (patterns.some(p => p.test(t))) return cluster;
  }
  return 'General';
}

// ── Readers ────────────────────────────────────────────────────────────────────
async function readNdjson(filePath) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return rows;
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return fallback; }
}

async function readText(filePath) {
  try { return await fs.readFile(filePath, 'utf8'); } catch { return ''; }
}

function recId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

// ── Signal analysis ────────────────────────────────────────────────────────────

/** Failing lanes: smoke checks that did not pass. */
function detectFailingLanes(bifrostSmoke, laneHealth) {
  const recs = [];
  if (bifrostSmoke) {
    for (const [key, val] of Object.entries(bifrostSmoke.results || {})) {
      if (!val.ok) {
        recs.push({
          id: recId('failing_lane'),
          type: 'failing_lane',
          cluster: assignCluster(key),
          title: `Failing lane: ${key}`,
          why: val.error || 'smoke check did not pass',
          sourceRefs: ['scripts/smoke/bifrost-trace-smoke.mjs'],
          action: `Investigate ${key} — check service health and restart if needed`,
          next_command: 'npm run bifrost:trace:smoke',
          priority: 'high',
          featureStatus: 'degraded',
        });
      }
    }
  }
  if (laneHealth) {
    const cuda = laneHealth.cuda || {};
    if (!cuda.nodeAddonExists) {
      recs.push({
        id: recId('failing_lane'),
        type: 'failing_lane',
        cluster: 'Performance',
        title: 'SIMD/native .node addon not built',
        why: 'tensorrt_bridge.node missing — simdjson and LibTorch unavailable',
        sourceRefs: ['simd-bridge/cpp/CMakeLists.txt'],
        action: 'cd simd-bridge/cpp && cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release',
        next_command: 'npm run atlas:lane-health',
        priority: 'medium',
        featureStatus: 'missing',
      });
    }
  }
  return recs;
}

/** Stale features: atlas seeds with status=missing or stale seeds file. */
function detectStaleFeatures(atlasSeeds, laneHealth) {
  const recs = [];
  if (laneHealth?.seeds?.stale) {
    recs.push({
      id: recId('stale_feature'),
      type: 'stale_feature',
      cluster: 'Context Engineering',
      title: 'Atlas cartridge seeds are stale (>24h)',
      why: `Seeds age: ${laneHealth.seeds.ageMin} min — retrieval context may be outdated`,
      sourceRefs: ['scripts/atlas/atlas-to-cartridge-seed.mjs'],
      action: 'Regenerate seeds',
      next_command: 'npm run atlas:cartridge-seed',
      priority: 'medium',
      featureStatus: 'stale',
    });
  }
  if (atlasSeeds) {
    const missingFeatures = atlasSeeds.filter(s => s.status === 'missing').slice(0, 5);
    for (const f of missingFeatures) {
      recs.push({
        id: recId('stale_feature'),
        type: 'missing_feature',
        cluster: assignCluster(f.feature_label || ''),
        title: `Feature not implemented: ${f.feature_label}`,
        why: f.risk_notes || 'Feature in atlas but not yet implemented',
        sourceRefs: [f.sourceRef].filter(Boolean),
        action: f.nextAction || 'Implement or defer this feature',
        next_command: '',
        priority: 'low',
        featureStatus: 'missing',
      });
    }
  }
  return recs;
}

/** Top developer recommendations: highest-scored ranked cards with TODO signals. */
function detectTopDevRecs(rankReport) {
  const recs = [];
  if (!rankReport?.ranked) return recs;
  const candidates = rankReport.ranked
    .filter(r => (r.signals?.todoPriority || 0) > 0.4 || (r.signals?.errorRelevance || 0) > 0.5)
    .slice(0, 8);
  for (const c of candidates) {
    recs.push({
      id: recId('dev_rec'),
      type: 'developer_recommendation',
      cluster: assignCluster(c.source || c.title || ''),
      title: (c.title || '').slice(0, 100).replace(/\n/g, ' '),
      why: `score ${c.score?.toFixed(3)} — todo: ${c.signals?.todoPriority}, errors: ${c.signals?.errorRelevance}`,
      sourceRefs: [c.source].filter(Boolean),
      action: 'Review card and act on TODO items',
      next_command: '',
      priority: (c.signals?.todoPriority || 0) >= 1 ? 'high' : 'medium',
      featureStatus: 'active',
    });
  }
  return recs;
}

/** Duplicate systems: ace-packet groups that share overlapping top_tags. */
function detectDuplicates(acePackets) {
  const recs = [];
  if (!acePackets?.length) return recs;
  const tagGroups = new Map();
  for (const p of acePackets) {
    for (const tag of (p.top_tags || []).slice(0, 3)) {
      if (!tagGroups.has(tag)) tagGroups.set(tag, []);
      tagGroups.get(tag).push(p.packet_id || p.group);
    }
  }
  for (const [tag, packets] of tagGroups) {
    if (packets.length >= 3) {
      recs.push({
        id: recId('duplicate'),
        type: 'duplicated_system',
        cluster: assignCluster(tag),
        title: `Tag "${tag}" spans ${packets.length} packets — possible duplication`,
        why: 'Multiple independent implementations of the same concept detected',
        sourceRefs: packets.slice(0, 3),
        action: 'Consolidate or deduplicate these feature areas',
        next_command: 'npm run ace:packets',
        priority: 'low',
        featureStatus: 'active',
      });
    }
  }
  return recs.slice(0, 3);
}

/** Missing sourceRefs: merged cards with empty sourceRef. */
function detectMissingSourceRefs(mergedCards) {
  const recs = [];
  const missing = mergedCards.filter(c => !c.sourceRef && !c.source_path).slice(0, 5);
  if (missing.length > 0) {
    recs.push({
      id: recId('missing_sourceref'),
      type: 'missing_dependency',
      cluster: 'Context Engineering',
      title: `${missing.length} merged cards missing sourceRef`,
      why: 'Cards without sourceRef cannot be routed to the correct feature area',
      sourceRefs: missing.map(c => c.card_id || c.id).slice(0, 5).filter(Boolean),
      action: 'Backfill sourceRef in summaries.jsonl or re-run card generation',
      next_command: 'npm run cards:merge',
      priority: 'medium',
      featureStatus: 'degraded',
    });
  }
  return recs;
}

// ── Cluster grouping ───────────────────────────────────────────────────────────
function groupByCluster(recs) {
  const clusters = {};
  for (const r of recs) {
    const c = r.cluster || 'General';
    if (!clusters[c]) clusters[c] = [];
    clusters[c].push(r);
  }
  return clusters;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Build Recommendations (Phase 11E) ──────────────────────');

  // Load all inputs
  const [aceIndexRows, bifrostSmoke, laneHealth, rankReport] = await Promise.all([
    readNdjson(PATHS.aceIndex),
    readJson(PATHS.bifrostSmoke),
    readJson(PATHS.laneHealth),
    readJson(PATHS.rankReport),
  ]);

  // Load ace packet detail for duplicate detection
  const acePackets = [];
  for (const row of aceIndexRows) {
    const p = row.path ? path.join(ROOT, row.path.replace(/^\.\//, '')) : null;
    if (p && existsSync(p)) {
      const pkt = await readJson(p);
      if (pkt) acePackets.push(pkt);
    }
  }

  // Load atlas seeds (JSONL)
  const atlasSeeds = await readNdjson(PATHS.atlasSeeds);

  // Load merged cards
  const mergedCards = await readNdjson(PATHS.mergedCards);

  console.log(`  ace packets   : ${acePackets.length}`);
  console.log(`  atlas seeds   : ${atlasSeeds.length}`);
  console.log(`  merged cards  : ${mergedCards.length}`);
  console.log(`  rank report   : ${rankReport?.ranked?.length ?? 0} entries`);

  // Generate all recommendations
  const all = [
    ...detectFailingLanes(bifrostSmoke, laneHealth),
    ...detectStaleFeatures(atlasSeeds, laneHealth),
    ...detectTopDevRecs(rankReport),
    ...detectDuplicates(acePackets),
    ...detectMissingSourceRefs(mergedCards),
  ];

  // Sort: high → medium → low
  const order = { high: 0, medium: 1, low: 2 };
  all.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));

  const clusters = groupByCluster(all);

  console.log(`\n  Total recommendations: ${all.length}`);
  for (const [cluster, recs] of Object.entries(clusters)) {
    console.log(`    ${cluster.padEnd(24)}: ${recs.length}`);
  }

  // Top 10 by priority
  const top10 = all.slice(0, 10);

  const output = {
    generatedAt: new Date().toISOString(),
    totalCount: all.length,
    clusters,
    top10,
    inputs: {
      acePackets: acePackets.length,
      atlasSeeds: atlasSeeds.length,
      mergedCards: mergedCards.length,
      rankEntries: rankReport?.ranked?.length ?? 0,
    },
  };

  // Build markdown
  const mdLines = [
    `# Recommendations — ${output.generatedAt}`,
    ``,
    `**Total**: ${all.length} recommendations across ${Object.keys(clusters).length} clusters`,
    ``,
    `## Top 10`,
    ...top10.map((r, i) =>
      `${i + 1}. **[${r.priority.toUpperCase()}]** \`${r.type}\` — ${r.title}\n   - ${r.why}\n   - Action: ${r.action}${r.next_command ? `\n   - \`${r.next_command}\`` : ''}`
    ),
    ``,
    `## By Cluster`,
    ...Object.entries(clusters).map(([cluster, recs]) => [
      `### ${cluster}`,
      ...recs.map(r => `- [${r.priority}] ${r.title}`),
      '',
    ].join('\n')),
  ];
  const md = mdLines.join('\n');

  if (!DRY_RUN) {
    await fs.mkdir(PATHS.outDir, { recursive: true });
    await fs.writeFile(PATHS.outJson, JSON.stringify(output, null, 2), 'utf8');
    await fs.writeFile(PATHS.outMd, md, 'utf8');
    console.log(`\n  ✅ wrote ${PATHS.outJson}`);
    console.log(`  ✅ wrote ${PATHS.outMd}`);
  } else {
    console.log(`\n  dry-run: would write ${all.length} recommendations`);
    console.log('\n  Top 5 preview:');
    for (const r of top10.slice(0, 5)) {
      console.log(`    [${r.priority}] ${r.cluster} — ${r.title.slice(0, 70)}`);
    }
  }

  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });