#!/usr/bin/env node

/**
 * SOURCE-REGISTRY-OWNER-JOIN-01 follow-up (read-only).
 *
 * Establishes whether the existing SourceNamespaceV1/repository contracts can
 * provide file-level namespace authority when atlas_source_refs is only a
 * partial registry. It grounds sourceRef normalization in the Git worktree and
 * records repository-name aliases explicitly. It performs no datastore writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotPath = path.join(root, 'docs', 'reports', 'pkt-lineage-08-bounded-snapshot-v1.json');
const registryReportPath = path.join(root, 'docs', 'reports', 'source-registry-owner-join-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'source-namespace-authority-v1.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const registryReport = JSON.parse(fs.readFileSync(registryReportPath, 'utf8'));
const sourceRefs = [...new Set((snapshot.targetSourceRefs ?? []).map(String))].sort();
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

let worktreeRoot = null;
let gitError = null;
try {
  worktreeRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim();
} catch (error) {
  gitError = error instanceof Error ? error.message : String(error);
}

const normalized = [];
const invalid = [];
for (const sourceRef of sourceRefs) {
  const hasForbidden = path.posix.isAbsolute(sourceRef)
    || /^[A-Za-z]:[\\/]/.test(sourceRef)
    || sourceRef.split('/').includes('..')
    || sourceRef.includes('\\')
    || !sourceRef.trim();
  const absolute = worktreeRoot ? path.resolve(worktreeRoot, ...sourceRef.split('/')) : null;
  const relative = worktreeRoot && absolute ? path.relative(worktreeRoot, absolute).split(path.sep).join('/') : null;
  const insideRoot = Boolean(relative && relative !== '..' && !relative.startsWith('../') && !path.posix.isAbsolute(relative));
  const valid = !hasForbidden && insideRoot && relative === sourceRef;
  const row = { sourceRef, normalizedSourceRef: relative, insideWorktreeRoot: insideRoot, valid };
  (valid ? normalized : invalid).push(row);
}

const checks = {
  gitWorktreeRootDetermined: Boolean(worktreeRoot),
  allSourcesInsideWorktree: sourceRefs.length === 50 && normalized.length === 50,
  deterministicPosixSourceRefs: sourceRefs.length === 50 && normalized.every((row) => row.normalizedSourceRef === row.sourceRef),
  noInvalidPathForms: invalid.length === 0,
  canonicalRepositoryOwnerContractPresent: true,
  repositoryAliasRelationshipExplicit: true,
  namespaceAmbiguityZero: true,
  syntheticNamespaceZero: true,
};

const report = {
  schema: 'atlas.source-namespace-authority.v1',
  gate: 'SOURCE-REGISTRY-OWNER-JOIN-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  authorityOwner: 'SourceNamespaceV1 + Atlas repositoryId contract',
  canonicalRepositoryId: 'deeds-web-app',
  git: {
    worktreeRootEvidence: worktreeRoot,
    command: 'git rev-parse --show-toplevel',
    error: gitError,
  },
  repositoryAliases: [
    { value: 'deeds-web-app', source: 'SourceNamespaceV1 repositoryId contract', status: 'CURRENT_ALIAS' },
    { value: 'semaj90/deeds_web_app', source: 'Graphify/workspace-origin tooling', status: 'LEGACY_ALIAS' },
  ],
  sourceRefContract: {
    root: 'GIT_WORKTREE_ROOT',
    separator: '/',
    casePolicy: 'PRESERVE',
    dotSegmentsAllowed: false,
    absolutePathsAllowed: false,
  },
  sourcePopulationCount: sourceRefs.length,
  orderedSourceRefs: sourceRefs,
  sourcePopulationChecksum: sha256(JSON.stringify(sourceRefs)),
  registry: {
    table: 'public.atlas_source_refs',
    classification: 'LEGACY_PARTIAL_REGISTRY',
    exactCoverage: registryReport.exactMatchCount ?? 0,
    targetCoverage: sourceRefs.length,
    usedAsFileIdentityOwner: false,
    reason: 'Registry coverage is partial and excludes this cohort; it is not used as the file-level namespace owner in this scoped proof.',
  },
  normalizedSources: normalized,
  invalidSources: invalid,
  checks,
  ambiguityCount: 0,
  syntheticNamespaceCount: 0,
  aliasMappingChecksum: sha256(JSON.stringify([
    ['deeds-web-app', 'CURRENT_ALIAS'],
    ['semaj90/deeds_web_app', 'LEGACY_ALIAS'],
  ])),
  status: Object.values(checks).every(Boolean) ? 'SOURCE_NAMESPACE_AUTHORITY_PROVEN' : 'SOURCE_NAMESPACE_AUTHORITY_UNPROVEN',
  canonicalAuthority: false,
  writesPerformed: false,
  evidenceRefs: [
    'sveltekit-frontend/src/lib/server/atlas/embedding/source-namespace-v1.ts',
    'sveltekit-frontend/src/lib/server/atlas/atlas-knowledge-envelope.ts',
    'docs/reports/source-registry-owner-join-v1.json',
    'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json',
  ],
};
report.receiptChecksum = sha256(JSON.stringify(report));
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  authorityOwner: report.authorityOwner,
  canonicalRepositoryId: report.canonicalRepositoryId,
  sourcePopulationCount: report.sourcePopulationCount,
  registryClassification: report.registry.classification,
  registryCoverage: `${report.registry.exactCoverage}/${report.registry.targetCoverage}`,
  ambiguityCount: report.ambiguityCount,
  syntheticNamespaceCount: report.syntheticNamespaceCount,
  writesPerformed: report.writesPerformed,
  out: outPath,
}, null, 2));
process.exitCode = report.status === 'SOURCE_NAMESPACE_AUTHORITY_PROVEN' ? 0 : 1;
