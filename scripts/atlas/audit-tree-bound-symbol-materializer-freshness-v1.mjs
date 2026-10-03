#!/usr/bin/env node

/**
 * Bounded, read-only audit that prevents the historical materializer adapter
 * receipt from being mistaken for the current 461-row registry plan.
 *
 * This intentionally does not regenerate nominations, resolve symbols, or
 * write database state. It compares small JSON receipts and reads registry
 * key-prefix counts only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { assertResourceHeadroom } from './lib/resource-headroom.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
assertResourceHeadroom(root, {
  ...process.env,
  ATLAS_MIN_FREE_DISK_BYTES: String(1 * 1024 ** 3),
  ATLAS_MIN_FREE_MEMORY_BYTES: String(512 * 1024 ** 2),
});
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const currentPlanPath = path.resolve(root, 'docs/reports/current-tree-bound-symbol-registry-input-v1.json');
const currentResolutionPath = path.resolve(root, 'docs/reports/tree-bound-symbol-registry-resolution-v2.json');
const adapterReportPath = path.resolve(root, 'docs/reports/current-materializer-symbol-resolution-adapter-v1.json');
const outputPath = path.resolve(root, 'docs/reports/current-materializer-symbol-resolution-freshness-audit-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const relative = (filePath) => path.relative(root, filePath).replaceAll('\\', '/');

const [currentPlan, currentResolution, adapterReport] = await Promise.all([
  readJson(currentPlanPath),
  readJson(currentResolutionPath),
  readJson(adapterReportPath),
]);

const pool = new pg.Pool({ connectionString });
let registryKeyPrefixes;
try {
  const result = await pool.query(`
    SELECT split_part(canonical_key, ':', 1) AS prefix, count(*)::int AS count
    FROM atlas_symbol_registry
    WHERE status = 'active'
    GROUP BY split_part(canonical_key, ':', 1)
    ORDER BY prefix
  `);
  registryKeyPrefixes = result.rows;
} finally {
  await pool.end();
}

const checks = {
  currentPlanExists: currentPlan.entryCount === 461,
  currentPlanChecksumPresent: typeof currentPlan.planChecksum === 'string' && currentPlan.planChecksum.startsWith('sha256:'),
  currentResolutionMatchesPlan:
    currentResolution.inputRowCount === currentPlan.entryCount &&
    currentResolution.inputPlanChecksum === currentPlan.planChecksum,
  adapterIsCurrentCohort:
    adapterReport.counts?.input === currentPlan.entryCount &&
    adapterReport.inputPlanChecksum === currentPlan.planChecksum,
  adapterCarriesCurrentWorkspaceRevision: typeof adapterReport.workspaceRevision === 'string',
  adapterPromotionClosed: adapterReport.canonicalWrites === 0 &&
    adapterReport.databaseWrites === 0 &&
    adapterReport.canonicalAuthority === false,
};

const staleReasons = [];
if (!checks.adapterIsCurrentCohort) staleReasons.push('ADAPTER_INPUT_COHORT_NOT_CURRENT_461_ROW_PLAN');
if (!checks.adapterCarriesCurrentWorkspaceRevision) staleReasons.push('ADAPTER_RECEIPT_MISSING_WORKSPACE_REVISION_BINDING');
if (!checks.currentResolutionMatchesPlan) staleReasons.push('CURRENT_RESOLUTION_PLAN_PARITY_FAILED');

const report = {
  schema: 'atlas.current-materializer-symbol-resolution-freshness-audit.v1',
  status: staleReasons.length === 0 ? 'CURRENT_ADAPTER_PARITY_REVIEW_REQUIRED' : 'HISTORICAL_ADAPTER_SUPERSEDED_FOR_CURRENT_COHORT',
  currentPlan: {
    path: relative(currentPlanPath),
    entryCount: currentPlan.entryCount,
    planChecksum: currentPlan.planChecksum ?? null,
    workspaceRevision: currentPlan.currentWorkspaceRevision ?? null,
    promotionAuthorized: currentPlan.promotionAuthorized ?? false,
  },
  currentResolution: {
    path: relative(currentResolutionPath),
    inputRowCount: currentResolution.inputRowCount ?? null,
    inputPlanChecksum: currentResolution.inputPlanChecksum ?? null,
    exactCanonicalKey: currentResolution.counts?.exactCanonicalKey ?? null,
    symbolVersionBound: currentResolution.counts?.symbolVersionBound ?? null,
    promotionAuthorized: currentResolution.promotionAuthorized ?? false,
  },
  historicalAdapter: {
    path: relative(adapterReportPath),
    inputCount: adapterReport.counts?.input ?? null,
    treeBound: adapterReport.counts?.treeBound ?? null,
    canonical: adapterReport.counts?.canonical ?? null,
    outputChecksum: adapterReport.outputChecksum ?? null,
    inputPlanChecksum: adapterReport.inputPlanChecksum ?? null,
    workspaceRevision: adapterReport.workspaceRevision ?? null,
  },
  registryKeyPrefixes,
  checks,
  staleReasons,
  canonicalAuthority: false,
  canonicalWrites: 0,
  databaseWrites: 0,
  readOnly: true,
  nextGate: 'REGENERATE_CURRENT_SYMBOL_INPUT_FROM_ADMITTED_WORKSPACE_OWNER',
};

const tempPath = `${outputPath}.tmp-${process.pid}`;
await fs.writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.rename(tempPath, outputPath);
console.log(JSON.stringify(report, null, 2));
