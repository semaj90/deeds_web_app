import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const REPORTS = path.join(ROOT, 'docs', 'reports');
const OUTPUT_PATH = process.env.OPENSPEC_EVIDENCE_SUMMARY_OUTPUT
  ? path.resolve(ROOT, process.env.OPENSPEC_EVIDENCE_SUMMARY_OUTPUT)
  : path.join(REPORTS, 'openspec-evidence-summary-v1.json');

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

function latestCensusPath() {
  if (!process.env.OPENSPEC_CENSUS_PATH) throw new Error('OPENSPEC_CENSUS_PATH_REQUIRED');
  return path.resolve(ROOT, process.env.OPENSPEC_CENSUS_PATH);
}

function configuredReportPath(fileName, envName) {
  return process.env[envName] ? path.resolve(ROOT, process.env[envName]) : path.join(REPORTS, fileName);
}

function readReport(fileName, envName) {
  try { return JSON.parse(fs.readFileSync(configuredReportPath(fileName, envName), 'utf8')); } catch { return null; }
}

function reportReference(fileName, envName, report) {
  return report ? relative(configuredReportPath(fileName, envName)) : null;
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function deltas(current, previous) {
  if (!previous) return null;
  return Object.fromEntries(Object.entries(current)
    .filter(([key]) => Object.hasOwn(previous, key))
    .map(([key, value]) => [key, value - numeric(previous[key])]));
}

export function compileOpenSpecEvidenceSummaryV1(census, identityReport, typeReport, orphanReport, previous = null, censusPath = 'latest-run-census-v1.json') {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const identitySummary = identityReport?.summary ?? {};
  const identityStateCounts = identitySummary.identityStateCounts ?? {};
  const declaredIdMissing = numeric(census.summary?.taskIdMissing);
  const unresolvedIdentity = identityReport
    ? Math.max(0, numeric(identitySummary.taskCount ?? census.summary?.totalTasks) - numeric(identitySummary.canonicalKeyAdmittedCount))
    : null;
  const provenChecked = numeric(census.summary?.checkedWithEvidence);
  const provenUnchecked = numeric(census.summary?.uncheckedButProven);
  const typeSummary = typeReport?.summary ?? {};
  const orphanSummary = orphanReport?.summary ?? {};
  const current = {
    changes: numeric(census.summary?.totalChanges),
    tasks: numeric(census.summary?.totalTasks),
    checked: numeric(census.summary?.checkedTasks),
    proven: provenChecked,
    provenTotal: provenChecked + provenUnchecked,
    uncheckedProven: provenUnchecked,
    claimOnly: numeric(census.summary?.checkedWithoutEvidence),
    declaredIdMissing,
    unstableIdentity: unresolvedIdentity,
    receiptCandidates: numeric(census.summary?.receipts_total),
    orphanBound: numeric(orphanSummary.trueOrphanCount) + numeric(orphanSummary.missingTaskCount),
    legacyBound: numeric(orphanSummary.legacyBoundCount),
    exactBound: numeric(orphanSummary.exactBoundCount),
  };
  const unsigned = {
    schema: 'atlas.openspec-evidence-summary.v1',
    mode: 'COMPACT_READ_ONLY_RECONCILIATION_SUMMARY',
    status: 'SUMMARY_DERIVED_NOT_PROMOTABLE',
    workspaceRevision: census.source?.workspaceRevision ?? null,
    workspaceRevisionScope: census.source?.workspaceRevisionScope ?? null,
    deltaBaselineWorkspaceRevision: previous?.workspaceRevision ?? null,
    counts: current,
    identity: {
      stateCounts: identityStateCounts,
      declaredIdMissing,
      canonicalKeyCoverage: numeric(identitySummary.canonicalKeyCoverageCount),
      canonicalKeyAdmitted: numeric(identitySummary.canonicalKeyAdmittedCount),
      collisionClassCounts: identitySummary.collisionClassCounts ?? {},
      collisionGroups: numeric(identitySummary.canonicalKeyCollisionGroupCount),
      collisionTasks: numeric(identitySummary.canonicalKeyCollisionTaskCount),
      duplicateDiagnosticGroupCount: numeric(identitySummary.duplicateDiagnosticGroupCount),
      duplicateClassCounts: identitySummary.duplicateClassCounts ?? {},
    },
    receipts: {
      typeCounts: typeSummary.typeCounts ?? {},
      typingStateCounts: typeSummary.typingStateCounts ?? {},
      candidateTypeCount: numeric(typeSummary.candidateTypeCount),
      untypedReceiptCount: numeric(typeSummary.typingStateCounts?.CANDIDATE_TYPE),
      candidateUnknownTypeCount: numeric(typeSummary.typeCounts?.UNKNOWN),
      ambiguousCandidateCount: numeric(typeSummary.ambiguousCandidateCount),
      scopeCounts: typeSummary.scopeCounts ?? {},
      bindingDispositionCounts: orphanSummary.bindingDispositionCounts ?? {},
      bindingReasonCounts: orphanSummary.bindingReasonCounts ?? {},
      confirmedUnknownTypeCount: numeric(typeSummary.unknownCount),
    },
    dependencies: {
      candidates: numeric(census.summary?.dependency_candidates),
      resolvedEdges: numeric(census.summary?.resolved_edges),
      missingTaskReferences: numeric(census.summary?.dependencyMissingTaskReferenceCount),
      ambiguousTaskReferences: numeric(census.summary?.dependencyAmbiguousReferenceCount),
      changeLevelReferences: numeric(census.summary?.dependencyChangeLevelReferenceCount),
      cycles: Array.isArray(census.dependencyCycles) ? census.dependencyCycles.length : 0,
      cycleAffectedTasks: numeric(census.summary?.dependencyCycleAffectedTaskCount),
    },
    deltasFromPrevious: deltas(current, previous?.counts),
    sources: {
      fullCensus: censusPath,
      dependencyDiagnostics: censusPath.replace(/census-v1\.json$/, 'dependency-resolution-v1.json'),
      identityRecovery: reportReference('openspec-task-identity-recovery-v1.json', 'OPENSPEC_IDENTITY_RECOVERY_PATH', identityReport),
      receiptTypes: reportReference('openspec-receipt-type-classification-v1.json', 'OPENSPEC_RECEIPT_TYPES_PATH', typeReport),
      orphanBindings: reportReference('openspec-orphan-binding-resolution-v1.json', 'OPENSPEC_ORPHAN_BINDINGS_PATH', orphanReport),
    },
    corpusChecksums: {
      census: census.checksum ?? null,
      identityRecovery: identityReport?.checksum ?? null,
      receiptTypes: typeReport?.checksum ?? null,
      orphanBindings: orphanReport?.checksum ?? null,
    },
    invariants: [
      'This summary is a bounded projection; the full census remains authoritative for row-level inspection.',
      'Counts do not promote identity, evidence state, or task mutation.',
      'Deltas are null without a prior compact summary and are not proof of causality.',
    ],
    likely_cause: 'Large OpenSpec corpora need a bounded counts-and-deltas surface so agents can navigate by reference without loading the full census.',
    evidence: [censusPath],
    patch_targets: ['scripts/atlas/compile-openspec-evidence-summary-v1.mjs'],
    safe_next_command: 'node scripts/atlas/compile-openspec-evidence-summary-v1.mjs',
    smoke_command: 'node --check scripts/atlas/compile-openspec-evidence-summary-v1.mjs',
    report_path: relative(OUTPUT_PATH),
  };
  return { ...unsigned, checksum: checksum(unsigned) };
}

function main() {
  const censusPath = latestCensusPath();
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const identity = readReport('openspec-task-identity-recovery-v1.json', 'OPENSPEC_IDENTITY_RECOVERY_PATH');
  const types = readReport('openspec-receipt-type-classification-v1.json', 'OPENSPEC_RECEIPT_TYPES_PATH');
  const orphan = readReport('openspec-orphan-binding-resolution-v1.json', 'OPENSPEC_ORPHAN_BINDINGS_PATH');
  const previous = fs.existsSync(OUTPUT_PATH) ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')) : null;
  const report = compileOpenSpecEvidenceSummaryV1(census, identity, types, orphan, previous, relative(censusPath));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, counts: report.counts, bytes: fs.statSync(OUTPUT_PATH).size, output: OUTPUT_PATH }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
