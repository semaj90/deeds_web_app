import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'docs', 'reports');

const evidenceFiles = {
  rapidsCapability: 'candidate-feature-gpu-capability-live-20260912.json',
  rapidsResidency: 'candidate-feature-gpu-residency-live-20260911.json',
  rapidsRuntime: 'rapids-runtime-alignment-v1.json',
  wslReadiness: 'wsl2-rapids-sidecar-readiness-2026-08-28.json',
  stackReadiness: 'atlas-gpu-inference-stack-readiness-v1.json',
  onnxParity: 'onnx-cpu-webgpu-parity-v1.json',
  leaseOwner: 'candidate-feature-gpu-lease-owner-v1.json',
  budgetContract: 'gpu-residency-budget-v1.json',
  unifiedResidency: 'unified-residency-adapter-v1.json',
};

function readEvidence(file) {
  const absolute = path.join(reportDir, file);
  if (!fs.existsSync(absolute)) {
    return { file, present: false, value: null };
  }
  return { file, present: true, value: JSON.parse(fs.readFileSync(absolute, 'utf8')) };
}

const evidence = Object.fromEntries(
  Object.entries(evidenceFiles).map(([key, file]) => [key, readEvidence(file)]),
);
const value = (key) => evidence[key]?.value ?? null;
const now = new Date().toISOString();
const stack = value('stackReadiness');
const wsl = value('wslReadiness');
const rapids = value('rapidsCapability');
const residency = value('rapidsResidency');
const parity = value('onnxParity');

const receipt = {
  schema: 'ParentAtlasGpuExecutorCapabilityV1',
  generatedAt: now,
  readOnly: true,
  status: 'CAPABILITY_INVENTORY_COMPLETE_PROMOTION_BLOCKED',
  canonicalAuthority: false,
  writesPerformed: false,
  mutationPolicy: {
    database: false,
    ddl: false,
    qdrant: false,
    valkey: false,
    graph: false,
    sourceData: false,
    cudaRapidsUpgrade: false,
    engineBuild: false,
  },
  hardware: stack?.hardware ?? wsl?.runtime ?? null,
  executors: [
    {
      executor: 'pytorch_cuda_cuvs_cugraph_wsl2',
      lane: 'graph_ann_gpu',
      status: rapids?.status === '8098_CAPABILITY_RECEIPT_PROVEN' ? 'CAPABILITY_PROVEN' : 'UNPROVEN',
      authority: 'projection_executor_only',
      evidence: [evidenceFiles.rapidsCapability, evidenceFiles.wslReadiness],
      details: {
        service: rapids?.baseUrl ?? 'http://127.0.0.1:8098',
        cudaAvailable: rapids?.health?.cudaAvailable ?? wsl?.checks?.torchCudaAvailable ?? false,
        torchAvailable: rapids?.health?.torchAvailable ?? null,
        device: rapids?.health?.device ?? wsl?.runtime?.deviceName ?? null,
        cuvs: wsl?.packages?.cuvs ?? stack?.wslRapids?.cuvs ?? null,
        cugraph: wsl?.packages?.cugraph ?? stack?.wslRapids?.cugraph ?? null,
        writes: rapids?.health?.writes ?? wsl?.authority ?? null,
      },
    },
    {
      executor: 'pytorch_cuda_windows',
      lane: 'neural_reference_challenger',
      status: 'CAPABILITY_METADATA_ONLY_PARITY_OPEN',
      authority: 'challenger_only',
      evidence: [evidenceFiles.stackReadiness],
      details: {
        cudaToolkit: stack?.windows?.cudaPath ?? null,
        torch: stack?.windows?.torch ?? null,
        torchCudaRuntime: stack?.windows?.torchCudaRuntime ?? null,
        computeCapability: stack?.hardware?.computeCapability ?? null,
      },
    },
    {
      executor: 'onnx_runtime_webgpu',
      lane: 'semantic_embedding_challenger',
      status: parity?.status === 'PARITY_OBSERVED_UNADMITTED' ? 'PARITY_OBSERVED_UNADMITTED' : 'UNPROVEN',
      authority: 'bounded_challenger_only',
      evidence: [evidenceFiles.onnxParity],
      details: {
        representationId: parity?.representationId ?? 'semantic_768',
        dimensions: parity?.dimensions ?? 768,
        requestedProviders: parity?.requestedProviders ?? ['webgpu'],
        cosine: parity?.parity?.cosine ?? null,
        meanAbsoluteDelta: parity?.parity?.meanAbsoluteDelta ?? null,
        maxAbsoluteDelta: parity?.parity?.maxAbsoluteDelta ?? null,
        canonicalPrimaryEligible: false,
      },
    },
    {
      executor: 'onnx_runtime_directml',
      lane: 'semantic_embedding_challenger',
      status: 'NOT_CURRENTLY_PROVEN',
      authority: 'challenger_only',
      evidence: [evidenceFiles.stackReadiness],
      details: {
        observedProviders: stack?.windows?.onnxruntimeProviders ?? [],
        note: 'Provider metadata exists, but no current DirectML execution receipt is admitted.',
      },
    },
    {
      executor: 'tensorrt_rtx',
      lane: 'isolated_neural_challenger',
      status: 'NOT_INSTALLED_OR_PROVEN',
      authority: 'none',
      evidence: [evidenceFiles.stackReadiness, evidenceFiles.rapidsRuntime],
      details: {
        observedTensorRT: stack?.windows?.tensorrt ?? null,
        tensorRtRtxVersion: null,
        cudaToolkit: stack?.windows?.cudaPath ?? null,
        compatibility: 'UNRESOLVED',
        reason: 'TensorRT-RTX is distinct from the observed TensorRT runtime; no SDK/support-matrix receipt exists.',
        nextProof: 'Read-only compatibility check, then isolated capability receipt; no engine build in this tranche.',
      },
    },
  ],
  residency: {
    status: residency?.status ?? 'UNPROVEN',
    owner: value('leaseOwner')?.canonicalOwner?.module ?? null,
    budgetOwner: value('budgetContract') ? 'PURE_CONTRACT_PROVEN_RUNTIME_ENFORCEMENT_OPEN' : 'NOT_YET_CONVERGED',
    evidence: [evidenceFiles.rapidsResidency, evidenceFiles.leaseOwner, evidenceFiles.budgetContract, evidenceFiles.unifiedResidency],
    provenInvariants: {
      residentReuse: residency?.residentReuse?.sameResidentTensorObjects ?? false,
      postReleaseAccessBlocked: residency?.postReleaseAccessBlocked ?? false,
      rawPointersExposed: residency?.residentReuse?.rawPointersExposed ?? null,
      storeWrites: residency?.storeWrites ?? true,
    },
    promotionBlocker: 'Pure budget ownership is proven; live registration and cross-executor accounting remain unproven.',
  },
  blockers: [
    'Canonical packet/source lineage remains upstream and unresolved.',
    'TensorRT-RTX/CUDA support-matrix compatibility is not established for the workstation.',
    'No current DirectML receipt is admitted.',
    'CPU↔WebGPU parity is observed but unadmitted.',
    'Live cross-executor residency registration and accounting are not yet proven.',
  ],
  evidenceManifest: Object.fromEntries(
    Object.entries(evidence).map(([key, item]) => [key, { file: item.file, present: item.present }]),
  ),
};

fs.mkdirSync(reportDir, { recursive: true });
const stagingDir = path.join(reportDir, 'staging');
const writtenReports = [];
function writeReport(name, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(reportDir, name);
  try {
    fs.writeFileSync(target, body);
    writtenReports.push(path.relative(root, target));
  } catch (error) {
    fs.mkdirSync(stagingDir, { recursive: true });
    const staged = path.join(stagingDir, name);
    fs.writeFileSync(staged, body);
    writtenReports.push(path.relative(root, staged));
    console.warn(`report write staged: ${name}: ${error.code ?? error.message}`);
  }
}

writeReport('gpu-executor-capability-v1.json', receipt);
writeReport('tensorrt-rtx-capability-v1.json', {
    schema: 'TensorRtRtxCapabilityReceiptV1',
    generatedAt: now,
    readOnly: true,
    status: 'NOT_INSTALLED_OR_PROVEN',
    canonicalAuthority: false,
    writesPerformed: false,
    observedTensorRT: stack?.windows?.tensorrt ?? null,
    tensorRtRtxVersion: null,
    cudaToolkit: stack?.windows?.cudaPath ?? null,
    environment: {
      os: `${process.platform}-${os.release()}`,
      gpu: stack?.hardware?.gpu ?? null,
      driver: stack?.hardware?.driver ?? null,
      computeCapability: stack?.hardware?.computeCapability ?? null,
      observedTensorRT: stack?.windows?.tensorrt ?? null,
      torch: stack?.windows?.torch ?? null,
      torchCudaRuntime: stack?.windows?.torchCudaRuntime ?? null,
    },
    computeCapability: stack?.hardware?.computeCapability ?? null,
    compatibility: 'UNRESOLVED',
    engineBuilt: false,
    runtimeCacheObserved: false,
    evidence: [evidenceFiles.stackReadiness, evidenceFiles.rapidsRuntime],
    nextGate: 'PIN_OFFICIAL_SUPPORT_MATRIX_THEN_RUN_ISOLATED_CAPABILITY_CHECK',
});

console.log(JSON.stringify({
  status: receipt.status,
  executors: receipt.executors.map(({ executor, status }) => ({ executor, status })),
  residency: receipt.residency.status,
  writesPerformed: false,
  reports: writtenReports,
}, null, 2));
