import fs from 'node:fs/promises';

import { verifyCandidateFeatureGpuParity } from '../../src/lib/server/atlas/features/candidate-feature-gpu-parity-v1.js';

function arg(name: string): string | null {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const inputPath = arg('input');
const observationPath = arg('observation');
if (!inputPath || !observationPath) {
  console.error('Usage: npx tsx scripts/atlas/verify-candidate-feature-gpu-parity.mts --input=<gpu-pack-envelope.json> --observation=<cuda-proof.json>');
  process.exitCode = 2;
} else {
  const envelope = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const observation = JSON.parse(await fs.readFile(observationPath, 'utf8'));

  if (observation.schema !== 'atlas.candidate-feature-gpu-cuda-proof.v1') {
    throw new Error(`CANDIDATE_FEATURE_GPU_OBSERVATION_SCHEMA_MISMATCH:${observation.schema}`);
  }
  if (observation.status !== 'CANDIDATE_FEATURE_GPU_PARITY_PROVEN' || observation.gpuExecutionObserved !== true) {
    throw new Error(`CANDIDATE_FEATURE_GPU_OBSERVATION_NOT_PROVEN:${observation.status}`);
  }
  if (observation.challenger !== 'PYTORCH_CUDA') {
    throw new Error(`CANDIDATE_FEATURE_GPU_OBSERVATION_CHALLENGER_MISMATCH:${observation.challenger}`);
  }
  if (observation.gpuPackChecksum !== envelope.pack?.gpuPackChecksum || observation.gatherChecksum !== envelope.gather?.gatherChecksum) {
    throw new Error('CANDIDATE_FEATURE_GPU_OBSERVATION_LINEAGE_MISMATCH');
  }
  if (observation.columnarChecksum !== envelope.columnar?.columnarChecksum) {
    throw new Error('CANDIDATE_FEATURE_GPU_OBSERVATION_COLUMNAR_MISMATCH');
  }
  if (!observation.observed || !Array.isArray(observation.observed.featureValues) || !Array.isArray(observation.observed.featurePresence)) {
    throw new Error('CANDIDATE_FEATURE_GPU_OBSERVATION_PAYLOAD_REQUIRED');
  }
  if (!Array.isArray(observation.observed.selectedOrdinals)) {
    throw new Error('CANDIDATE_FEATURE_GPU_OBSERVATION_ORDINALS_REQUIRED');
  }

  const receipt = verifyCandidateFeatureGpuParity({
    columnar: envelope.columnar,
    pack: envelope.pack,
    gather: envelope.gather,
    challenger: 'PYTORCH_CUDA',
    gpuExecutionObserved: true,
    observedFeatureValues: observation.observed.featureValues,
    observedFeaturePresence: observation.observed.featurePresence,
    observedSelectedOrdinals: observation.observed.selectedOrdinals,
    producerRevision: 'candidate-gpu-cuda-parity-verifier:v1',
  });

  console.log(JSON.stringify({
    ...receipt,
    status: 'CANDIDATE_FEATURE_GPU_PARITY_RECEIPT_PROVEN',
    cudaObservationChecksum: observation.observedChecksum,
    cudaDeviceName: observation.deviceName ?? null,
    torchVersion: observation.torchVersion ?? null,
    cudaVersion: observation.cudaVersion ?? null,
    storeWrites: false,
  }, null, 2));
}
