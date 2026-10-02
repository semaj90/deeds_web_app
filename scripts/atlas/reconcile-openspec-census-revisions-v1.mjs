import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const OUTPUT_PATH = process.env.OPENSPEC_RECONCILIATION_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_RECONCILIATION_OUTPUT)
  : path.join(REPORTS, 'openspec-evidence-census-reconciliation-v1.json');
const BASELINE_PATH = path.join(REPORTS, 'openspec-evidence-portfolio-census-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function latestCensusPath() {
  if (!process.env.OPENSPEC_CENSUS_PATH) throw new Error('OPENSPEC_CENSUS_PATH_REQUIRED');
  return path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH);
}

function delta(current, baseline) {
  return current - baseline;
}

export function reconcileOpenSpecCensusRevisionsV1({ baseline, census, identity, typeReport, orphan, predicates, source }) {
  if (baseline?.schema !== 'atlas.openspec-evidence-portfolio-census.v1') throw new Error('BASELINE_CENSUS_SCHEMA_UNSUPPORTED');
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CURRENT_CENSUS_SCHEMA_UNSUPPORTED');
  const base = baseline.summary ?? {};
  const current = census.summary ?? {};
  const identitySummary = identity?.summary ?? {};
  const typeSummary = typeReport?.summary ?? {};
  const orphanSummary = orphan?.summary ?? {};
  const predicateSummary = predicates?.summary ?? {};
  const objectiveBaseline = {
    changes: numeric(base.totalChanges),
    tasks: numeric(base.totalTasks),
    checked: numeric(base.checkedTasks),
    evidenceBackedChecked: numeric(base.checkedWithEvidence),
    orphanReceipts: numeric(base.orphanReceiptCount),
    missingDeclaredIds: numeric(base.taskIdMissing),
    duplicateIds: numeric(base.duplicateTaskIds),
    dependencyCycles: numeric(base.dependencyCycleCount),
  };
  const strictCurrent = {
    changes: numeric(current.totalChanges),
    tasks: numeric(current.totalTasks),
    checked: numeric(current.checkedTasks),
    evidenceBackedChecked: numeric(current.checkedWithEvidence),
    orphanReceipts: numeric(orphanSummary.missingTaskCount) + numeric(orphanSummary.trueOrphanCount),
    missingDeclaredIds: numeric(current.taskIdMissing),
    duplicateIds: numeric(current.duplicateTaskIds),
    duplicateDiagnosticGroups: numeric(identitySummary.duplicateDiagnosticGroupCount),
    canonicalCollisionGroups: numeric(identitySummary.canonicalKeyCollisionGroupCount),
    duplicateClassCounts: identitySummary.duplicateClassCounts ?? {},
    dependencyCycles: numeric(current.dependencyCycleCount),
    unresolvedIdentityTasks: numeric(identitySummary.identityStateCounts?.AMBIGUOUS) + numeric(identitySummary.identityStateCounts?.CONFLICTING),
    canonicalKeyCoverage: numeric(identitySummary.canonicalKeyCoverageCount),
    canonicalKeyAdmitted: numeric(identitySummary.canonicalKeyAdmittedCount),
    receiptCandidates: numeric(typeSummary.receiptCount),
    typedReceipts: numeric(typeSummary.schemaOrFieldTypedCount),
    candidateTypedReceipts: numeric(typeSummary.candidateTypeCount),
    unknownReceipts: numeric(typeSummary.unknownCount),
    ambiguousBindings: numeric(orphanSummary.ambiguousCount),
    staleBindings: numeric(orphanSummary.staleRevisionCount),
    blockedTasks: numeric(predicateSummary.blockedTaskCount),
    provenTasks: numeric(predicateSummary.proofStateCounts?.PROVEN),
  };
  const unsigned = {
    schema: 'atlas.openspec-evidence-census-reconciliation.v1',
    runId: process.env.OPENSPEC_EVIDENCE_RUN_ID ?? census.runId ?? null,
    status: 'RECONCILIATION_READ_ONLY_NOT_PROMOTABLE',
    mode: 'BASELINE_TO_REVISION_BOUND_STRICT_COMPARISON',
    workspaceRevision: census.source?.workspaceRevision ?? null,
    objectiveBaseline,
    strictCurrent,
    deltas: Object.fromEntries(['changes', 'tasks', 'checked', 'evidenceBackedChecked', 'dependencyCycles'].map((key) => [key, delta(strictCurrent[key] ?? 0, objectiveBaseline[key])])),
    diagnosticDeltas: {
      orphanReceipts: delta(strictCurrent.orphanReceipts, objectiveBaseline.orphanReceipts),
      missingDeclaredIds: delta(strictCurrent.missingDeclaredIds, objectiveBaseline.missingDeclaredIds),
      duplicateIds: delta(strictCurrent.duplicateIds, objectiveBaseline.duplicateIds),
    },
    comparability: {
      changes: 'COMPARABLE',
      tasks: 'COMPARABLE',
      checked: 'COMPARABLE',
      evidenceBackedChecked: 'COMPARABLE',
      dependencyCycles: 'COMPARABLE',
      orphanReceipts: 'DIAGNOSTIC_CORPUS_AND_BINDING_RULES_DIFFER',
      missingDeclaredIds: 'BASELINE_DECLARED_ID_SCAN_VS_STRICT_IDENTITY_SCAN',
      duplicateIds: 'BASELINE_GROUP_COUNT_VS_STRICT_PAIR_COUNT',
    },
    baselineParity: {
      changes: objectiveBaseline.changes === strictCurrent.changes,
      tasks: objectiveBaseline.tasks === strictCurrent.tasks,
      checked: objectiveBaseline.checked === strictCurrent.checked,
      dependencyCycles: objectiveBaseline.dependencyCycles === strictCurrent.dependencyCycles,
    },
    interpretation: {
      baselineIsHistoricalSnapshot: true,
      strictCurrentIsRevisionBound: true,
      missingDeclaredIdIsNotMissingIdentity: true,
      candidateTypeIsNotProof: true,
      ambiguousBindingIsNotProof: true,
      projectionsAreRebuildable: true,
    },
    source: {
      baseline: relative(BASELINE_PATH),
      census: relative(source.censusPath),
      identity: process.env.OPENSPEC_IDENTITY_RECOVERY_PATH ?? 'docs/reports/openspec-task-identity-recovery-v1.json',
      receiptTypes: process.env.OPENSPEC_RECEIPT_TYPES_PATH ?? 'docs/reports/openspec-receipt-type-classification-v1.json',
      orphanBindings: process.env.OPENSPEC_ORPHAN_BINDINGS_PATH ?? 'docs/reports/openspec-orphan-binding-resolution-v1.json',
      predicates: process.env.OPENSPEC_PREDICATE_RESOLUTION_PATH ?? 'docs/reports/openspec-task-evidence-bindings-v1.json',
    },
    invariants: [
      'The baseline preserves the original portfolio snapshot and is not rewritten.',
      'Strict current values require the same workspace revision and deterministic report lineage.',
      'This comparison does not mutate tasks.md, receipts, PostgreSQL, vectors, MCP state, or workboards.',
    ],
    likely_cause: 'Historical census counts and revision-bound resolver counts answer different authority questions and require an explicit compact reconciliation layer.',
    evidence: [relative(BASELINE_PATH), relative(source.censusPath)],
    patch_targets: ['scripts/atlas/reconcile-openspec-census-revisions-v1.mjs'],
    safe_next_command: 'node scripts/atlas/reconcile-openspec-census-revisions-v1.mjs',
    smoke_command: 'node --check scripts/atlas/reconcile-openspec-census-revisions-v1.mjs',
    report_path: 'docs/reports/openspec-evidence-census-reconciliation-v1.json',
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

function main() {
  const censusPath = latestCensusPath();
  const inputPath = (environmentName, fallbackName) => process.env[environmentName]
    ? path.resolve(ROOT, process.env[environmentName])
    : path.join(REPORTS, fallbackName);
  const report = reconcileOpenSpecCensusRevisionsV1({
    baseline: readJson(BASELINE_PATH),
    census: readJson(censusPath),
    identity: readJson(inputPath('OPENSPEC_IDENTITY_RECOVERY_PATH', 'openspec-task-identity-recovery-v1.json')),
    typeReport: readJson(inputPath('OPENSPEC_RECEIPT_TYPES_PATH', 'openspec-receipt-type-classification-v1.json')),
    orphan: readJson(inputPath('OPENSPEC_ORPHAN_BINDINGS_PATH', 'openspec-orphan-binding-resolution-v1.json')),
    predicates: readJson(inputPath('OPENSPEC_PREDICATE_RESOLUTION_PATH', 'openspec-task-evidence-bindings-v1.json')),
    source: { censusPath },
  });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, baseline: report.objectiveBaseline, strictCurrent: report.strictCurrent, output: OUTPUT_PATH }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
