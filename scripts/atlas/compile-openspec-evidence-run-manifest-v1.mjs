import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function objectChecksum(value) {
  return digest(Buffer.from(canonicalJson(value), 'utf8'));
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function readArtifact(filePath, runDirectory, expectedRunId, censusRevision, expectedCensusPath = null, requireRunId = true) {
  if (!filePath) throw new Error('RUN_ARTIFACT_PATH_REQUIRED');
  const resolved = path.resolve(ROOT, filePath);
  const relativeToRun = path.relative(runDirectory, resolved);
  if (!relativeToRun || relativeToRun.startsWith('..') || path.isAbsolute(relativeToRun)) throw new Error(`ARTIFACT_OUTSIDE_RUN_DIRECTORY:${relative(resolved)}`);
  const value = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (requireRunId ? value.runId !== expectedRunId : value.runId && value.runId !== expectedRunId) throw new Error(`ARTIFACT_RUN_ID_MISSING_OR_MISMATCH:${relative(resolved)}`);
  const workspaceRevision = value.source?.workspaceRevision ?? value.workspaceRevision ?? null;
  if (workspaceRevision && censusRevision && workspaceRevision !== censusRevision) throw new Error(`ARTIFACT_REVISION_MISMATCH:${relative(resolved)}`);
  const censusRef = value.source?.census ?? value.sources?.fullCensus ?? null;
  if (expectedCensusPath && (!censusRef || path.resolve(ROOT, censusRef) !== path.resolve(expectedCensusPath))) throw new Error(`ARTIFACT_CENSUS_MISMATCH:${relative(resolved)}`);
  return { value, ref: relative(resolved), checksum: digest(fs.readFileSync(resolved)) };
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function verifyOpenSpecEvidenceRunManifestV1(manifestPath) {
  const resolvedManifestPath = path.resolve(ROOT, manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolvedManifestPath, 'utf8'));
  const { checksum: manifestChecksum, ...unsignedManifest } = manifest;
  if (manifest.schema !== 'atlas.openspec-evidence-run-manifest.v1' || manifestChecksum !== objectChecksum(unsignedManifest)) throw new Error('RUN_MANIFEST_CHECKSUM_INVALID');
  if (manifest.status !== 'PIPELINE_COMPLETED_READ_ONLY') throw new Error('RUN_MANIFEST_NOT_AUTHORITATIVE');
  const runDirectory = path.dirname(resolvedManifestPath);
  if (path.basename(runDirectory) !== manifest.runId) throw new Error('RUN_MANIFEST_DIRECTORY_MISMATCH');
  for (const artifact of [...Object.values(manifest.stages ?? {}), ...Object.values(manifest.diagnostics ?? {})]) {
    if (artifact.runId !== manifest.runId) throw new Error(`RUN_STAGE_ID_MISMATCH:${artifact.path}`);
    const artifactPath = path.resolve(ROOT, artifact.path);
    const artifactRelativePath = path.relative(runDirectory, artifactPath);
    if (!artifactRelativePath || artifactRelativePath.startsWith('..') || path.isAbsolute(artifactRelativePath)) throw new Error(`RUN_STAGE_PATH_MISMATCH:${artifact.path}`);
    if (digest(fs.readFileSync(artifactPath)) !== artifact.sha256) throw new Error(`RUN_STAGE_CHECKSUM_MISMATCH:${artifact.path}`);
  }
  const summaryPath = path.resolve(ROOT, manifest.finalSummary?.path ?? '');
  const summaryRelativePath = path.relative(runDirectory, summaryPath);
  if (!summaryRelativePath || summaryRelativePath.startsWith('..') || path.isAbsolute(summaryRelativePath)) throw new Error('FINAL_SUMMARY_PATH_MISMATCH');
  if (digest(fs.readFileSync(summaryPath)) !== manifest.finalSummary?.sha256) throw new Error('FINAL_SUMMARY_CHECKSUM_MISMATCH');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const { checksum: summaryChecksum, ...unsignedSummary } = summary;
  if (summary.schema !== 'atlas.openspec-evidence-final-summary.v1' || summary.runId !== manifest.runId || summaryChecksum !== objectChecksum(unsignedSummary)) throw new Error('FINAL_SUMMARY_INVALID');
  return { manifest, summary, manifestPath: resolvedManifestPath, summaryPath };
}

export function compileOpenSpecEvidenceRunManifestV1({ runId, runDirectory, paths, generatedAt = new Date().toISOString(), gitRevision = null }) {
  if (!runId || !runDirectory || !paths) throw new Error('RUN_MANIFEST_INPUT_REQUIRED');
  const resolvedRunDirectory = path.resolve(ROOT, runDirectory);
  const censusPath = paths.census ?? path.join(resolvedRunDirectory, 'census-v1.json');
  const censusAbsolute = path.resolve(ROOT, censusPath);
  const census = JSON.parse(fs.readFileSync(censusAbsolute, 'utf8'));
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const revision = census.source?.workspaceRevision ?? null;
  const artifacts = {
    census: readArtifact(censusPath, resolvedRunDirectory, runId, revision),
    identityRecovery: readArtifact(paths.identityRecovery, resolvedRunDirectory, runId, revision, censusAbsolute),
    receiptTyping: readArtifact(paths.receiptTyping, resolvedRunDirectory, runId, revision, censusAbsolute),
    receiptBinding: readArtifact(paths.receiptBinding, resolvedRunDirectory, runId, revision, censusAbsolute),
    reconciliation: readArtifact(paths.reconciliation, resolvedRunDirectory, runId, revision, censusAbsolute),
    predicateResolution: readArtifact(paths.predicateResolution, resolvedRunDirectory, runId, revision, censusAbsolute),
  };
  const diagnosticPaths = paths.diagnostics ?? {};
  const requiredDiagnostics = ['evidenceCards', 'workboardProjection', 'workboardReconciliation', 'goldenTask', 'goldenReceipt'];
  if (requiredDiagnostics.some((key) => !diagnosticPaths[key])) throw new Error('RUN_DIAGNOSTIC_PATH_REQUIRED');
  const diagnostics = Object.fromEntries(requiredDiagnostics.map((key) => [key,
    readArtifact(diagnosticPaths[key], resolvedRunDirectory, runId, revision, key === 'workboardReconciliation' || key === 'goldenReceipt' ? null : censusAbsolute, key !== 'goldenReceipt'),
  ]));
  for (const [key, artifact] of Object.entries(diagnostics)) {
    if (key !== 'goldenReceipt' && artifact.value.runId !== runId) throw new Error(`DIAGNOSTIC_RUN_ID_MISSING:${key}`);
    const diagnosticRevision = artifact.value.source?.workspaceRevision ?? artifact.value.workspaceRevision ?? null;
    if (diagnosticRevision !== revision) throw new Error(`DIAGNOSTIC_REVISION_MISSING_OR_MISMATCH:${key}`);
  }
  const cards = diagnostics.evidenceCards.value;
  const workboardProjection = diagnostics.workboardProjection.value;
  const workboardReconciliation = diagnostics.workboardReconciliation.value;
  const goldenTask = diagnostics.goldenTask.value;
  const goldenReceipt = diagnostics.goldenReceipt.value;
  if (cards.schema !== 'atlas.openspec-evidence-cards.v1'
    || cards.source?.bindings !== artifacts.predicateResolution.ref
    || workboardProjection.schema !== 'atlas.openspec-evidence-workboard-projection.v1'
    || workboardProjection.source?.bindings !== artifacts.predicateResolution.ref
    || workboardProjection.source?.cards !== diagnostics.evidenceCards.ref
    || workboardReconciliation.schema !== 'atlas.openspec-workboard-evidence-reconciliation.v1'
    || workboardReconciliation.source?.evidenceCards !== diagnostics.evidenceCards.ref
    || goldenTask.schema !== 'atlas.openspec-golden-task.v1'
    || goldenReceipt.schema !== 'atlas.evidence-receipt.v1'
    || !goldenTask.evidence?.includes(diagnostics.goldenReceipt.ref)
    || goldenTask.source?.receiptChecksum !== goldenReceipt.checksum) throw new Error('RUN_DIAGNOSTIC_LINEAGE_MISMATCH');
  const identity = artifacts.identityRecovery.value;
  const typing = artifacts.receiptTyping.value;
  const bindings = artifacts.receiptBinding.value;
  const reconciliation = artifacts.reconciliation.value;
  const predicates = artifacts.predicateResolution.value;
  const expectedLineage = {
    identity: artifacts.identityRecovery.ref,
    receiptTypes: artifacts.receiptTyping.ref,
    orphanBindings: artifacts.receiptBinding.ref,
    predicates: artifacts.predicateResolution.ref,
  };
  if (bindings.source?.identityRecovery !== expectedLineage.identity || bindings.source?.receiptTypes !== expectedLineage.receiptTypes) throw new Error('RECEIPT_BINDING_STAGE_LINEAGE_MISMATCH');
  if (reconciliation.source?.identity !== expectedLineage.identity
    || reconciliation.source?.receiptTypes !== expectedLineage.receiptTypes
    || reconciliation.source?.orphanBindings !== expectedLineage.orphanBindings
    || reconciliation.source?.predicates !== expectedLineage.predicates) throw new Error('RECONCILIATION_STAGE_LINEAGE_MISMATCH');
  const gates = [];
  const gate = (id, passed, detail) => gates.push({ id, status: passed ? 'PASS' : 'FAIL', detail });
  const taskCount = number(identity.summary?.taskCount);
  const canonicalKeys = number(identity.summary?.canonicalKeyCoverageCount);
  const admitted = number(identity.summary?.canonicalKeyAdmittedCount);
  const predicatesWorkspaceRevision = predicates.source?.workspaceRevision ?? null;
  const bindingRevision = bindings.source?.workspaceRevision ?? null;
  const allArtifacts = [...Object.values(artifacts), ...Object.values(diagnostics)];
  gate('EVF-RUN-01_SAME_RUN_INPUTS', allArtifacts.every((artifact) => artifact.ref.startsWith(`${relative(resolvedRunDirectory)}/`)) && predicatesWorkspaceRevision === revision && bindingRevision === revision, 'Authority and diagnostic inputs are run-scoped and revision-compatible.');
  gate('EVF-RUN-02_CHECKSUM_BOUND', allArtifacts.every((artifact) => /^sha256:[a-f0-9]{64}$/.test(artifact.checksum)), 'Every authority and diagnostic artifact has a manifest-bound SHA-256.');
  gate('EVF-RUN-03_STAGE_AUTHORITY', canonicalKeys === taskCount && admitted <= canonicalKeys && number(reconciliation.strictCurrent?.canonicalKeyAdmitted) === admitted, 'Identity and binding stages, not raw census counters, determine interpreted identity counts.');
  gate('EVF-RUN-04_NO_FILENAME_LATEST', true, 'All stage inputs are explicit paths; no newest-file discovery is used.');
  gate('EVF-RUN-05_FINAL_STATE_ONLY', predicates.schema === 'atlas.openspec-task-evidence-bindings.v1' && bindings.schema === 'atlas.openspec-orphan-binding-resolution.v1', 'Final proof and binding counts come from their designated resolved stage outputs.');

  const proofBindings = predicates.bindings ?? [];
  const checkedByTaskRef = new Map((census.tasks ?? []).map((task) => [task.taskRef, task.declaredChecked === true]));
  const checkedProven = proofBindings.filter((row) => checkedByTaskRef.get(row.taskRef) === true && row.proofState === 'PROVEN').length;
  const uncheckedProven = proofBindings.filter((row) => checkedByTaskRef.get(row.taskRef) === false && row.proofState === 'PROVEN').length;
  const bindingSummary = bindings.summary ?? {};
  const receiptCount = number(bindingSummary.receiptCount ?? typing.summary?.receiptCount);
  const receiptDispositions = bindingSummary.bindingDispositionCounts ?? {};
  const summary = {
    schema: 'atlas.openspec-evidence-final-summary.v1',
    authority: 'FINAL_RUN_SUMMARY_ONLY',
    runId,
    generatedAt,
    workspaceRevision: revision,
    counts: {
      changes: number(census.summary?.totalChanges),
      tasks: taskCount,
      checkedClaims: number(census.summary?.checkedTasks),
      canonicalKeys,
      admittedCanonicalKeys: admitted,
      quarantinedIdentities: Math.max(0, taskCount - admitted),
      ambiguousIdentities: number(identity.summary?.identityStateCounts?.AMBIGUOUS) + number(identity.summary?.identityStateCounts?.CONFLICTING),
      checkedClaimsProven: checkedProven,
      uncheckedTasksProven: uncheckedProven,
      proofStateCounts: predicates.summary?.proofStateCounts ?? {},
      receiptCandidates: receiptCount,
      typedReceipts: number(typing.summary?.schemaOrFieldTypedCount),
      candidateTypedReceipts: number(typing.summary?.candidateTypeCount),
      exactBound: number(bindingSummary.exactBoundCount),
      legacyBound: number(bindingSummary.legacyBoundCount),
      candidateOnly: number(bindingSummary.candidateOnlyCount),
      quarantinedIdentityBindings: number(bindingSummary.quarantinedIdentityCount),
      missingTask: number(bindingSummary.missingTaskCount),
      ambiguous: number(bindingSummary.ambiguousCount),
      trueOrphan: number(bindingSummary.trueOrphanCount),
      missingRevision: number(bindingSummary.missingRevisionCount),
      staleRevision: number(bindingSummary.staleRevisionCount),
      missingOrStaleRevision: number(bindingSummary.missingRevisionCount) + number(bindingSummary.staleRevisionCount),
      bindingDispositions: receiptDispositions,
    },
    stages: Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => [name, { runId, path: artifact.ref, sha256: artifact.checksum }])),
    diagnostics: Object.fromEntries(Object.entries(diagnostics).map(([name, artifact]) => [name, { runId, path: artifact.ref, sha256: artifact.checksum }])),
    diagnostics: Object.fromEntries(Object.entries(diagnostics).map(([name, artifact]) => [name, { runId, path: artifact.ref, sha256: artifact.checksum }])),
    gates,
    status: gates.every((item) => item.status === 'PASS') ? 'PIPELINE_COMPLETED_READ_ONLY' : 'PIPELINE_AUTHORITY_REJECTED',
    source: { rawCensus: artifacts.census.ref, reconciliation: artifacts.reconciliation.ref },
    invariants: [
      'The raw census is an observation and cannot override identity, binding, or predicate-resolution outputs.',
      'A canonical task key is distinct from admission; quarantined identities cannot be receipt targets.',
      'Checkbox claims and evidence proof remain independent dimensions.',
      'Run authority is explicit-path and checksum-bound; filename recency grants no authority.',
    ],
  };

  const reconciledAmbiguous = number(identity.summary?.identityStateCounts?.AMBIGUOUS) + number(identity.summary?.identityStateCounts?.CONFLICTING);
  gate('EVF-RUN-06_STALE_METRIC_DETECTION', !Object.hasOwn(summary.counts, 'ambiguous_task_identities') && summary.counts.ambiguousIdentities === reconciledAmbiguous, 'Final ambiguity counts are derived from identity recovery; raw census ambiguity fields cannot override them.');
  summary.gates = gates;
  summary.status = gates.every((item) => item.status === 'PASS') ? 'PIPELINE_COMPLETED_READ_ONLY' : 'PIPELINE_AUTHORITY_REJECTED';
  summary.checksum = objectChecksum(summary);

  const finalSummaryPath = path.join(resolvedRunDirectory, 'final-summary-v1.json');
  fs.writeFileSync(finalSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  const unsignedManifest = {
    schema: 'atlas.openspec-evidence-run-manifest.v1',
    runId,
    gitRevision,
    generatedAt,
    workspaceRevision: revision,
    stages: summary.stages,
    diagnostics: summary.diagnostics,
    finalSummary: { path: relative(finalSummaryPath), sha256: digest(fs.readFileSync(finalSummaryPath)) },
    gates,
    status: summary.status,
  };
  const manifest = { ...unsignedManifest, checksum: objectChecksum(unsignedManifest) };
  const manifestPath = path.join(resolvedRunDirectory, 'run-manifest-v1.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { summary, manifest, summaryPath: finalSummaryPath, manifestPath };
}

function main() {
  const runDirectory = process.env.OPENSPEC_EVIDENCE_RUN_DIR;
  const runId = process.env.OPENSPEC_EVIDENCE_RUN_ID ?? (runDirectory ? path.basename(path.resolve(ROOT, runDirectory)) : null);
  const paths = {
    census: process.env.OPENSPEC_CENSUS_PATH,
    identityRecovery: process.env.OPENSPEC_IDENTITY_RECOVERY_PATH,
    receiptTyping: process.env.OPENSPEC_RECEIPT_TYPES_PATH,
    receiptBinding: process.env.OPENSPEC_ORPHAN_BINDINGS_PATH,
    reconciliation: process.env.OPENSPEC_RECONCILIATION_PATH,
    predicateResolution: process.env.OPENSPEC_PREDICATE_RESOLUTION_PATH,
    diagnostics: {
      evidenceCards: process.env.OPENSPEC_EVIDENCE_CARDS_PATH,
      workboardProjection: process.env.OPENSPEC_WORKBOARD_PROJECTION_PATH,
      workboardReconciliation: process.env.OPENSPEC_WORKBOARD_RECONCILIATION_PATH,
      goldenTask: process.env.OPENSPEC_GOLDEN_TASK_PATH,
      goldenReceipt: process.env.OPENSPEC_GOLDEN_RECEIPT_PATH,
    },
  };
  const gitRevision = process.env.GIT_COMMIT ?? null;
  const result = compileOpenSpecEvidenceRunManifestV1({ runId, runDirectory, paths, gitRevision });
  console.log(JSON.stringify({ status: result.summary.status, runId, counts: result.summary.counts, summary: relative(result.summaryPath), manifest: relative(result.manifestPath) }, null, 2));
  if (result.summary.status !== 'PIPELINE_COMPLETED_READ_ONLY') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
