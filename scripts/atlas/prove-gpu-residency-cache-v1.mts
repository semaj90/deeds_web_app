#!/usr/bin/env tsx

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { GpuResidencyCacheV1 } from '../../sveltekit-frontend/src/lib/server/atlas/gpu/gpu-residency-cache-v1.js';

const root = resolve(import.meta.dirname, '../..');
const input = resolve(process.argv.find((value) => value.startsWith('--input='))?.slice('--input='.length) ?? '.tmp/atlas/candidate-feature-gpu-envelope-feat04-v1.json');
const output = resolve(process.argv.find((value) => value.startsWith('--output='))?.slice('--output='.length) ?? 'docs/reports/gpu-residency-cache-proof-v1.json');
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

async function main() {
  const envelope = JSON.parse(await readFile(input, 'utf8'));
  const pack = envelope.pack;
  if (!pack || !envelope.gather) throw new Error('GPU_CACHE_FEAT04_ENVELOPE_REQUIRED');
  const makeKey = (featureRevision: string) => ({
    schema: 'atlas.gpu-artifact-key.v1' as const,
    artifactKind: 'CANDIDATE_FEATURE_MATRIX',
    artifactRevision: `feat04:${pack.gpuPackChecksum}`,
    candidateSnapshotRevision: pack.candidateSnapshotRevision,
    graphRevision: null,
    projectionRevision: null,
    representationRevision: featureRevision,
    ordinalMapChecksum: pack.ordinalMapChecksum,
    payloadChecksum: pack.gpuPackChecksum,
    dtype: 'float32' as const,
    shape: [pack.physicalRows, pack.featureCount],
    layout: 'row-major-f32',
    deviceId: 0,
    materializationPolicyRevision: 'gpu-residency-policy:v1',
  });
  const key = makeKey(pack.featureRevision);
  const cache = new GpuResidencyCacheV1<{ gpuPackChecksum: string; gatherChecksum: string }>(10_000_000, () => 1);
  const miss = cache.get(key);
  const stored = cache.set(key, { gpuPackChecksum: pack.gpuPackChecksum, gatherChecksum: envelope.gather.gatherChecksum }, pack.featureValues.length * 4);
  const hit = cache.get(key);
  const invalidated = cache.invalidateByRevision(pack.featureRevision);
  const afterInvalidation = cache.get(key);
  const report = {
    schema: 'atlas.gpu-residency-cache-proof.v1',
    status: miss.status === 'MISS' && stored.status === 'STORED' && hit.status === 'HIT' && invalidated === 1 && afterInvalidation.status === 'MISS' ? 'GPU_RESIDENCY_CACHE_CONTRACT_PROVEN' : 'FAIL',
    input,
    keyChecksum: hit.keyChecksum,
    sourceGpuPackChecksum: pack.gpuPackChecksum,
    sourceGatherChecksum: envelope.gather.gatherChecksum,
    logicalRows: pack.logicalRows,
    physicalRows: pack.physicalRows,
    featureCount: pack.featureCount,
    observations: { initial: miss.status, store: stored.status, exactReuse: hit.status, reusedPayload: hit.value, invalidated, postInvalidation: afterInvalidation.status },
    cacheChecksum: sha256(JSON.stringify({ keyChecksum: hit.keyChecksum, sourceGpuPackChecksum: pack.gpuPackChecksum, sourceGatherChecksum: envelope.gather.gatherChecksum })),
    canonicalAuthority: false,
    writesPerformed: false,
    cudaExecutionObserved: false,
    note: 'Contract-level in-process cache proof; persistent CUDA cache-hit and VRAM-pressure proof remain separate.',
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
