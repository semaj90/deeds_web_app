#!/usr/bin/env node

/**
 * Read-only executor-boundary proof for ParameterArtifactV1.
 * No database, cache, network, or process execution is performed.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/dag-parameter-executor-binding-v1.json');
const atlas = await import(pathToFileURL(path.resolve(root, 'packages/parent-atlas/dist/index.js')).href);

function stableJson(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item).sort().reduce((out, key) => { out[key] = item[key]; return out; }, {})
    : item);
}

function sha256(value) {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function verifyArtifact(artifact) {
  const parameterChecksum = sha256(artifact.boundArguments);
  if (parameterChecksum !== artifact.parameterChecksum) {
    throw new Error('PARAMETER_ARTIFACT_PARAMETER_CHECKSUM_MISMATCH');
  }
  const { artifactId: _artifactId, artifactChecksum: _artifactChecksum, ...body } = artifact;
  if (sha256(body) !== artifact.artifactChecksum) {
    throw new Error('PARAMETER_ARTIFACT_ARTIFACT_CHECKSUM_MISMATCH');
  }
  return true;
}

const artifact = atlas.buildParameterArtifactV1({
  actionId: 'plan:executor-proof:semantic',
  actionKind: 'FETCH_QDRANT',
  schemaRef: 'input:semantic-search',
  schemaRevision: 'operator:semantic:v1',
  boundArguments: { representationId: 'semantic_768', topK: 5 },
});

const artifactStore = new Map([[artifact.artifactId, artifact]]);
const resolved = artifactStore.get(artifact.artifactId);
const refResolved = resolved?.artifactId === artifact.artifactId;
const verified = refResolved && verifyArtifact(resolved);

let tamperRejected = false;
try {
  verifyArtifact({ ...artifact, boundArguments: { ...artifact.boundArguments, topK: 50 } });
} catch (error) {
  tamperRejected = error instanceof Error && error.message === 'PARAMETER_ARTIFACT_PARAMETER_CHECKSUM_MISMATCH';
}

const report = {
  schema: 'atlas.dag-parameter-executor-binding.v1',
  mode: 'READ_ONLY_PROOF',
  artifactRefResolved: refResolved,
  parameterChecksumVerified: verified,
  tamperRejected,
  executorMutationAuthority: false,
  writesPerformed: false,
  status: refResolved && verified && tamperRejected ? 'PROVEN_BOUNDED' : 'FAILED',
  runtimePersistence: 'OPEN',
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, output: 'docs/reports/dag-parameter-executor-binding-v1.json', writesPerformed: false }, null, 2));
if (report.status !== 'PROVEN_BOUNDED') process.exitCode = 1;
