import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(repoRoot, 'docs/reports/tensorrt-rtx-prerequisites-v1.json');

function run(command, args) {
  try {
    return { available: true, output: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() };
  } catch (error) {
    return { available: false, output: error?.stderr?.toString?.().trim() ?? error?.message ?? 'UNAVAILABLE' };
  }
}

const gpu = run('nvidia-smi', ['--query-gpu=name,compute_cap,driver_version,memory.total', '--format=csv,noheader']);
const cuda = run('nvcc', ['--version']);
const python = run('python', ['--version']);
const tensorRt = run('python', ['-c', "import importlib.metadata as m; print(m.version('tensorrt'))"]);
const tensorRtRtx = run('python', ['-c', "import importlib.metadata as m; print(m.version('tensorrt-rtx'))"]);
const trtexec = run('trtexec', ['--version']);

const report = {
  schema: 'atlas.tensorrt-rtx-prerequisites.v1',
  capturedAt: new Date().toISOString(),
  gpu,
  cuda,
  python,
  packages: { tensorrt: tensorRt, tensorrtRtx: tensorRtRtx },
  trtexec,
  compatibility: {
    target: 'TensorRT-RTX-1.6',
    requiredCudaLines: ['13.4', '12.9 Update 1'],
    installedCudaDetected: cuda.output.match(/release\s+([0-9.]+)/i)?.[1] ?? null,
    status: tensorRtRtx.available ? 'PACKAGE_PRESENT_REQUIRES_VERSION_AND_CUDA_MATCH' : 'TENSORRT_RTX_NOT_INSTALLED_OR_PROVEN',
    existingEnvironmentChanged: false,
    writesPerformed: false,
    canonicalAuthority: false,
  },
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.compatibility.status, installedCuda: report.compatibility.installedCudaDetected }));
