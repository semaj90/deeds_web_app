#!/usr/bin/env node
/**
 * audit-parent-atlas-overlay-crosswalk.mjs
 *
 * READ-ONLY. Does NOT mutate Postgres, Qdrant, Neo4j, or any JSON file.
 *
 * Maps atlas_feature_map rows to:
 *   parent_atlas_documents  (via source_ref or feature_id)
 *   nes_chrom_packets       (via source_ref or feature_id)
 *   route_runtime_packets   (via source_ref or feature_id)
 *   app feature registry    (sveltekit-frontend/docs/atlas/feature-registry.json)
 *   root feature registry   (docs/atlas/feature-registry.json)
 *
 * Join classification per atlas_feature_map row:
 *   EXACT_SOURCE_REF_JOIN   — source_ref matched in both parent_atlas_documents AND registry
 *   FEATURE_ID_JOIN         — feature_id matched (source_ref miss)
 *   HEURISTIC_LABEL_JOIN    — normalized path/label match only
 *   ROOT_CONTRACT_ONLY      — found in root deployment registry, not in app catalog
 *   APP_INVENTORY_ONLY      — in app catalog, no live-table join found
 *   NO_JOIN                 — no match anywhere
 *
 * Outputs:
 *   sveltekit-frontend/docs/reports/parent-atlas-overlay-crosswalk-report.json
 *   sveltekit-frontend/docs/reports/parent-atlas-overlay-crosswalk-report.md
 *
 * Usage:
 *   node sveltekit-frontend/scripts/atlas/audit-parent-atlas-overlay-crosswalk.mjs
 *   npm run atlas:parent-atlas:overlay-crosswalk
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT  = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');

dotenv.config({ path: path.join(APP_ROOT, '.env') });

// ── paths ──────────────────────────────────────────────────────────────────────

const APP_REGISTRY_PATH  = path.join(APP_ROOT,  'docs', 'atlas', 'feature-registry.json');
const REPO_REGISTRY_PATH = path.join(REPO_ROOT, 'docs', 'atlas', 'feature-registry.json');
const SYNC_REPORT_PATH   = path.join(APP_ROOT,  'docs', 'reports', 'parent-atlas-overlay-sync-report.json');

const EXTERNAL_REGISTRY_PATH = path.resolve(
  'C:\\Users\\james\\Documents\\Codex\\2026-05-12\\ve-updated-the-local-quantization-notebook',
  'docs', 'atlas', 'feature-registry.json'
);

const OUT_DIR  = path.join(APP_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(OUT_DIR, 'parent-atlas-overlay-crosswalk-report.json');
const OUT_MD   = path.join(OUT_DIR, 'parent-atlas-overlay-crosswalk-report.md');

// ── helpers ────────────────────────────────────────────────────────────────────

async function safeReadJson(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function normalizePath(s) {
  return String(s ?? '')
    .replace(/\\/g, '/')
    .replace(/^sveltekit-frontend\//, '')
    .toLowerCase();
}

// ── db helpers ─────────────────────────────────────────────────────────────────

async function tryDbQuery(client, sql, params = []) {
  try { return (await client.query(sql, params)).rows; } catch { return null; }
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  process.stderr.write('[crosswalk] starting read-only audit\n');

  // 1. Load JSON sources
  const [appRegistry, repoRegistry, externalRegistry, syncReport] = await Promise.all([
    safeReadJson(APP_REGISTRY_PATH),
    safeReadJson(REPO_REGISTRY_PATH),
    safeReadJson(EXTERNAL_REGISTRY_PATH),
    safeReadJson(SYNC_REPORT_PATH),
  ]);

  const rootRegistry = repoRegistry ?? externalRegistry ?? [];

  // Build lookup maps from registries
  const appByFeatureKey = new Map();   // normalize(featureKey) → row
  const appBySourceRef  = new Map();   // normalizePath(sourceRef) → row
  for (const row of (appRegistry ?? [])) {
    const k = normalize(row.featureKey ?? row.title);
    if (k) appByFeatureKey.set(k, row);
    for (const sr of (row.sourceRefs ?? [])) {
      const np = normalizePath(sr.replace(/^local:/, '').split('#')[0]);
      if (np) appBySourceRef.set(np, row);
    }
  }

  const rootByFeatureId = new Map();   // normalize(feature_id) → row
  for (const row of rootRegistry) {
    const k = normalize(row.feature_id ?? row.featureKey);
    if (k) rootByFeatureId.set(k, row);
  }

  // 2. Connect to Postgres (optional — degrade gracefully)
  let client = null;
  let dbAvailable = false;
  try {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    dbAvailable = true;
    process.stderr.write('[crosswalk] Postgres connected\n');
  } catch (e) {
    process.stderr.write(`[crosswalk] Postgres unavailable: ${e.message} — running file-only mode\n`);
  }

  // 3. Load live-table indexes (read-only queries)
  const padBySourceRef  = new Map();   // normalizePath(source_ref) → {id, feature_id, source_ref}
  const padByFeatureId  = new Map();   // normalize(feature_id) → {id, feature_id, source_ref}
  const ncpBySourceRef  = new Map();   // normalizePath(source_ref) → {id, feature_id}
  const ncpByFeatureId  = new Map();
  const rrpBySourceRef  = new Map();   // via source_refs array

  if (dbAvailable) {
    process.stderr.write('[crosswalk] loading parent_atlas_documents index\n');
    const padRows = await tryDbQuery(
      client,
      'SELECT id, source_ref, feature_id FROM parent_atlas_documents WHERE source_ref IS NOT NULL LIMIT 10000'
    ) ?? [];
    for (const r of padRows) {
      const np = normalizePath(r.source_ref);
      if (np && !padBySourceRef.has(np)) padBySourceRef.set(np, r);
      const fk = normalize(r.feature_id);
      if (fk && !padByFeatureId.has(fk)) padByFeatureId.set(fk, r);
    }
    process.stderr.write(`[crosswalk] pad index: ${padBySourceRef.size} source_refs, ${padByFeatureId.size} feature_ids\n`);

    process.stderr.write('[crosswalk] loading nes_chrom_packets index\n');
    const ncpRows = await tryDbQuery(
      client,
      'SELECT id, source_ref, feature_id FROM nes_chrom_packets WHERE source_ref IS NOT NULL LIMIT 5000'
    ) ?? [];
    for (const r of ncpRows) {
      const np = normalizePath(r.source_ref);
      if (np && !ncpBySourceRef.has(np)) ncpBySourceRef.set(np, r);
      const fk = normalize(r.feature_id);
      if (fk && !ncpByFeatureId.has(fk)) ncpByFeatureId.set(fk, r);
    }
    process.stderr.write(`[crosswalk] ncp index: ${ncpBySourceRef.size} entries\n`);

    process.stderr.write('[crosswalk] loading route_runtime_packets index\n');
    const rrpRows = await tryDbQuery(
      client,
      'SELECT id, source_refs, feature_ids, cluster_id FROM route_runtime_packets LIMIT 1000'
    ) ?? [];
    for (const r of rrpRows) {
      for (const sr of (r.source_refs ?? [])) {
        const np = normalizePath(sr);
        if (np && !rrpBySourceRef.has(np)) rrpBySourceRef.set(np, r);
      }
    }
    process.stderr.write(`[crosswalk] rrp index: ${rrpBySourceRef.size} source_ref entries\n`);
  }

  // 4. Load atlas_feature_map sample for crosswalk (up to 500 rows to keep report readable)
  let afmRows = [];
  if (dbAvailable) {
    process.stderr.write('[crosswalk] sampling atlas_feature_map\n');
    afmRows = await tryDbQuery(
      client,
      `SELECT source_ref, feature_id, cluster_id, centroid_id, qdrant_point_id, som_cluster
       FROM atlas_feature_map
       WHERE source_ref IS NOT NULL
       ORDER BY source_ref
       LIMIT 500`
    ) ?? [];
    process.stderr.write(`[crosswalk] afm sample: ${afmRows.length} rows\n`);
  }

  // 5. Classify each afm row
  const rows = [];
  const missingSourceRefs = [];
  const missingFeatureIds = [];
  const classCounts = {
    EXACT_SOURCE_REF_JOIN: 0,
    FEATURE_ID_JOIN: 0,
    HEURISTIC_LABEL_JOIN: 0,
    ROOT_CONTRACT_ONLY: 0,
    APP_INVENTORY_ONLY: 0,
    NO_JOIN: 0,
  };

  for (const afm of afmRows) {
    const np         = normalizePath(afm.source_ref);
    const fk         = normalize(afm.feature_id);

    const padSrHit   = padBySourceRef.get(np) ?? null;
    const padFkHit   = padByFeatureId.get(fk) ?? null;
    const ncpSrHit   = ncpBySourceRef.get(np) ?? null;
    const ncpFkHit   = ncpByFeatureId.get(fk) ?? null;
    const rrpSrHit   = rrpBySourceRef.get(np) ?? null;
    const appSrHit   = appBySourceRef.get(np) ?? null;
    const appFkHit   = appByFeatureKey.get(normalize(afm.feature_id)) ?? null;
    const rootFkHit  = rootByFeatureId.get(fk) ?? null;

    let classification;
    if ((padSrHit || ncpSrHit || rrpSrHit) && (appSrHit || appFkHit)) {
      classification = 'EXACT_SOURCE_REF_JOIN';
    } else if ((padFkHit || ncpFkHit) && fk) {
      classification = 'FEATURE_ID_JOIN';
    } else if (rootFkHit && !(appSrHit || appFkHit)) {
      classification = 'ROOT_CONTRACT_ONLY';
    } else if (appSrHit || appFkHit) {
      classification = 'APP_INVENTORY_ONLY';
    } else if (padSrHit || padFkHit || ncpSrHit) {
      classification = 'HEURISTIC_LABEL_JOIN';
    } else {
      classification = 'NO_JOIN';
    }

    classCounts[classification]++;

    if (classification === 'NO_JOIN') {
      if (afm.source_ref) missingSourceRefs.push(afm.source_ref);
      if (afm.feature_id) missingFeatureIds.push(afm.feature_id);
    }

    rows.push({
      source_ref:     afm.source_ref,
      feature_id:     afm.feature_id,
      classification,
      padJoin:        padSrHit ? 'source_ref' : padFkHit ? 'feature_id' : null,
      ncpJoin:        ncpSrHit ? 'source_ref' : ncpFkHit ? 'feature_id' : null,
      rrpJoin:        rrpSrHit ? 'source_ref' : null,
      appJoin:        appSrHit ? 'source_ref' : appFkHit ? 'feature_key' : null,
      rootJoin:       rootFkHit ? 'feature_id' : null,
      qdrant_point_id: afm.qdrant_point_id ?? null,
      som_cluster:    afm.som_cluster ?? null,
    });
  }

  // 6. Also classify app registry rows that have no afm counterpart
  let appOnlyCount = 0;
  if (appRegistry) {
    for (const row of appRegistry) {
      for (const sr of (row.sourceRefs ?? [])) {
        const np = normalizePath(sr.replace(/^local:/, '').split('#')[0]);
        if (np && !padBySourceRef.has(np) && !ncpBySourceRef.has(np)) {
          appOnlyCount++;
          break;
        }
      }
    }
  }

  // 7. Proposed safe patch lane
  const exactPct   = afmRows.length ? (classCounts.EXACT_SOURCE_REF_JOIN / afmRows.length * 100).toFixed(1) : '0.0';
  const noJoinPct  = afmRows.length ? (classCounts.NO_JOIN / afmRows.length * 100).toFixed(1) : '0.0';
  const patchRecommendation =
    parseFloat(noJoinPct) < 10
      ? 'PATCH_SAFE — majority of rows are deterministic joins; backfill via source_ref upsert'
      : parseFloat(noJoinPct) < 30
      ? 'PATCH_REVIEW — moderate no-join rate; manual spot-check recommended before backfill'
      : 'PATCH_DEFERRED — high no-join rate; resolve source_ref gaps in atlas_feature_map first';

  if (client) await client.end();

  // 8. Build report
  const report = {
    generatedAt:   new Date().toISOString(),
    mode:          'read-only',
    dbAvailable,
    afmSampleSize: afmRows.length,
    appRegistryRows:  appRegistry?.length  ?? 0,
    rootRegistryRows: rootRegistry?.length ?? 0,
    classification: classCounts,
    summary: {
      joined:       afmRows.length - classCounts.NO_JOIN,
      noJoin:       classCounts.NO_JOIN,
      exactPct:     `${exactPct}%`,
      noJoinPct:    `${noJoinPct}%`,
      appOnlyRows:  appOnlyCount,
      patchRecommendation,
    },
    topMissingSourceRefs: [...new Set(missingSourceRefs)].slice(0, 30),
    topMissingFeatureIds: [...new Set(missingFeatureIds)].slice(0, 30),
    sampleRows: rows.slice(0, 50),
    sources: {
      appRegistry:   APP_REGISTRY_PATH,
      rootRegistry:  repoRegistry ? REPO_REGISTRY_PATH : EXTERNAL_REGISTRY_PATH,
      syncReport:    SYNC_REPORT_PATH,
    },
  };

  // 9. Write outputs
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');

  // 10. Machine-readable summary to stdout
  console.log(JSON.stringify({
    ok: true,
    afmSampleSize:        report.afmSampleSize,
    joined:               report.summary.joined,
    noJoin:               report.summary.noJoin,
    exactPct:             report.summary.exactPct,
    noJoinPct:            report.summary.noJoinPct,
    patchRecommendation:  report.summary.patchRecommendation,
    classCounts:          report.classification,
    dbAvailable,
    outJson: OUT_JSON,
    outMd:   OUT_MD,
  }, null, 2));
}

// ── markdown renderer ──────────────────────────────────────────────────────────

function renderMarkdown(r) {
  const lines = [];
  lines.push('# Parent Atlas Overlay Crosswalk Report');
  lines.push('');
  lines.push(`Generated: ${r.generatedAt} | mode: ${r.mode} | db: ${r.dbAvailable ? 'connected' : 'offline'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| atlas_feature_map sample | ${r.afmSampleSize} rows |`);
  lines.push(`| app registry rows | ${r.appRegistryRows} |`);
  lines.push(`| root registry rows | ${r.rootRegistryRows} |`);
  lines.push(`| joined | ${r.summary.joined} |`);
  lines.push(`| no-join | ${r.summary.noJoin} (${r.summary.noJoinPct}) |`);
  lines.push(`| exact source_ref joins | ${r.classification.EXACT_SOURCE_REF_JOIN} (${r.summary.exactPct}) |`);
  lines.push(`| app-inventory-only | ${r.classification.APP_INVENTORY_ONLY} |`);
  lines.push(`| app-only (no live table) | ${r.summary.appOnlyRows} |`);
  lines.push(`| **patch recommendation** | **${r.summary.patchRecommendation}** |`);
  lines.push('');
  lines.push('## Classification Breakdown');
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('|---------------|-------|');
  for (const [k, v] of Object.entries(r.classification)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');
  lines.push('## Top Missing source_refs (NO_JOIN rows)');
  lines.push('');
  if (r.topMissingSourceRefs.length === 0) {
    lines.push('None — all sampled rows have joins.');
  } else {
    for (const sr of r.topMissingSourceRefs) lines.push(`- \`${sr}\``);
  }
  lines.push('');
  lines.push('## Top Missing feature_ids (NO_JOIN rows)');
  lines.push('');
  if (r.topMissingFeatureIds.length === 0) {
    lines.push('None.');
  } else {
    for (const fid of r.topMissingFeatureIds) lines.push(`- \`${fid}\``);
  }
  lines.push('');
  lines.push('## Sample Rows (first 20)');
  lines.push('');
  lines.push('| source_ref | classification | padJoin | appJoin |');
  lines.push('|-----------|----------------|---------|---------|');
  for (const row of r.sampleRows.slice(0, 20)) {
    const sr = (row.source_ref ?? '').slice(-60);
    lines.push(`| \`${sr}\` | ${row.classification} | ${row.padJoin ?? '—'} | ${row.appJoin ?? '—'} |`);
  }
  lines.push('');
  lines.push('## Patch Recommendation');
  lines.push('');
  lines.push(r.summary.patchRecommendation);
  lines.push('');
  lines.push('After reviewing this report:');
  lines.push('- If `PATCH_SAFE`: run `npm run atlas:parent-atlas:promote --dry-run` to preview upserts');
  lines.push('- If `PATCH_REVIEW`: spot-check the NO_JOIN rows for broken source_refs before patching');
  lines.push('- If `PATCH_DEFERRED`: fix source_ref population in `atlas_feature_map` first');
  return lines.join('\n');
}

main().catch(err => {
  process.stderr.write(`[crosswalk] fatal: ${err.message}\n`);
  process.exit(1);
});
