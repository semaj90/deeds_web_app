import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';
import { extractAstFeatures } from '../../sveltekit-frontend/src/lib/server/analysis/ast-grep-extractor.js';

const root = process.cwd();
const reportPath = resolve(root, 'docs/reports/file-exploration-ast-identity-v1.json');
const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId: process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app',
  producerRevision: 'atlas.file-exploration-ast-identity.v1',
});
const sampleSize = Number.parseInt(process.env.FEI_SAMPLE_SIZE ?? '3', 10);
const selected = origin.bindings.filter((binding) => /\.(ts|tsx|js|jsx|mts|mjs)$/.test(binding.sourceRef)).slice(0, Math.max(1, sampleSize));
const observations: Array<Record<string, unknown>> = [];

for (const binding of selected) {
  const sourcePath = resolve(root, binding.sourceRef);
  const sourceText = await readFile(sourcePath, 'utf8');
  const features = await extractAstFeatures(sourceText, binding.sourceRef, {
    sourceRef: binding.sourceRef,
    workspaceRevision: origin.record.workspaceRevision,
    sourceRevision: binding.sourceRevision,
    providerRevision: 'ast-grep-napi',
    producerRevision: 'atlas.file-exploration-ast-identity.v1',
  });
  for (const feature of features) {
    if (feature.byteStart == null || feature.byteEnd == null || feature.byteEnd <= feature.byteStart) continue;
    const bytes = Buffer.from(sourceText, 'utf8').subarray(feature.byteStart, feature.byteEnd);
    observations.push({
      observationId: `fei-ast:${createHash('sha256').update(`${binding.sourceRef}\0${binding.sourceRevision}\0${feature.evidenceKey ?? feature.name}\0${feature.byteStart}\0${feature.byteEnd}`).digest('hex').slice(0, 40)}`,
      sourceRef: feature.sourceRef,
      sourceRevision: feature.sourceRevision,
      workspaceRevision: feature.workspaceRevision,
      contentHash: binding.contentDigest,
      byteStart: feature.byteStart,
      byteEnd: feature.byteEnd,
      evidenceTextChecksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      kind: feature.type,
      name: feature.name,
      ruleId: feature.ruleId ?? null,
      lineageQualified: feature.lineageQualified === true,
      canonicalAuthority: false,
    });
  }
}

const report = {
  schema: 'atlas.file-exploration-ast-identity.v1',
  status: observations.length > 0 && observations.every((row) => row.lineageQualified === true)
    ? 'IDENTITY_QUALIFIED_AST_OBSERVATIONS_PROVEN_BOUNDED'
    : 'IDENTITY_QUALIFIED_AST_OBSERVATIONS_NOT_PROVEN',
  gate: 'ATLAS-FILE-EXPLORATION-INDEX-03',
  sample: { requested: sampleSize, selectedSources: selected.length, sourceRefs: selected.map((binding) => binding.sourceRef) },
  workspaceRevision: origin.record.workspaceRevision,
  observationCount: observations.length,
  observations,
  canonicalAuthority: false,
  writesPerformed: false,
  readOnly: true,
  forbiddenWrites: ['PostgreSQL', 'Qdrant', 'Neo4j', 'Valkey', 'CandidateOrdinal', 'semantic_768'],
};

await mkdir(resolve(root, 'docs/reports'), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, sampleSources: selected.length, observationCount: observations.length, report: reportPath }, null, 2));
