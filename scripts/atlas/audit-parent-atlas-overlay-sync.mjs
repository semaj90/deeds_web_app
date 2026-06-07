#!/usr/bin/env node
/**
 * audit-parent-atlas-overlay-sync.mjs
 *
 * Audits the overlay relationship between the repo-root feature catalog and
 * the app-side feature registry, or between the external deployment taxonomy
 * and the app catalog.
 *
 * Classification vocabulary:
 *   CATALOG_ALIGNED      — same schema, high key overlap (repo-root ↔ app)
 *   TAXONOMY_MISMATCH    — disjoint schemas (deployment taxonomy ↔ app catalog)
 *                          expected; solved by crosswalk, not merge
 *   CROSSWALK_REQUIRED   — ≥1 deployment lane has zero app matches
 *   NO_CROSSWALK_REPORT  — crosswalk output missing (run crosswalk-root-overlay.mjs first)
 *
 * Usage:
 *   node scripts/atlas/audit-parent-atlas-overlay-sync.mjs
 *   node scripts/atlas/audit-parent-atlas-overlay-sync.mjs --json
 *   node scripts/atlas/audit-parent-atlas-overlay-sync.mjs --source=repo-root
 *   node scripts/atlas/audit-parent-atlas-overlay-sync.mjs --source=external-codex
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const JSON_MODE = process.argv.includes('--json');
const SOURCE_ARG = process.argv.find(a => a.startsWith('--source='))?.split('=')[1] ?? 'repo-root';

const ROOT_REGISTRY_PATH  = path.join(ROOT, 'docs', 'atlas', 'feature-registry.json');
const APP_REGISTRY_PATH   = path.join(ROOT, 'sveltekit-frontend', 'docs', 'atlas', 'feature-registry.json');
const CROSSWALK_JSON_PATH = path.join(ROOT, 'docs', 'reports', 'parent-atlas-crosswalk.json');

function out(obj) {
  if (JSON_MODE) { console.log(JSON.stringify(obj, null, 2)); return; }
  const icons = {
    CATALOG_ALIGNED:     '✅',
    TAXONOMY_MISMATCH:   '🔀',
    CROSSWALK_REQUIRED:  '❌',
    NO_CROSSWALK_REPORT: '⚠️',
  };
  const icon = icons[obj.classification] ?? '❓';
  console.log(`\n── Parent Atlas Overlay Sync Audit ────────────────────────────`);
  console.log(`  ${icon} ${obj.classification}`);
  console.log(`  Source mode    : ${obj.sourceMode}`);
  console.log(`  Root registry  : ${obj.rootRegistryPath}`);
  console.log(`  App registry   : ${obj.appRegistryPath}`);
  if (obj.rootRows != null)      console.log(`  Root rows      : ${obj.rootRows}`);
  if (obj.appRows != null)       console.log(`  App rows       : ${obj.appRows}`);
  if (obj.overlap != null)       console.log(`  Key overlap    : ${obj.overlap}`);
  if (obj.rootMissingInApp != null) console.log(`  rootMissingInApp: ${obj.rootMissingInApp}`);
  if (obj.appMissingInRoot != null) console.log(`  appMissingInRoot: ${obj.appMissingInRoot}`);
  if (obj.rootMatchedCount != null) console.log(`  Lanes matched  : ${obj.rootMatchedCount}/${obj.rootCount}`);
  if (obj.unmatchedIds?.length) {
    console.log(`  Unmatched lanes:`);
    for (const id of obj.unmatchedIds) console.log(`    ✗ ${id}`);
  }
  if (obj.reportAge) console.log(`  Crosswalk age  : ${obj.reportAge}`);
  if (obj.nextAction) console.log(`\n  Next: ${obj.nextAction}`);
  console.log('');
}

// ── repo-root ↔ app catalog comparison ────────────────────────────────────────
function auditCatalogAlignment() {
  const rootExists = fs.existsSync(ROOT_REGISTRY_PATH);
  const appExists  = fs.existsSync(APP_REGISTRY_PATH);

  if (!rootExists || !appExists) {
    out({
      classification: 'NO_CROSSWALK_REPORT',
      sourceMode: SOURCE_ARG,
      rootRegistryPath: ROOT_REGISTRY_PATH,
      appRegistryPath: APP_REGISTRY_PATH,
      nextAction: !rootExists
        ? 'Root registry missing — run: npm run atlas:overlay:crosswalk'
        : 'App registry missing — run: cd sveltekit-frontend && npm run graphify:daily',
    });
    process.exit(1);
  }

  const rootReg = JSON.parse(fs.readFileSync(ROOT_REGISTRY_PATH, 'utf8'));
  const appReg  = JSON.parse(fs.readFileSync(APP_REGISTRY_PATH, 'utf8'));

  if (!Array.isArray(rootReg) || !Array.isArray(appReg)) {
    out({
      classification: 'NO_CROSSWALK_REPORT',
      sourceMode: SOURCE_ARG,
      rootRegistryPath: ROOT_REGISTRY_PATH,
      appRegistryPath: APP_REGISTRY_PATH,
      nextAction: 'One or both registries is not an array — check file format',
    });
    process.exit(1);
  }

  const rootKeys = new Set(rootReg.map(r => r.featureKey).filter(Boolean));
  const appKeys  = new Set(appReg.map(r => r.featureKey).filter(Boolean));

  let overlap = 0;
  for (const k of rootKeys) if (appKeys.has(k)) overlap++;
  const rootMissingInApp = rootKeys.size - overlap;
  const appMissingInRoot = appKeys.size - overlap;

  // CATALOG_ALIGNED: same schema (featureKey present), high overlap
  const overlapRatio = rootKeys.size > 0 ? overlap / rootKeys.size : 0;
  const classification = overlapRatio >= 0.99 && rootMissingInApp === 0
    ? 'CATALOG_ALIGNED'
    : 'TAXONOMY_MISMATCH';

  out({
    classification,
    sourceMode: 'repo-root',
    rootRegistryPath: ROOT_REGISTRY_PATH,
    appRegistryPath: APP_REGISTRY_PATH,
    rootRows: rootReg.length,
    appRows: appReg.length,
    overlap,
    rootMissingInApp,
    appMissingInRoot,
    nextAction: classification === 'CATALOG_ALIGNED'
      ? 'Catalog aligned. Proceed to crosswalk audit: npm run atlas:overlay:sync:audit --source=external-codex'
      : 'Registry schema mismatch — run crosswalk: npm run atlas:overlay:crosswalk',
  });

  process.exit(classification === 'CATALOG_ALIGNED' ? 0 : 1);
}

// ── external deployment taxonomy ↔ app catalog comparison ─────────────────────
function auditExternalCrosswalk() {
  if (!fs.existsSync(CROSSWALK_JSON_PATH)) {
    out({
      classification: 'NO_CROSSWALK_REPORT',
      sourceMode: 'external-codex',
      rootRegistryPath: CROSSWALK_JSON_PATH,
      appRegistryPath: APP_REGISTRY_PATH,
      nextAction: 'Run: npm run atlas:overlay:crosswalk',
    });
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(CROSSWALK_JSON_PATH, 'utf8'));
  const ageMs = Date.now() - new Date(report.generatedAt).getTime();
  const reportAge = `${(ageMs / 1000 / 3600).toFixed(1)}h ago (${report.generatedAt})`;

  const unmatchedIds = (report.crosswalk ?? [])
    .filter(e => !e.appMatches || e.appMatches.length === 0)
    .map(e => e.feature_id);

  // TAXONOMY_MISMATCH is expected (disjoint schemas); only fail on CROSSWALK_REQUIRED
  const classification = unmatchedIds.length === 0 ? 'TAXONOMY_MISMATCH' : 'CROSSWALK_REQUIRED';

  out({
    classification,
    sourceMode: 'external-codex',
    rootRegistryPath: report.externalRootPath ?? 'external-codex-registry',
    appRegistryPath: APP_REGISTRY_PATH,
    rootCount: report.rootCount,
    rootMatchedCount: report.rootMatchedCount,
    rootUnmatchedCount: report.rootUnmatchedCount,
    appRows: report.appCount,
    unmatchedIds: unmatchedIds.length > 0 ? unmatchedIds : undefined,
    reportAge,
    nextAction: classification === 'TAXONOMY_MISMATCH'
      ? 'All deployment lanes have app matches (taxonomy mismatch is expected). Lane 2 complete.'
      : `${unmatchedIds.length} lanes need app registry entries or manual crosswalk — run: npm run atlas:overlay:crosswalk`,
  });

  // TAXONOMY_MISMATCH exits 0 (expected state); CROSSWALK_REQUIRED exits 1
  process.exit(classification === 'TAXONOMY_MISMATCH' ? 0 : 1);
}

// ── dispatch ───────────────────────────────────────────────────────────────────
if (SOURCE_ARG === 'external-codex') {
  auditExternalCrosswalk();
} else {
  auditCatalogAlignment();
}
