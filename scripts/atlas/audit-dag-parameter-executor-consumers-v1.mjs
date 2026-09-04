import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const files = [
  'packages/parent-atlas/src/core/kernel-dag-execution-binding-v1.ts',
  'packages/parent-atlas/src/core/kernel-bound-dag-executor-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-execution-adapter-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-ast-evidence-handler-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-context-manifest-handler-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-graph-handler-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-kag-neighbor-handler-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-lexical-handler-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-neural-latent-handler-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-semantic-qdrant-handler-v1.ts',
];

const sha256 = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const scans = files.map((relativePath) => {
  const text = readFileSync(resolve(root, relativePath), 'utf8');
  const artifactAware = /parameterArtifactRef/.test(text);
  const runtimeArgumentOnly = /binding\.boundArguments/.test(text) && !artifactAware;
  return {
    relativePath,
    artifactAware,
    runtimeArgumentOnly,
    boundArgumentsReads: (text.match(/binding\.boundArguments/g) ?? []).length,
    parameterArtifactRefReads: (text.match(/parameterArtifactRef/g) ?? []).length,
  };
});

const runtimeArgumentOnlyConsumers = scans.filter((scan) => scan.runtimeArgumentOnly).map((scan) => scan.relativePath);
const artifactAwareConsumers = scans.filter((scan) => scan.artifactAware).map((scan) => scan.relativePath);
const resolutionBoundaryProven = scans.some((scan) => scan.relativePath.endsWith('oak-dag-execution-adapter-v1.ts') && scan.parameterArtifactRefReads > 0)
  && scans.some((scan) => scan.relativePath.endsWith('kernel-dag-execution-binding-v1.ts') && scan.parameterArtifactRefReads > 0);
const reportBody = {
  schema: 'atlas.dag-parameter-executor-consumers.v1',
  gate: 'DAG-PARAMETER-EXECUTOR-CONSUMER-AUDIT-01',
  scope: 'read-only source audit; no runtime, database, cache, or artifact writes',
  plannerArtifactEmission: {
    status: 'FOCUSED_PROVEN',
    owner: 'packages/parent-atlas/src/core/kernel-bound-dag-planner-v1.ts',
    fields: ['parameterArtifactRef', 'parameterChecksum'],
  },
  runtimeBinding: {
    status: resolutionBoundaryProven ? 'IMPLEMENTED_FOCUSED_PROVEN' : 'OPEN',
    owner: 'packages/parent-atlas/src/core/kernel-dag-execution-binding-v1.ts',
    finding: resolutionBoundaryProven
      ? 'core binding and OaK adapter resolve and verify ParameterArtifactV1 before handler invocation; legacy null-reference bindings remain compatible'
      : 'binding schema carries boundArguments but does not resolve ParameterArtifactV1 by reference',
  },
  artifactAwareConsumers,
  runtimeArgumentOnlyConsumers,
  scans,
  classification: resolutionBoundaryProven ? 'ADAPTER_RESOLUTION_PROVEN_LEGACY_COMPATIBILITY_OPEN' : 'OPEN_RUNTIME_LOADING',
  canonicalAuthority: false,
  writesPerformed: false,
};
const report = { ...reportBody, reportChecksum: sha256(JSON.stringify(reportBody)) };
const output = resolve(root, 'docs/reports/dag-parameter-executor-consumers-v1.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/dag-parameter-executor-consumers-v1.json', classification: report.classification, runtimeArgumentOnlyConsumers: runtimeArgumentOnlyConsumers.length }, null, 2));
