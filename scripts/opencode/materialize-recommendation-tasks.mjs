#!/usr/bin/env node
/**
 * materialize-recommendation-tasks.mjs
 *
 * Phase 11E Task 2: converts recommendations into executable task cards.
 *
 * Input:  .opencode/recommendations/recommendations.json
 * Output: .opencode/recommendations/tasks.ndjson
 *         .opencode/recommendations/tasks.md
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ROOT    = process.cwd();
const IN_JSON = path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json');
const OUT_DIR = path.join(ROOT, '.opencode', 'recommendations');
const OUT_NDJ = path.join(OUT_DIR, 'tasks.ndjson');
const OUT_MD  = path.join(OUT_DIR, 'tasks.md');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Risk heuristic ─────────────────────────────────────────────────────────────
function deriveRisk(rec) {
  if (rec.priority === 'high')   return 'high';
  if (rec.type === 'failing_lane') return 'high';
  if (rec.type === 'missing_dependency') return 'medium';
  if (rec.type === 'duplicated_system') return 'low';
  return rec.priority || 'low';
}

// ── Storage lane: where does the fix live? ─────────────────────────────────────
function deriveStorageLane(rec) {
  if (rec.cluster === 'Infrastructure') return 'ops';
  if (rec.cluster === 'Performance')    return 'ops';
  if (rec.next_command)                 return 'script';
  if (rec.sourceRefs?.some(s => /^scripts\//.test(s))) return 'script';
  return 'repo';
}

// ── TTL mapping ────────────────────────────────────────────────────────────────
function deriveTtlDays(rec) {
  if (rec.type === 'failing_lane')      return 1;
  if (rec.type === 'missing_dependency') return 1;
  if (rec.type === 'developer_recommendation') return 7;
  if (rec.type === 'missing_feature')   return 7;
  return 7;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n── Materialize Recommendation Tasks ──────────────────────');

  let recs;
  try {
    const raw = JSON.parse(await fs.readFile(IN_JSON, 'utf8'));
    // flatten all clusters into a single array
    recs = Object.values(raw.clusters || {}).flat();
    if (!recs.length && Array.isArray(raw)) recs = raw; // handle legacy array shape
  } catch (e) {
    console.error(`❌ Cannot read ${IN_JSON} — run build-recommendations.mjs first`);
    process.exit(1);
  }

  console.log(`  recommendations: ${recs.length}`);

  const createdAt = new Date().toISOString();
  const tasks = recs.map(rec => {
    const task_id = `task_${crypto.randomBytes(4).toString('hex')}`;
    return {
      task_id,
      recommendation_id: rec.id,
      cluster:      rec.cluster   || 'General',
      type:         rec.type      || 'unknown',
      title:        rec.title     || '',
      why:          rec.why       || '',
      action:       rec.action    || '',
      sourceRefs:   rec.sourceRefs || [],
      next_command: rec.next_command || '',
      status:       'todo',
      priority:     rec.priority  || 'low',
      risk:         deriveRisk(rec),
      storage_lane: deriveStorageLane(rec),
      ttl_days:     deriveTtlDays(rec),
      featureStatus: rec.featureStatus || 'active',
      createdAt,
    };
  });

  // Sort: high risk first, then medium, then low
  const order = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => (order[a.risk] ?? 2) - (order[b.risk] ?? 2));

  // ── Markdown ─────────────────────────────────────────────────────────────────
  const byCluster = {};
  for (const t of tasks) {
    if (!byCluster[t.cluster]) byCluster[t.cluster] = [];
    byCluster[t.cluster].push(t);
  }

  const mdLines = [
    `# Executable Task Cards — ${createdAt}`,
    ``,
    `**${tasks.length} tasks** across **${Object.keys(byCluster).length} clusters**`,
    ``,
    `## Task Summary`,
    `| # | Risk | Cluster | Title | Command |`,
    `|---|------|---------|-------|---------|`,
    ...tasks.map((t, i) =>
      `| ${i+1} | ${t.risk.toUpperCase()} | ${t.cluster} | ${t.title.slice(0,60).replace(/\|/g,'/')} | ${t.next_command ? `\`${t.next_command}\`` : '—'} |`
    ),
    ``,
    `## By Cluster`,
    ...Object.entries(byCluster).flatMap(([cluster, clusterTasks]) => [
      `### ${cluster}`,
      ...clusterTasks.map(t => [
        `#### [${t.risk.toUpperCase()}] ${t.title}`,
        `- **Type**: \`${t.type}\`  **Status**: \`${t.status}\`  **TTL**: ${t.ttl_days}d`,
        `- **Why**: ${t.why}`,
        `- **Action**: ${t.action}`,
        t.next_command ? `- **Run**: \`${t.next_command}\`` : '',
        t.sourceRefs?.length ? `- **sourceRefs**: ${t.sourceRefs.slice(0,3).join(', ')}` : '',
        `- **task_id**: \`${t.task_id}\``,
        ``,
      ].filter(Boolean).join('\n')),
      '',
    ]),
  ];
  const md = mdLines.join('\n');

  if (!DRY_RUN) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_NDJ, tasks.map(t => JSON.stringify(t)).join('\n') + '\n', 'utf8');
    await fs.writeFile(OUT_MD, md, 'utf8');
    console.log(`\n  ✅ wrote ${OUT_NDJ}`);
    console.log(`  ✅ wrote ${OUT_MD}`);
  } else {
    console.log(`\n  dry-run: would write ${tasks.length} tasks`);
    for (const t of tasks.slice(0, 5)) {
      console.log(`    [${t.risk}] ${t.cluster} — ${t.title.slice(0, 60)}`);
    }
  }

  // Summary counts
  const riskCounts = { high: 0, medium: 0, low: 0 };
  for (const t of tasks) riskCounts[t.risk] = (riskCounts[t.risk] || 0) + 1;
  console.log(`\n  risk breakdown: high=${riskCounts.high} medium=${riskCounts.medium} low=${riskCounts.low}`);
  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });