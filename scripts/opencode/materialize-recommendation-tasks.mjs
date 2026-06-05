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
import { normalizeTaskPayload, validateTaskPayload } from './normalize-task-payload.mjs';

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

  // ── Load feature registry (optional) to attach feature IDs/context to tasks
  let registry = null;
  const REG_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');
  try {
    await fs.access(REG_PATH);
    registry = JSON.parse(await fs.readFile(REG_PATH, 'utf8'));
  } catch (e) {
    // file missing or unreadable — that's fine in dry-run
    if (e && e.code && e.code !== 'ENOENT')
      console.warn('Could not read feature registry:', e.message);
    registry = null;
  }
  const fileToFeatures = new Map();
  // build multiple indexes for flexible matching: normalized path, basename, route, and path-segments
  const basenameToFeatures = new Map();
  const routeToFeatures = new Map();
  const segmentToFeatures = new Map();

  function normalizePathRef(p) {
    if (!p) return '';
    let s = p.replace(/\\/g, '/');
    s = s.replace(/^\.\//, '');
    s = s.replace(/^\/[A-Za-z]:\//, '');
    s = s.replace(/^[A-Za-z]:\//, '');
    s = s.replace(/^\//, '');
    return s.toLowerCase();
  }

  if (registry && Array.isArray(registry.features)) {
    for (const f of registry.features) {
      // index by normalized file path
      for (const rawFile of f.files || []) {
        const file = normalizePathRef(rawFile);
        const arr = fileToFeatures.get(file) || [];
        arr.push(f);
        fileToFeatures.set(file, arr);

        // basename
        try {
          const b = path.basename(file);
          const ba = basenameToFeatures.get(b) || [];
          ba.push(f);
          basenameToFeatures.set(b, ba);
        } catch (e) {}

        // segments
        const parts = file.split('/').filter(Boolean);
        for (const p of parts) {
          const seg = segmentToFeatures.get(p) || [];
          seg.push(f);
          segmentToFeatures.set(p, seg);
        }
      }

      // index by declared routes if present
      for (const r of f.routes || []) {
        const rr = normalizePathRef(r);
        const ra = routeToFeatures.get(rr) || [];
        ra.push(f);
        routeToFeatures.set(rr, ra);
      }
    }
  }

  const createdAt = new Date().toISOString();
  const tasks = recs.map((rec) => {
    const task_id = `task_${crypto.randomBytes(4).toString('hex')}`;
    return {
      task_id,
      workspace_task_id: task_id,
      recommendation_id: rec.id,
      cluster: rec.cluster || 'General',
      type: rec.type || 'unknown',
      title: rec.title || '',
      // description included for OpenCode / delegation schema
      description:
        (rec.title || '') + '\n\nWhy: ' + (rec.why || '') + '\n\nAction: ' + (rec.action || ''),
      why: rec.why || '',
      action: rec.action || '',
      next_action: rec.next_command || rec.action || '',
      sourceRefs: rec.sourceRefs || [],
      source_ref: rec.sourceRefs?.[0] || '',
      featureIds: Array.isArray(rec.featureIds) ? rec.featureIds : [],
      next_command: rec.next_command || '',
      status: 'todo',
      priority: rec.priority || 'low',
      risk: deriveRisk(rec),
      storage_lane: deriveStorageLane(rec),
      ttl_days: deriveTtlDays(rec),
      featureStatus: rec.featureStatus || 'active',
      createdAt,
      traversalReport: rec.traversalReport || null,
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
    ...tasks.map(
      (t, i) =>
        `| ${i + 1} | ${t.risk.toUpperCase()} | ${t.cluster} | ${t.title.slice(0, 60).replace(/\|/g, '/')} | ${t.next_command ? `\`${t.next_command}\`` : '—'} |`
    ),
    ``,
    `## By Cluster`,
    ...Object.entries(byCluster).flatMap(([cluster, clusterTasks]) => [
      `### ${cluster}`,
      ...clusterTasks.map((t) =>
        [
          `#### [${t.risk.toUpperCase()}] ${t.title}`,
          `- **Type**: \`${t.type}\`  **Status**: \`${t.status}\`  **TTL**: ${t.ttl_days}d`,
          `- **Why**: ${t.why}`,
          `- **Action**: ${t.action}`,
          t.next_command ? `- **Run**: \`${t.next_command}\`` : '',
          t.sourceRefs?.length ? `- **sourceRefs**: ${t.sourceRefs.slice(0, 3).join(', ')}` : '',
          `- **task_id**: \`${t.task_id}\``,
          ``,
        ]
          .filter(Boolean)
          .join('\n')
      ),
      '',
    ]),
  ];
  const md = mdLines.join('\n');

  // Normalize tasks to the shared OpenCode task shape and validate
  const normalizedTasks = tasks.map((t) => {
    const n = normalizeTaskPayload(t);
    if (!validateTaskPayload(n)) {
      // Keep original if normalization somehow fails, but mark as invalid
      n._validation_failed = true;
      n._raw = t;
    }
    // preserve original meta fields
    n.task_id = t.task_id;
    n.recommendation_id = t.recommendation_id;
    n.cluster = t.cluster;
    n.type = t.type;
    n.title = t.title;
    n.status = t.status;
    n.priority = t.priority;
    n.risk = t.risk;
    n.storage_lane = t.storage_lane;
    n.ttl_days = t.ttl_days;
    n.featureStatus = t.featureStatus;
    n.createdAt = t.createdAt;
    n.sourceRefs = t.sourceRefs || n.context.sourceRefs || [];
    n.featureIds = Array.isArray(t.featureIds) ? t.featureIds.map(String) : n.context.featureIds || [];
    n.next_command = t.next_command || n.expected_output.safe_next_command || '';
    n.traversalReport = t.traversalReport || null;
    return n;
  });

  // Attach feature context (feature IDs + small summary) to normalized tasks
  for (const t of normalizedTasks) {
    const matched = new Map();
    const srefs = Array.isArray(t.sourceRefs) ? t.sourceRefs : [];
    for (const s of srefs) {
      const ns = normalizePathRef(s);

      // exact normalized file match
      if (fileToFeatures.has(ns)) {
        for (const f of fileToFeatures.get(ns)) matched.set(f.id, f);
        continue;
      }

      // route match
      if (routeToFeatures.has(ns)) {
        for (const f of routeToFeatures.get(ns)) matched.set(f.id, f);
      }

      // basename match
      try {
        const base = path.basename(ns);
        if (basenameToFeatures.has(base)) {
          for (const f of basenameToFeatures.get(base)) matched.set(f.id, f);
        }
      } catch (e) {}

      // suffix / contains heuristics
      for (const [file, feats] of fileToFeatures.entries()) {
        try {
          if (file.includes(ns) || ns.includes(file) || file.endsWith(ns) || ns.endsWith(file)) {
            for (const f of feats) matched.set(f.id, f);
          }
        } catch (e) {}
      }

      // token/segment matching (pick up route segments or directory names)
      const tokens = ns.split('/').filter(Boolean);
      for (const tok of tokens) {
        if (segmentToFeatures.has(tok)) {
          for (const f of segmentToFeatures.get(tok)) matched.set(f.id, f);
        }
      }
    }
    const featureList = Array.from(matched.values());
    t.featureIds = featureList.map((f) => f.id);
    t.featureContext = featureList.map((f) => ({
      id: f.id,
      label: f.label,
      confidence: f.confidence,
    }));
  }

  if (!DRY_RUN) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(
      OUT_NDJ,
      normalizedTasks.map((t) => JSON.stringify(t)).join('\n') + '\n',
      'utf8'
    );
    await fs.writeFile(OUT_MD, md, 'utf8');
    console.log(`\n  ✅ wrote ${OUT_NDJ}`);
    console.log(`  ✅ wrote ${OUT_MD}`);
    // Forward a summary of created tasks to the local gemma4 retrieval hook (dry-run safe)
    try {
      const { execSync } = await import('child_process');
      const hookScript = path.join(ROOT, 'scripts', 'opencode', 'gemma4-retrieval-hook.mjs');
      const MAX_HOOKS = 20;
      const toSend = normalizedTasks.slice(0, MAX_HOOKS);
      for (const t of toSend) {
        const payload = {
          query: t.title || 'materialize task',
          selectedCardIds: [t.task_id],
          sourceRefs: t.sourceRefs || [],
          rerankScore: 0,
          tool: 'materialize_recommendation_task',
          outcome: 'task_created',
          feedback: 'accepted',
        };
        try {
          execSync(`node "${hookScript}"`, { input: JSON.stringify(payload), encoding: 'utf-8' });
        } catch (e) {
          console.warn('hook forward failed for', t.task_id, e.message);
        }
      }
      console.log(
        `  forwarded ${Math.min(toSend.length, MAX_HOOKS)} tasks to gemma4 retrieval hook (legacy)`
      );
    } catch (e) {
      console.warn('Failed to forward tasks to gemma4 hook:', e.message);
    }
  } else {
    console.log(`\n  dry-run: would write ${normalizedTasks.length} tasks`);
    for (const t of normalizedTasks.slice(0, 5)) {
      console.log(`    [${t.risk}] ${t.cluster} — ${t.title.slice(0, 60)}`);
    }
  }

  // Summary counts
  const riskCounts = { high: 0, medium: 0, low: 0 };
  for (const t of tasks) riskCounts[t.risk] = (riskCounts[t.risk] || 0) + 1;
  console.log(
    `\n  risk breakdown: high=${riskCounts.high} medium=${riskCounts.medium} low=${riskCounts.low}`
  );
  console.log('──────────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error(e); process.exit(1); });
