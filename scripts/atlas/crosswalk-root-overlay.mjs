#!/usr/bin/env node
/**
 * crosswalk-root-overlay.mjs
 *
 * Bridges the external root atlas registry (18 deployment-lane entries with
 * feature_id / storage_lane / retrieval_lane schema) against the app-side
 * feature registry (4,209 feature-catalog entries with featureKey / title /
 * status / sourceRefs schema).
 *
 * The two registries use disjoint taxonomies — this script produces:
 *   1. A crosswalk table (JSON) mapping each root feature_id to matching
 *      app featureKeys by keyword overlap in title/summary/sourceRefs.
 *   2. A markdown report with alignment gaps and recommended next actions.
 *
 * Does NOT modify either registry. Run audit-parent-atlas-overlay-sync.mjs
 * after reviewing the crosswalk output to decide which root entries to promote
 * into the app registry.
 *
 * Usage:
 *   node scripts/atlas/crosswalk-root-overlay.mjs [--dry-run]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const APP_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const EXTERNAL_ROOT = 'C:\\Users\\james\\Documents\\Codex\\2026-05-12\\ve-updated-the-local-quantization-notebook\\docs\\atlas\\feature-registry.json';
const APP_REGISTRY = path.join(APP_ROOT, 'docs', 'atlas', 'feature-registry.json');
const REPO_REGISTRY = path.join(REPO_ROOT, 'docs', 'atlas', 'feature-registry.json');

const OUT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(OUT_DIR, 'parent-atlas-crosswalk.json');
const OUT_MD = path.join(OUT_DIR, 'parent-atlas-crosswalk.md');

const DRY_RUN = process.argv.includes('--dry-run');

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

/** Tokenize a string into lowercase words for keyword overlap scoring. */
function tokenize(str) {
  if (!str) return new Set();
  return new Set(
    String(str).toLowerCase()
      .replace(/[^a-z0-9_]+/g, ' ')
      .split(' ')
      .filter(w => w.length > 2)
  );
}

/** Jaccard-like overlap score between two token sets. */
function overlapScore(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let hits = 0;
  for (const t of setA) if (setB.has(t)) hits++;
  return hits / Math.min(setA.size, setB.size);
}

/** Build keyword tokens for an app registry row. */
function appTokens(row) {
  const parts = [
    row.featureKey, row.title, row.summary,
    ...(row.sourceRefs || []),
    ...(row.missing || []),
  ];
  return tokenize(parts.join(' '));
}

/** Build keyword tokens for a root registry row. */
function rootTokens(row) {
  const parts = [
    row.feature_id, row.turbovecLabel, row.owner_file,
    row.storage_lane, row.retrieval_lane,
    ...(row.sourceRefs || []),
    ...(row.qdrantTags || []),
    row.nextAction,
  ];
  return tokenize(parts.join(' '));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Parent Atlas Overlay Crosswalk');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- External root entries: **${report.rootCount}**`);
  lines.push(`- App registry entries: **${report.appCount}**`);
  lines.push(`- Root entries with ≥1 app match: **${report.rootMatchedCount}**`);
  lines.push(`- Root entries with zero app match: **${report.rootUnmatchedCount}**`);
  lines.push('');
  lines.push('## Root → App Crosswalk');
  lines.push('');
  lines.push('Each root lane mapped to the best-matching app features (score ≥ 0.15).');
  lines.push('');

  for (const entry of report.crosswalk) {
    lines.push(`### ${entry.feature_id}`);
    lines.push(`- status: ${entry.status}`);
    lines.push(`- storage_lane: ${entry.storage_lane || 'n/a'}`);
    lines.push(`- retrieval_lane: ${entry.retrieval_lane || 'n/a'}`);
    lines.push(`- nextAction: ${entry.nextAction || 'n/a'}`);
    if (entry.appMatches.length === 0) {
      lines.push(`- **APP MATCH: none** — needs new entry in app registry`);
    } else {
      lines.push(`- App matches (top ${entry.appMatches.length}):`);
      for (const m of entry.appMatches.slice(0, 5)) {
        lines.push(`  - [${m.score.toFixed(2)}] \`${m.featureKey}\` (${m.status}) — ${m.title}`);
      }
    }
    lines.push('');
  }

  lines.push('## Unmatched Root Entries (need app registry rows)');
  lines.push('');
  const unmatched = report.crosswalk.filter(e => e.appMatches.length === 0);
  if (unmatched.length === 0) {
    lines.push('None — all root lanes have app coverage.');
  } else {
    for (const e of unmatched) {
      lines.push(`- \`${e.feature_id}\` (${e.status}): ${e.nextAction || ''}`);
    }
  }
  lines.push('');

  lines.push('## Recommended Actions');
  lines.push('');
  lines.push('1. For each unmatched root lane, create a corresponding app registry entry with the root\'s `feature_id` as `featureKey`, `storage_lane`/`retrieval_lane` in `summary`, and `sourceRefs` linking the owner file.');
  lines.push('2. For matched lanes with `status: partial` or `status: missing` in the root, verify the linked app entries are also `partial` — sync status where they diverge.');
  lines.push('3. Re-run `audit-parent-atlas-overlay-sync.mjs` after promoting the unmatched entries to confirm `SCHEMA_AND_SQL_ALIGNED`.');

  return lines.join('\n');
}

async function main() {
  const [extExists, appExists, repoExists] = await Promise.all([
    exists(EXTERNAL_ROOT), exists(APP_REGISTRY), exists(REPO_REGISTRY),
  ]);

  if (!extExists) {
    console.error(JSON.stringify({ ok: false, error: 'EXTERNAL_ROOT_NOT_FOUND', path: EXTERNAL_ROOT }));
    process.exit(1);
  }
  if (!appExists) {
    console.error(JSON.stringify({ ok: false, error: 'APP_REGISTRY_NOT_FOUND', path: APP_REGISTRY }));
    process.exit(1);
  }

  const [rootRows, appRows] = await Promise.all([
    readJson(EXTERNAL_ROOT),
    readJson(APP_REGISTRY),
  ]);

  // Pre-compute tokens for app rows
  const appIndex = appRows.map(row => ({
    featureKey: row.featureKey,
    title: row.title,
    status: row.status,
    tokens: appTokens(row),
  }));

  const crosswalk = rootRows.map(rootRow => {
    const rt = rootTokens(rootRow);
    const matches = appIndex
      .map(a => ({ ...a, score: overlapScore(rt, a.tokens) }))
      .filter(a => a.score >= 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ featureKey, title, status, score }) => ({ featureKey, title, status, score }));

    return {
      feature_id: rootRow.feature_id,
      status: rootRow.status,
      storage_lane: rootRow.storage_lane,
      retrieval_lane: rootRow.retrieval_lane,
      nextAction: rootRow.nextAction,
      appMatches: matches,
    };
  });

  const rootMatchedCount = crosswalk.filter(e => e.appMatches.length > 0).length;

  const report = {
    generatedAt: new Date().toISOString(),
    rootCount: rootRows.length,
    appCount: appRows.length,
    rootMatchedCount,
    rootUnmatchedCount: rootRows.length - rootMatchedCount,
    crosswalk,
  };

  if (!DRY_RUN) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
    await fs.writeFile(OUT_MD, renderMarkdown(report), 'utf8');
  }

  const summary = {
    ok: true,
    rootCount: report.rootCount,
    appCount: report.appCount,
    rootMatchedCount: report.rootMatchedCount,
    rootUnmatchedCount: report.rootUnmatchedCount,
    dryRun: DRY_RUN,
    outJson: DRY_RUN ? null : OUT_JSON,
    outMd: DRY_RUN ? null : OUT_MD,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });