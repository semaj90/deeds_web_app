#!/usr/bin/env node

/**
 * Read-only migration baseline decision planner.
 *
 * This consumes existing inventory/owner receipts and records an explicit
 * review baseline. It never changes a migration ledger, schema, or SQL file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.join(root, 'docs/reports/migration-baseline-decision-v1.json');
const inputPaths = {
  inventory: path.join(root, 'docs/reports/migration-inventory-classification-v1.json'),
  owner: path.join(root, 'docs/reports/feature-registry-owner-decision-v1.json'),
  featureGate: path.join(root, 'docs/reports/feature-registry-baseline-admission-v1.json'),
  critical: path.join(root, 'docs/reports/critical-lineage-migration-dispositions-v1.json'),
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const inventory = readJson(inputPaths.inventory);
  const owner = readJson(inputPaths.owner);
  const featureGate = readJson(inputPaths.featureGate);
  const critical = readJson(inputPaths.critical);
  const rows = Array.isArray(inventory.rows) ? inventory.rows : [];

  const by = (classification) => rows.filter((row) => row.classification === classification);
  const unresolved = by('UNRESOLVED');
  const accepted = [...by('JOURNALED_CANONICAL'), ...by('ACCEPTED_HISTORICAL')];
  const deferred = by('DEFERRED');
  const sidecars = by('DECLARED_SIDECAR');

  const report = {
    schema: 'atlas.migration-baseline-decision.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_PLANNING',
    status: unresolved.length === 0
      ? 'BASELINE_READY_FOR_OPERATOR_APPROVAL'
      : 'BASELINE_INVENTORIED_APPLY_BLOCKED',
    writesPerformed: false,
    mutationPolicy: {
      migrationLedgerChanged: false,
      migrationApplied: false,
      featureRegistryApplied: false,
      sqlMovedOrDeleted: false,
    },
    inventory: {
      report: 'docs/reports/migration-inventory-classification-v1.json',
      sqlFiles: inventory.counts?.sqlFiles ?? rows.length,
      journalEntries: inventory.counts?.journalEntries ?? null,
      sidecarEntries: inventory.counts?.sidecarEntries ?? null,
      acceptedHistory: {
        count: accepted.length,
        classifications: ['JOURNALED_CANONICAL', 'ACCEPTED_HISTORICAL'],
        paths: accepted.map((row) => row.path),
      },
      declaredSidecars: {
        count: sidecars.length,
        classification: 'DECLARED_SIDECAR_NOT_PROOF_OF_LIVE_APPLICATION',
        paths: sidecars.map((row) => row.path),
      },
      deferredProposals: {
        count: deferred.length,
        paths: deferred.map((row) => row.path),
      },
      unresolvedCurrentOwners: {
        count: unresolved.length,
        byOwnerDomain: inventory.counts?.unresolvedByOwnerDomain ?? {},
        action: 'ROW_BY_ROW_OWNER_RECONCILIATION_REQUIRED',
      },
    },
    canonicalOwnerDecision: {
      featureRegistry: {
        status: owner.status,
        candidate: owner.canonicalOwnerCandidate ?? null,
        applyDecision: owner.applyDecision ?? 'BLOCKED_UNTIL_BASELINE_APPROVAL',
        live: owner.live ?? null,
        competingDefinitions: owner.competingDefinitions ?? [],
      },
      migrationLedger: {
        owner: 'sveltekit-frontend/drizzle/meta/_journal.json',
        status: 'PARTIAL_HISTORY_REQUIRES_BASELINE_RECONCILIATION',
        liveLedgerReconciled: false,
      },
    },
    supportingEvidence: {
      featureRegistryBaselineGate: {
        report: 'docs/reports/feature-registry-baseline-admission-v1.json',
        status: featureGate.status ?? null,
      },
      criticalLineageDispositions: {
        report: 'docs/reports/critical-lineage-migration-dispositions-v1.json',
        status: critical.status ?? null,
        unresolvedCurrentOwners: critical.counts?.unresolvedCurrentOwners ?? null,
      },
    },
    decision: {
      acceptedHistory: 'RETAIN_AS_EVIDENCE_ONLY',
      appliedOutsideDrizzleHistory: 'REQUIRES_LIVE_READBACK_BEFORE_ACCEPTANCE',
      deferredProposals: 'RETAIN_UNAPPLIED_AND_EXCLUDED_FROM_AUTHORITY',
      unresolvedProposals: 'DO_NOT_APPLY_OR_REGISTER',
      nextGate: unresolved.length === 0
        ? 'OPERATOR_APPROVE_BASELINE_AND_SHAPE'
        : 'RESOLVE_UNRESOLVED_CURRENT_OWNERS_ROW_BY_ROW',
    },
    safeNextCommand: 'node scripts/atlas/audit-migration-inventory-classification-v1.mjs',
    smokeCommand: 'npx openspec validate manual-migration-reconciliation --strict',
    reportPath: 'docs/reports/migration-baseline-decision-v1.json',
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tmp = `${reportPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, reportPath);
  console.log(JSON.stringify({
    status: report.status,
    unresolvedCurrentOwners: unresolved.length,
    reportPath: 'docs/reports/migration-baseline-decision-v1.json',
    writesPerformed: false,
  }, null, 2));
  if (unresolved.length > 0) process.exitCode = 1;
}

main();
