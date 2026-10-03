import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const censusPath = process.env.OPENSPEC_CENSUS_PATH
  ? path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-portfolio-census-v2.json');
const inputPaths = {
  census: censusPath,
  graph: path.join(ROOT, 'docs', 'reports', 'openspec-dependency-graph-v1.json'),
  binding: path.join(ROOT, 'docs', 'reports', 'openspec-receipt-binding-v1.json'),
  predicates: path.join(ROOT, 'docs', 'reports', 'openspec-task-evidence-bindings-v1.json'),
  cards: path.join(ROOT, 'docs', 'reports', 'openspec-evidence-cards-v1.json'),
  migration: path.join(ROOT, 'docs', 'reports', 'openspec-evidence-migration-dry-run-v1.json'),
};
const outputPath = process.env.OPENSPEC_LEDGER_IMPORT_PLAN_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_LEDGER_IMPORT_PLAN_OUTPUT)
  : path.join(ROOT, 'docs', 'reports', 'openspec-evidence-ledger-import-plan-v1.json');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checksum(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function revisionOf(report) {
  return report?.source?.workspaceRevision ?? report?.workspaceRevision ?? null;
}

function countAssertions(receipts) {
  return receipts.reduce((total, receipt) => total + (Array.isArray(receipt.actualAssertions) ? receipt.actualAssertions.length : 0), 0);
}

function countTaskEvidence(bindings) {
  return bindings.reduce((total, binding) => total + (Array.isArray(binding.evidenceIds) ? binding.evidenceIds.length : 0), 0);
}

function buildPlan(inputs) {
  const census = inputs.census;
  const graph = inputs.graph;
  const binding = inputs.binding;
  const predicates = inputs.predicates;
  const cards = inputs.cards;
  const migration = inputs.migration;
  const missingInputs = Object.entries(inputs).filter(([, value]) => !value).map(([name]) => name);
  const revisions = Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, revisionOf(value)]));
  const distinctRevisions = [...new Set(Object.values(revisions).filter(Boolean))];
  const exactBindings = binding?.bindings?.filter((row) => row.resolution === 'BOUND' && row.proofEligible === true) ?? [];
  const plannedRows = {
    openspec_changes: census?.changes?.length ?? 0,
    openspec_tasks: census?.tasks?.length ?? 0,
    openspec_dependencies: graph?.edges?.length ?? 0,
    evidence_receipts: binding?.bindings?.length ?? census?.evidenceReceipts?.length ?? 0,
    task_evidence: countTaskEvidence(predicates?.bindings ?? []),
    openspec_evidence_chunks: 0,
    openspec_task_predicate: predicates?.predicates?.length ?? 0,
    evidence_assertion: countAssertions(census?.evidenceReceipts ?? []),
    openspec_supersession: 0,
  };
  const checks = {
    inputsPresent: missingInputs.length === 0,
    migrationDesignValidated: migration?.status === 'DESIGN_VALIDATED_UNAPPLIED',
    workspaceRevisionParity: distinctRevisions.length <= 1,
    graphIdentityMatchesCensus: graph?.summary?.nodeCount === census?.tasks?.length,
    predicateIdentityMatchesCensus: predicates?.summary?.taskCount === census?.tasks?.length,
    cardIdentityMatchesCensus: cards?.summary?.cardCount === census?.tasks?.length,
    noHeuristicProofAdmission: (predicates?.summary?.heuristicPromotionCount ?? 0) === 0,
    noProjectionRowsPlanned: plannedRows.openspec_evidence_chunks === 0,
  };
  const status = Object.values(checks).every(Boolean) ? 'DRY_RUN_IMPORT_PLAN_READY' : 'BLOCKED_IMPORT_PLAN';
  const unsigned = {
    schema: 'atlas.openspec-evidence-ledger-import-plan.v1',
    mode: 'READ_ONLY_DRY_RUN',
    status,
    source: Object.fromEntries(Object.entries(inputPaths).map(([name, filePath]) => [name, relative(filePath)])),
    workspaceRevisions: revisions,
    checks,
    missingInputs,
    plannedRows,
    admission: {
      exactProofEligibleReceiptBindings: exactBindings.length,
      heuristicBindingsAdmitted: 0,
      projectionsAdmitted: 0,
      canonicalProofStateWrites: 0,
      checkboxMutations: 0,
      supersessionCandidatesAdmitted: 0,
      supersessionCandidatesObserved: census?.supersession?.candidates?.length ?? 0,
    },
    authority: {
      canonical: 'PostgreSQL 18 after authorized apply and independent readback',
      current: 'Repository census and design-only dry-run; PostgreSQL not established',
      taskClaims: 'tasks.md',
      proofState: 'Derived from revision-qualified receipts and assertions',
    },
    writesPerformed: false,
    likely_cause: 'The evidence ledger needs a bounded row plan and revision-parity check before any canonical import is authorized.',
    evidence: Object.values(inputPaths).map(relative),
    patch_targets: ['scripts/atlas/plan-openspec-evidence-ledger-import-v1.mjs', 'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_fabric_v1.sql', 'sveltekit-frontend/drizzle/manual/20261001_openspec_evidence_fabric_v2.sql'],
    safe_next_command: 'node scripts/atlas/audit-openspec-evidence-ledger-readback-v1.mjs',
    smoke_command: 'node --check scripts/atlas/plan-openspec-evidence-ledger-import-v1.mjs',
    report_path: relative(outputPath),
  };
  return { ...unsigned, generatedAt: new Date().toISOString(), checksum: checksum(unsigned) };
}

const inputs = Object.fromEntries(Object.entries(inputPaths).map(([name, filePath]) => [name, readJson(filePath)]));
const report = buildPlan(inputs);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, checks: report.checks, plannedRows: report.plannedRows, writesPerformed: report.writesPerformed, output: outputPath }, null, 2));
