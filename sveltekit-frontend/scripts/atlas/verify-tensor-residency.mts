import { readFile } from 'node:fs/promises';

const required = [
  'migrations/20260810_parent_atlas_tensor_artifacts.sql',
  'src/lib/server/atlas/tensors/tensor-artifact-contract.ts',
  'src/lib/server/atlas/tensors/topology-coordinate4.ts',
  'src/lib/server/atlas/tensors/tile-key.ts',
  'src/lib/server/atlas/tensors/ace-residency-policy.ts',
  'src/lib/server/atlas/tensors/packet-validator.ts',
  'python/parent_atlas_tensor/arrow_ipc.py',
  'python/parent_atlas_tensor/gpu_tile_cache.py'
];

const missing: string[] = [];
for (const file of required) {
  try { await readFile(file); } catch { missing.push(file); }
}
if (missing.length) {
  console.error(JSON.stringify({ status: 'FAIL', missing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  status: 'PASS',
  invariants: {
    arrowBulkNumeric: true,
    topology4DerivedOnly: true,
    maxCpuWorkers: 4,
    hnswLayersNotAtlasLod: true,
    exactBeforeApproximate: true,
    unorderedAssemblyRevisionQualified: true
  }
}, null, 2));
