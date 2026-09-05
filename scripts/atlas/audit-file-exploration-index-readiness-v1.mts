import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/file-exploration-index-readiness-v1.json');
const producerRevision = 'atlas.file-exploration-index-readiness.v1';
const files = {
  okfIndex: resolve(root, '.okf/indexes/code-exploration.yaml'),
  astGrepExtractor: resolve(root, 'sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.ts'),
  astGrepLibrary: resolve(root, 'scripts/atlas/lib/ast-grep-symbol-extraction.mjs'),
  seedAudit: resolve(root, 'scripts/atlas/audit-ast-explore-seed-v1.mjs'),
  seed: resolve(root, 'sveltekit-frontend/memory/index/symbols.jsonl'),
};

const text = (file: string) => existsSync(file) ? readFileSync(file, 'utf8') : '';
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId: process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app',
  producerRevision,
});
const okf = text(files.okfIndex);
const extractor = text(files.astGrepExtractor);
const library = text(files.astGrepLibrary);
const seedAudit = text(files.seedAudit);
const seedExists = existsSync(files.seed);

const checks = {
  feiContractPresent: okf.includes('atlas.code-exploration-index.v1'),
  canonicalUtf8Coordinates: okf.includes('utf8_byte'),
  lspTransportOnly: okf.includes('transport_only_utf16'),
  astGrepProviderPresent: existsSync(files.astGrepExtractor) && existsSync(files.astGrepLibrary),
  astGrepHasByteEvidence: /byte(Start|End)|startByte|endByte/.test(extractor + library),
  astGrepObservationOnly: okf.includes('discovery_only') && okf.includes('canonical_promotion_requires_revision_join'),
  seedAuditPresent: existsSync(files.seedAudit),
  seedPopulationPresent: seedExists,
  semantic768Canonical: okf.includes('semantic_768') && !/\b384\b/.test(okf),
};

const blockers: string[] = [];
if (!checks.feiContractPresent) blockers.push('FEI_CONTRACT_MISSING');
if (!checks.astGrepProviderPresent) blockers.push('AST_GREP_PROVIDER_MISSING');
if (!checks.astGrepHasByteEvidence) blockers.push('AST_GREP_BYTE_EVIDENCE_UNPROVEN');
if (!checks.seedAuditPresent) blockers.push('SEED_AUDIT_MISSING');
if (!checks.seedPopulationPresent) blockers.push('SEED_POPULATION_MISSING');
if (!checks.semantic768Canonical) blockers.push('SEMANTIC_768_CONTRACT_MISSING_OR_LEGACY_DIMENSION_PRESENT');
if (seedAudit.includes('SEED_NOT_IDENTITY_READY')) blockers.push('SEED_NOT_IDENTITY_READY');

const report = {
  schema: 'atlas.file-exploration-index-readiness.v1',
  status: blockers.length === 0 ? 'FEI_CONTRACT_AND_PROVIDER_READY_SEED_UNPROVEN' : 'FEI_READINESS_BLOCKED',
  gate: 'ATLAS-FILE-EXPLORATION-INDEX-01',
  owner: 'existing AST-grep observation surfaces plus .okf/indexes/code-exploration.yaml',
  workspace: {
    workspaceRevision: origin.record.workspaceRevision,
    sourceManifestDigest: origin.record.sourceManifestDigest,
    sourceCount: origin.record.sourceCount,
  },
  checks,
  blockers,
  seed: {
    path: files.seed,
    auditPath: files.seedAudit,
    promotionStatus: seedAudit.includes('SEED_NOT_IDENTITY_READY') ? 'NOT_IDENTITY_READY' : 'UNVERIFIED',
    canonicalAuthority: false,
  },
  forbiddenInThisGate: ['database writes', 'Qdrant writes', 'Neo4j writes', 'Valkey writes', 'model calls', 'CandidateOrdinal promotion'],
  readOnly: true,
  writesPerformed: false,
  files,
  producerRevision,
};

await mkdir(resolve(root, 'docs/reports'), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, workspaceRevision: origin.record.workspaceRevision, sourceCount: origin.record.sourceCount, blockers, report: reportPath }, null, 2));
