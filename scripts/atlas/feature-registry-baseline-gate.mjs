#!/usr/bin/env node
/**
 * Read-only admission gate for the feature_registry migration baseline.
 * It combines already-produced evidence; it never connects to or mutates DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(root, 'docs/reports/feature-registry-baseline-admission-v1.json');
const paths = {
  disposable: path.join(root, 'docs/reports/feature-registry-disposable-proof-v1.json'),
  owner: path.join(root, 'docs/reports/feature-registry-owner-decision-v1.json'),
  audit: path.join(root, 'docs/reports/atlas-migration-owner-audit-v1.json'),
  mirrors: path.join(root, 'docs/reports/postgres-contract-mirrors-report.json'),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const disposable = readJson(paths.disposable);
  const owner = readJson(paths.owner);
  const audit = readJson(paths.audit);
  const mirrors = readJson(paths.mirrors);
  const missingRegistration = audit.summary?.missingManifestRegistration?.includes('feature_registry') ?? false;
  const disposableProven = disposable.status === 'DISPOSABLE_POSTGRES_PROVEN';
  const liveAbsent = owner.live?.tablePresent === false;
  const ledgerUnreconciled = owner.live?.migrationLedgersReconciled === false;
  const status = disposableProven && liveAbsent && ledgerUnreconciled && missingRegistration
    ? 'BASELINE_PROVEN_LIVE_APPLY_BLOCKED'
    : 'BASELINE_REVIEW_REQUIRED';
  const report = {
    schema: 'atlas.feature-registry-baseline-admission.v1',
    updatedAt: new Date().toISOString(),
    status,
    evidence: {
      disposablePostgres: { status: disposable.status, report: path.relative(root, paths.disposable).replaceAll('\\', '/') },
      ownerDecision: { status: owner.status, report: path.relative(root, paths.owner).replaceAll('\\', '/') },
      liveOwnerAudit: { featureRegistry: missingRegistration ? 'MISSING_MANIFEST_REGISTRATION' : 'NOT_MISSING' },
      contractMirrors: { tablesChecked: mirrors.summary?.tablesChecked ?? null, liveAligned: mirrors.summary?.liveAligned ?? null },
    },
    checks: {
      disposableHistoricalChain: disposableProven,
      liveFeatureRegistryAbsent: liveAbsent,
      migrationLedgersUnreconciled: ledgerUnreconciled,
      ownerManifestMissingRegistration: missingRegistration,
    },
    writes: { database: false, migrationLedger: false, production: false },
    decision: 'Do not run drizzle-kit migrate, ledger repair, or feature_registry apply from this receipt.',
    likely_cause: 'Historical migration SQL is proven in isolation, but the live migration ledger and owner manifest are not reconciled.',
    evidenceRefs: Object.values(paths).map((file) => path.relative(root, file).replaceAll('\\', '/')),
    safe_next_command: 'node scripts/atlas/audit-atlas-migration-owners.mjs',
    smoke_command: 'node scripts/atlas/feature-registry-baseline-gate.mjs',
    report_path: 'docs/reports/feature-registry-baseline-admission-v1.json',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status, report: path.relative(root, reportPath).replaceAll('\\', '/'), writes: report.writes }, null, 2));
  if (status !== 'BASELINE_PROVEN_LIVE_APPLY_BLOCKED') process.exitCode = 1;
}

main();

