#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'docs/reports/parent-atlas-governed-audit-v1.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const checks = [];
function expect(condition, message) {
  checks.push({ name: message, passed: Boolean(condition) });
  if (!condition) throw new Error(message);
}

expect(report.schema === 'atlas.parent-atlas-governed-audit.v1', 'governed audit schema is stable');
expect(report.status === 'COMPLETE_READ_ONLY_AUDIT', 'governed audit completed read-only');
expect(report.steps?.length === 23, 'governed audit has 23 steps');
expect(report.steps?.every((step) => step.writesPerformed === false), 'every step is write-free');

const requiredSteps = [
  'SOURCE_OWNER_RECONCILIATION',
  'SOURCE_AUTHORITY_REPAIR_PLAN',
  'SOURCE_COHORT_LINEAGE',
  'WORKSPACE_FRAME_ADMISSION',
  'LINEAGE_CLOSURE',
  'AST_HASH_COLUMN_CONTRACT',
  'AST_HASH_GRAIN_CLASSIFICATION',
  'AST_OFFSET_BASIS_PROOF',
  'AST_DIGEST_DIVERGENCE',
  'AST_CONFLICT_DISPOSITION',
  'AST_CANARY_READINESS',
  'STRUCTURAL_PROVENANCE_RUNTIME',
  'ONTOLOGY_POPULATION_DECISION',
  'PACKET_SOURCE_SCOPE',
  'EXECUTION_CONTROLLER',
  'AUTHORITY_TEXT_REVIEW',
  'ACTIONABLE_RANKER',
  'CAPABILITY_CENSUS',
  'AWARENESS_READINESS',
  'TOURNAMENT_OWNER',
  'TOURNAMENT_SEAM',
  'RECEIPT_OWNER',
  'RECEIPT_SCHEMA',
];
expect(JSON.stringify(report.order) === JSON.stringify(requiredSteps), 'governed audit order includes lineage gates');

const lineage = report.lineageSubgates;
expect(lineage && lineage.astCanary && lineage.astHashContract && lineage.astHashGrain && lineage.astOffsetBasis && lineage.astDigestDivergence && lineage.astConflictDisposition && lineage.ontology && lineage.packetScope, 'lineage sub-gates are projected');
expect(lineage.astHashContract.canonicalAuthority === false && lineage.astHashContract.writesPerformed === false, 'AST hash contract remains non-authoritative');
expect(lineage.astHashContract.nextGate === 'CLASSIFY_LEGACY_HASH_GRAIN_BEFORE_SUPERSESSION', 'AST hash contract blocks supersession until classification');
expect(lineage.astOffsetBasis.status === 'BOM_OFFSET_BASIS_PROVEN', 'BOM offset basis is proven read-only');
expect(lineage.astOffsetBasis.canonicalAuthority === false && lineage.astOffsetBasis.writesPerformed === false, 'BOM offset proof remains non-authoritative');
expect(lineage.astHashGrain.canonicalAuthority === false && lineage.astHashGrain.writesPerformed === false, 'hash grain classification remains non-authoritative');
expect(lineage.astHashGrain.policy?.onlyExplicitColumnParityEstablishesClassification === true, 'hash grain classification uses explicit column parity');
expect(lineage.astDigestDivergence.sourceCount >= 0 && lineage.astDigestDivergence.canonicalAuthority === false, 'digest divergence remains diagnostic');
expect(lineage.astConflictDisposition.supersessionProposalsAllowed === 0 && lineage.astConflictDisposition.canonicalAuthority === false, 'structural conflicts cannot authorize supersession');
expect(report.sourceAuthorityChain?.repairPlan && report.sourceAuthorityChain?.cohort && report.sourceAuthorityChain?.workspaceFrame && report.sourceAuthorityChain?.closure, 'source authority chain is projected');
expect(report.sourceAuthorityChain.repairPlan.canonicalAuthority === false && report.sourceAuthorityChain.repairPlan.writesPerformed === false, 'repair plan remains non-authoritative');
expect(report.sourceAuthorityChain.workspaceFrame.promotionEligible === false, 'workspace frame cannot authorize promotion');
expect(report.sourceAuthorityChain.closure.canonicalAuthority === false && report.sourceAuthorityChain.closure.writesPerformed === false, 'lineage closure remains non-authoritative');
expect(report.sourceAuthorityChain.closure.counts?.workspaceSources === 52, 'lineage closure projects workspace source count');
expect(report.sourceAuthorityChain.closure.counts?.candidateOrdinalEligible === 0, 'lineage closure projects blocked candidate eligibility');
expect(lineage.astCanary.canonicalAuthority === false && lineage.astCanary.writesPerformed === false, 'AST gate remains non-authoritative');
expect(lineage.ontology.canonicalAuthority === false && lineage.ontology.writesPerformed === false, 'ontology gate remains non-authoritative');
expect(lineage.packetScope.canonicalAuthority === false && lineage.packetScope.writesPerformed === false, 'packet scope remains non-authoritative');
expect(lineage.packetScope.folderCount > 0 && lineage.packetScope.packetRows > 0, 'packet scope carries measured coverage');
expect(Number.isInteger(lineage.ontology.unresolvedTuples) && lineage.ontology.unresolvedTuples >= 0, 'ontology carries unresolved tuple count');

for (const file of [
  'openspec-authority-text-review-v1.json',
  'actionable-workboard-v3.json',
]) {
  const value = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports', file), 'utf8'));
  expect(
    typeof value.semanticChecksum === 'string'
      && (/^sha256:[0-9a-f]{64}$/i.test(value.semanticChecksum) || /^[0-9a-f]{64}$/i.test(value.semanticChecksum)),
    `${file} has a deterministic checksum`,
  );
}

console.log(JSON.stringify({
  status: 'PASS',
  checks: checks.length,
  failed: checks.filter((check) => !check.passed).length,
  canonicalAuthority: false,
  writesPerformed: false,
}, null, 2));
