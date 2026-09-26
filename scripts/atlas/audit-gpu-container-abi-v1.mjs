import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(
  repoRoot,
  process.argv[2] ?? 'docs/reports/gpu-container-abi-v1.json',
);

const entries = [
  ['docker/langgraph-synthesis/Dockerfile', 'langgraph-synthesis', 'orchestration', 'cuda-12.8-pytorch'],
  ['docker/atlas-gpu-8098/Dockerfile', 'atlas-gpu-8098', 'rapids-cuvs-cugraph', 'rapids-cuda-12'],
  ['docker/atlas-neural-decoder/Dockerfile', 'atlas-neural-decoder', 'pytorch-neural', 'pytorch-cuda-13.2'],
  ['docker/atlas-gemma-rank/Dockerfile', 'atlas-gemma-rank', 'pytorch-neural', 'pytorch-cuda-13.2'],
  ['docker/cuvs-grpc/Dockerfile', 'cuvs-grpc', 'legacy-cuvs', 'cuda-12.1-legacy'],
  ['docker/Dockerfile.cuda', 'legal-ai-gpu', 'legacy-pytorch', 'pytorch-cuda-12.6'],
  ['docker/omni-worker/Dockerfile', 'omni-worker', 'node-native-bridge', 'conda-cuda-12.1'],
  ['docker/Dockerfile', 'trtllm-base', 'tensorrt-llm', 'ngc-tensorrt-llm'],
  ['docker/Dockerfile.trtllm', 'trtllm-builder', 'tensorrt-llm', 'ngc-tensorrt-llm-unpinned'],
];

function inspectDockerfile(relativePath, service, lane, family) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return { relativePath, service, lane, family, present: false, from: [], cudaMentions: [] };
  }
  const text = readFileSync(absolutePath, 'utf8');
  return {
    relativePath,
    service,
    lane,
    family,
    present: true,
    from: [...text.matchAll(/^FROM\s+(.+)$/gim)].map((match) => match[1].trim()),
    cudaMentions: text
      .split(/\r?\n/)
      .filter((line) => /cuda|cuvs|cugraph|cutile|tensorrt|torch/i.test(line))
      .slice(0, 30),
  };
}

const images = entries.map(([path, service, lane, family]) =>
  inspectDockerfile(path, service, lane, family),
);
const pytorch13 = images.filter((image) => image.family === 'pytorch-cuda-13.2');
const missing = images.filter((image) => !image.present).map((image) => image.relativePath);

const report = {
  schema: 'atlas.gpu-container-abi-audit.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  hostCompatibility: {
    observedCudaToolkit: '13.0',
    observedGpu: 'NVIDIA GeForce RTX 3060 Ti',
    observedComputeCapability: '8.6',
    observedDriver: '580.88',
    tensorRtRtxTarget: '1.6',
    tensorRtRtxSupportedCudaPackages: ['13.4', '12.9 Update 1'],
    status: 'CUDA_13_0_IS_NOT_A_TENSORRT_RTX_1_6_PACKAGE_TARGET',
    action: 'KEEP_TENSORRT_RTX_ISOLATED_UNTIL_MATCHING_TOOLKIT_AND_PACKAGE_ARE_PROVEN',
  },
  images,
  duplicateBaseFindings: [
    {
      services: pytorch13.map((image) => image.service),
      finding: 'SHARED_PINNED_PYTORCH_CUDA_13_2_BASE',
      action: 'KEEP_SHARED_BASE; DO_NOT_CREATE_ANOTHER_PYTORCH_CUDA_IMAGE',
    },
  ],
  lanePolicy: {
    rapids: 'WSL2_RAPIDS_CUDA_12_LANE; OWNS_CUVS_CUGRAPH; NOT_TENSORRT_RTX',
    pytorch: 'CUDA_13_2_SM86_REFERENCE_AND_CUTILE_SIMT_CHALLENGER',
    langgraph: 'ORCHESTRATION_ONLY; NO_TENSORRT_RTX_OR_CUVS_DEPENDENCY_REQUIRED',
    tensorRtRtx: 'OPT_IN_ISOLATED_13_4_OR_12_9_LANE; NO_SHARED_PYTHON_ENV_WITH_RAPIDS',
    simt: 'PYTORCH_CUDA_REFERENCE; CUTILE_IS_A_SEPARATE_KERNEL_CHALLENGER',
  },
  findings: [
    'Multiple CUDA families are intentional provider boundaries, but legacy 12.1/12.6 images should not be treated as current RTX alignment.',
    'atlas-neural-decoder and atlas-gemma-rank already share the same pinned CUDA 13.2/PyTorch base digest.',
    'cuTile can interoperate with SIMT kernels, but it does not make a TensorRT-RTX engine or replace the PyTorch numerical reference.',
    'TensorRT-RTX is distinct from TensorRT-LLM; the existing NGC TensorRT-LLM images are not TensorRT-RTX proof.',
  ],
  missing,
  nextGate: 'ISOLATED_TENSORRT_RTX_13_4_CAPABILITY_RECEIPT',
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  reportPath: relative(repoRoot, reportPath),
  imageCount: images.length,
  sharedPytorch13BaseServices: pytorch13.map((image) => image.service),
  tensorRtRtxStatus: report.hostCompatibility.status,
  writesPerformed: false,
}, null, 2));
