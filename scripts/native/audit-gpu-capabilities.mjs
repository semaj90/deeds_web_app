#!/usr/bin/env node
// audit-gpu-capabilities.mjs
// Detect the full GPU/native capability matrix for simd-bridge and emit
// .tmp/gpu-capabilities-audit.json + .tmp/gpu-capabilities-audit.md

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT = path.resolve(process.cwd());
const TMP = path.join(ROOT, '.tmp');
const OUT_JSON = path.join(TMP, 'gpu-capabilities-audit.json');
const OUT_MD = path.join(TMP, 'gpu-capabilities-audit.md');
const CPP_DIR = path.join(ROOT, 'simd-bridge', 'cpp');
const PRESETS_FILE = path.join(CPP_DIR, 'CMakePresets.json');
const VSCODE_SETTINGS = path.join(ROOT, '.vscode', 'settings.json');

fs.mkdirSync(TMP, { recursive: true });

// ── helpers ────────────────────────────────────────────────────────────────

function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', shell: true, ...opts });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function findFile(candidates) {
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function globFirst(dir, prefix) {
  try {
    const entries = fs.readdirSync(dir);
    const match = entries.filter(e => e.startsWith(prefix)).sort().pop();
    return match ? path.join(dir, match) : null;
  } catch { return null; }
}

// ── 1. CUDA Toolkit ────────────────────────────────────────────────────────

const cudaEnvPath = process.env.CUDA_PATH || process.env.CUDA_HOME || null;
const nvidiaCudaBase = 'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA';
const latestCudaDir = globFirst(nvidiaCudaBase, 'v');
const cudaCandidates = [
  cudaEnvPath,
  'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.0',
  latestCudaDir,
  'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.9',
  'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.6',
  'C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v12.1',
  '/usr/local/cuda',
  '/usr/local/cuda-13',
  '/usr/local/cuda-12',
];
const cudaRoot = findFile(cudaCandidates);
const cudaFound = !!cudaRoot;

let nvccVersion = null;
let cudaToolkitVersion = null;
if (cudaRoot) {
  const nvcc = path.join(cudaRoot, 'bin', os.platform() === 'win32' ? 'nvcc.exe' : 'nvcc');
  if (fs.existsSync(nvcc)) {
    const r = run(nvcc, ['--version']);
    if (r.ok) {
      nvccVersion = r.stdout;
      const m = r.stdout.match(/release\s+([\d.]+)/i);
      if (m) cudaToolkitVersion = m[1];
    }
  }
}
if (!nvccVersion) {
  const r = run('nvcc', ['--version']);
  if (r.ok) {
    nvccVersion = r.stdout;
    const m = r.stdout.match(/release\s+([\d.]+)/i);
    if (m) cudaToolkitVersion = m[1];
  }
}

// cudart
const cudartFound = cudaRoot
  ? fs.existsSync(path.join(cudaRoot, 'lib', 'x64', 'cudart.lib')) ||
    fs.existsSync(path.join(cudaRoot, 'lib64', 'libcudart.so')) ||
    fs.existsSync(path.join(cudaRoot, 'lib64', 'libcudart_static.a'))
  : false;

// ── 2. cuBLAS ─────────────────────────────────────────────────────────────

const cublasFound = cudaRoot
  ? fs.existsSync(path.join(cudaRoot, 'lib', 'x64', 'cublas.lib')) ||
    fs.existsSync(path.join(cudaRoot, 'lib64', 'libcublas.so'))
  : false;

const cublasLtFound = cudaRoot
  ? fs.existsSync(path.join(cudaRoot, 'lib', 'x64', 'cublasLt.lib')) ||
    fs.existsSync(path.join(cudaRoot, 'lib64', 'libcublasLt.so'))
  : false;

// ── 3. cuDNN ──────────────────────────────────────────────────────────────

const condaPrefix = process.env.CONDA_PREFIX || null;
const cudnnCandidates = [
  process.env.CUDNN_ROOT,
  cudaRoot,
  'C:/Program Files/NVIDIA/CUDNN/v9',
  '/usr/local',
  '/usr',
  condaPrefix,
  condaPrefix ? path.join(condaPrefix, 'Library') : null,
];
let cudnnRoot = null;
let cudnnVersion = null;
for (const c of cudnnCandidates) {
  if (!c) continue;
  const h = path.join(c, 'include', 'cudnn.h');
  const h2 = path.join(c, 'include', 'cudnn_version.h');
  if (fs.existsSync(h) || fs.existsSync(h2)) {
    cudnnRoot = c;
    try {
      const src = fs.readFileSync(fs.existsSync(h2) ? h2 : h, 'utf-8');
      const maj = src.match(/#define\s+CUDNN_MAJOR\s+(\d+)/);
      const min = src.match(/#define\s+CUDNN_MINOR\s+(\d+)/);
      const pat = src.match(/#define\s+CUDNN_PATCHLEVEL\s+(\d+)/);
      if (maj) cudnnVersion = `${maj[1]}.${min?.[1] ?? 'x'}.${pat?.[1] ?? 'x'}`;
    } catch { /* ignore */ }
    break;
  }
}
const cudnnFound = !!cudnnRoot;

// ── 4. cuVS ───────────────────────────────────────────────────────────────

const cuvsCandidates = [
  process.env.CUVS_ROOT,
  condaPrefix ? path.join(condaPrefix, 'Library') : null,
  condaPrefix,
  '/usr/local',
  '/opt/conda',
  'C:/rapids/cuvs',
];
let cuvsRoot = null;
let cuvsHasCagra = false;
let cuvsHasRabitq = false;
for (const c of cuvsCandidates) {
  if (!c) continue;
  if (fs.existsSync(path.join(c, 'include', 'cuvs', 'neighbors', 'ivf_pq.hpp'))) {
    cuvsRoot = c;
    cuvsHasCagra = fs.existsSync(path.join(c, 'include', 'cuvs', 'neighbors', 'cagra.hpp'));
    cuvsHasRabitq = fs.existsSync(path.join(c, 'include', 'cuvs', 'neighbors', 'ivf_rabitq.hpp'));
    break;
  }
}
const cuvsFound = !!cuvsRoot;

// ── 5. CUTLASS ────────────────────────────────────────────────────────────

const userHome = process.env.USERPROFILE || process.env.HOME || '';
const cutlassCandidates = [
  process.env.CUTLASS_ROOT,
  'C:/cutlass',
  userHome ? path.join(userHome, 'cutlass') : null,
  '/opt/cutlass',
];
const cutlassRoot = cutlassCandidates.find(c =>
  c && fs.existsSync(path.join(c, 'include', 'cutlass', 'gemm', 'device', 'gemm.h'))
) || null;
const cutlassFound = !!cutlassRoot;

// ── 6. LibTorch ───────────────────────────────────────────────────────────

const libtorchEnv = process.env.LIBTORCH_ROOT || null;
// auto-glob C:/libtorch-win-shared-with-deps-*
const globbedBase = globFirst('C:/', 'libtorch-win-shared-with-deps-');
const libtorchCandidates = [
  libtorchEnv,
  'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch',
  globbedBase ? path.join(globbedBase, 'libtorch') : null,
  'C:/libtorch-win-shared-with-deps-2.7.0+cu121/libtorch',
  '/opt/libtorch',
  userHome ? path.join(userHome, 'libtorch') : null,
];
let libtorchRoot = null;
let torchConfigFound = false;
for (const c of libtorchCandidates) {
  if (!c) continue;
  const cfg = path.join(c, 'share', 'cmake', 'Torch', 'TorchConfig.cmake');
  if (fs.existsSync(cfg)) {
    libtorchRoot = c;
    torchConfigFound = true;
    break;
  }
  if (fs.existsSync(path.join(c, 'lib')) && fs.existsSync(path.join(c, 'include'))) {
    libtorchRoot = c;
    break;
  }
}
const libtorchFound = !!libtorchRoot;

// ── 7. Python interpreter ─────────────────────────────────────────────────

let pythonPath = null;
let pythonVersion = null;
let pythonSource = 'not found';

if (fs.existsSync(VSCODE_SETTINGS)) {
  try {
    const s = JSON.parse(fs.readFileSync(VSCODE_SETTINGS, 'utf-8'));
    const raw = s['python.defaultInterpreterPath'];
    if (raw) {
      const p = raw.replace('${workspaceFolder}', ROOT).replace(/\//g, path.sep);
      if (fs.existsSync(p)) {
        pythonPath = p;
        pythonSource = 'vscode settings.json';
      }
    }
  } catch { /* ignore */ }
}
if (!pythonPath) {
  const venvPy = findFile([
    path.join(ROOT, '.venv', 'Scripts', 'python.exe'),
    path.join(ROOT, '.venv', 'bin', 'python'),
  ]);
  if (venvPy) { pythonPath = venvPy; pythonSource = '.venv (workspace)'; }
}
if (!pythonPath) {
  for (const cmd of ['python', 'python3']) {
    const r = run(cmd, ['--version']);
    if (r.ok || r.stderr.startsWith('Python')) {
      pythonSource = `PATH ${cmd}`;
      pythonVersion = (r.stdout || r.stderr).trim();
      break;
    }
  }
}
if (pythonPath && !pythonVersion) {
  const r = run(pythonPath, ['--version']);
  pythonVersion = (r.stdout || r.stderr).trim();
}

let pyenvVersion = null;
const pyenvFile = path.join(ROOT, '.python-version');
if (fs.existsSync(pyenvFile)) pyenvVersion = fs.readFileSync(pyenvFile, 'utf-8').trim();

const versionMismatch = !!(pyenvVersion && pythonVersion &&
  !pythonVersion.includes(pyenvVersion.split('.').slice(0, 2).join('.')));

// ── 8. VS Code CMake settings ─────────────────────────────────────────────

let vscodePreset = null;
let vscodeCmakeSourceDir = null;
let vscodeGenerator = null;
if (fs.existsSync(VSCODE_SETTINGS)) {
  try {
    const s = JSON.parse(fs.readFileSync(VSCODE_SETTINGS, 'utf-8'));
    vscodePreset = s['cmake.defaultConfigurePreset'] || null;
    vscodeCmakeSourceDir = s['cmake.sourceDirectory'] || null;
    vscodeGenerator = s['cmake.generator'] || null;
  } catch { /* ignore */ }
}

// ── 9. Preset audit (win32/x86 guard) ────────────────────────────────────

const presetAudit = { presetsFile: PRESETS_FILE, found: false, issues: [] };
if (fs.existsSync(PRESETS_FILE)) {
  try {
    const presets = JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf-8'));
    presetAudit.found = true;
    for (const p of (presets.configurePresets || [])) {
      const arch = String(p.architecture || '').toLowerCase();
      if (arch === 'win32' || arch === 'x86')
        presetAudit.issues.push(`"${p.name}": architecture="${p.architecture}" (must be x64)`);
      const ts = typeof p.toolset === 'string' ? p.toolset : (p.toolset?.value || '');
      if (ts.includes('host=x86'))
        presetAudit.issues.push(`"${p.name}": toolset host=x86 (must be host=x64)`);
    }
  } catch (e) {
    presetAudit.issues.push(`Parse error: ${e.message}`);
  }
}

// ── 10. Assemble and emit ─────────────────────────────────────────────────

const timestamp = new Date().toISOString();
const result = {
  timestamp,
  platform: os.platform(),
  arch: os.arch(),
  cudaRuntime: {
    found: cudaFound, root: cudaRoot,
    toolkitVersion: cudaToolkitVersion,
    nvccVersion: nvccVersion ? nvccVersion.split('\n')[0] : null,
    cudartLibFound: cudartFound,
    envPath: cudaEnvPath,
  },
  cuBLAS: { found: cublasFound, ltFound: cublasLtFound },
  cuDNN: {
    found: cudnnFound, root: cudnnRoot, version: cudnnVersion,
    linuxOnly: os.platform() === 'win32',
    note: os.platform() === 'win32'
      ? (cudnnFound ? 'found (limited on Windows native)' : 'not found — cuDNN 9.x SDPA requires Linux/WSL2/Docker')
      : (cudnnFound ? `found at ${cudnnRoot}` : 'not found — apt-get install libcudnn9-dev-cuda-12'),
  },
  cuVS: { found: cuvsFound, root: cuvsRoot, hasCagra: cuvsHasCagra, hasIvfRabitq: cuvsHasRabitq },
  cutlass: { found: cutlassFound, root: cutlassRoot },
  libtorch: { found: libtorchFound, root: libtorchRoot, torchConfigFound, envVar: libtorchEnv },
  python: { path: pythonPath, version: pythonVersion, source: pythonSource, pyenvVersion, versionMismatch },
  vsCode: { cmakePreset: vscodePreset, cmakeSourceDir: vscodeCmakeSourceDir, generator: vscodeGenerator },
  presetAudit,
  summary: {
    canBuildFallback:      true,
    canBuildCudaRuntime:   cudaFound && !!nvccVersion,
    canBuildCublas:        cudaFound && cublasFound,
    canBuildLibtorch:      cudaFound && libtorchFound && torchConfigFound,
    canBuildCudnn:         cudnnFound,
    canBuildCuvs:          cuvsFound,
    canBuildCutlass:       cudaFound && cutlassFound,
    win32Detected:         presetAudit.issues.length > 0,
  },
};

fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));

// ── Markdown report ───────────────────────────────────────────────────────

const ck = v => v ? '✅' : '❌';
const wn = v => v ? '⚠️' : '✅';

const md = `# GPU Capabilities Audit — simd-bridge
> Generated: ${timestamp}
> Platform: \`${result.platform}\` / \`${result.arch}\`

## Capability Matrix

| Component | Status | Detail |
|-----------|--------|--------|
| CUDA Runtime | ${ck(result.cudaRuntime.found)} | ${result.cudaRuntime.found ? `v${result.cudaRuntime.toolkitVersion} at \`${result.cudaRuntime.root}\`` : 'Not found — install CUDA Toolkit'} |
| nvcc | ${ck(!!result.cudaRuntime.nvccVersion)} | ${result.cudaRuntime.nvccVersion ?? 'not found'} |
| cudart library | ${ck(result.cudaRuntime.cudartLibFound)} | ${result.cudaRuntime.cudartLibFound ? 'found in toolkit lib/' : 'not found'} |
| cuBLAS | ${ck(result.cuBLAS.found)} | ${result.cuBLAS.found ? 'found in CUDA Toolkit' : 'not found'} |
| cuBLASLt | ${ck(result.cuBLAS.ltFound)} | ${result.cuBLAS.ltFound ? 'found (FP16/BF16 matmul heuristic)' : 'not found'} |
| cuDNN | ${ck(result.cuDNN.found)} | ${result.cuDNN.note} |
| cuVS / CAGRA | ${ck(result.cuVS.found)} | ${result.cuVS.found ? `found at \`${result.cuVS.root}\` (CAGRA=${result.cuVS.hasCagra}, IVF-RaBitQ=${result.cuVS.hasIvfRabitq})` : 'not found — conda install -c rapidsai cuvs-cu13'} |
| CUTLASS 3.x | ${ck(result.cutlass.found)} | ${result.cutlass.found ? `found at \`${result.cutlass.root}\`` : 'not found — git clone https://github.com/NVIDIA/cutlass C:/cutlass'} |
| LibTorch | ${ck(result.libtorch.found)} | ${result.libtorch.found ? `\`${result.libtorch.root}\`` : 'not found'} |
| TorchConfig.cmake | ${ck(result.libtorch.torchConfigFound)} | ${result.libtorch.torchConfigFound ? 'found — CMake find_package(Torch) will succeed' : 'not found — LibTorch path wrong or missing'} |

## Python Interpreter

| Field | Value |
|-------|-------|
| Path | \`${result.python.path ?? 'not found'}\` |
| Version | ${result.python.version ?? 'unknown'} |
| Source | ${result.python.source} |
| pyenv .python-version | ${result.python.pyenvVersion ?? 'not set'} |
| Version mismatch | ${wn(result.python.versionMismatch)} ${result.python.versionMismatch ? `**MISMATCH** — pyenv wants ${result.python.pyenvVersion} but interpreter is ${result.python.version}` : 'OK'} |

## VS Code CMake Settings

| Setting | Value |
|---------|-------|
| cmake.defaultConfigurePreset | \`${result.vsCode.cmakePreset ?? '(not set)'}\` |
| cmake.sourceDirectory | \`${result.vsCode.cmakeSourceDir ?? '(not set)'}\` |
| cmake.generator | \`${result.vsCode.generator ?? '(not set)'}\` |

## Preset Audit (win32/x86 guard)

${presetAudit.found
  ? (presetAudit.issues.length === 0
    ? '✅ All configure presets use x64 architecture and host=x64 toolset — no win32 contamination.'
    : '⚠️ **Issues detected:**\n\n' + presetAudit.issues.map(i => `- ${i}`).join('\n'))
  : `❌ \`${PRESETS_FILE}\` not found`}

## Build Capability Summary

| Preset | Buildable | Reason |
|--------|-----------|--------|
| \`windows-x64-fallback\` | ✅ | MSVC + Node headers only (always) |
| \`windows-x64-cuda-runtime\` | ${ck(result.summary.canBuildCudaRuntime)} | ${result.summary.canBuildCudaRuntime ? 'nvcc found' : 'needs nvcc + CUDA Toolkit'} |
| \`windows-x64-cuda-cublas\` | ${ck(result.summary.canBuildCublas)} | ${result.summary.canBuildCublas ? 'cuBLAS found in toolkit' : 'needs CUDA Toolkit with cuBLAS'} |
| \`windows-x64-cuda-libtorch\` | ${ck(result.summary.canBuildLibtorch)} | ${result.summary.canBuildLibtorch ? 'LibTorch + TorchConfig found' : 'needs LibTorch download + LIBTORCH_ROOT env'} |
| \`windows-cuda\` (production) | ${ck(result.summary.canBuildLibtorch)} | same as above |
| cuDNN (\`wsl2-cuda\`) | ${ck(result.summary.canBuildCudnn)} | ${result.summary.canBuildCudnn ? 'found' : 'Linux/WSL2 only'} |
| cuVS CAGRA | ${ck(result.summary.canBuildCuvs)} | ${result.summary.canBuildCuvs ? 'RAPIDS found' : 'needs conda install -c rapidsai cuvs-cu13'} |
| CUTLASS 3.x | ${ck(result.summary.canBuildCutlass)} | ${result.summary.canBuildCutlass ? 'headers found' : 'needs git clone NVIDIA/cutlass'} |

${result.summary.win32Detected
  ? `## ⚠️ Architecture Issues\n\n${presetAudit.issues.map(i => `- ${i}`).join('\n')}\n\n**Fix**: all presets must have \`"architecture": "x64"\` and \`"toolset": { "value": "host=x64" }\`.\n`
  : ''}
## Recommended Commands

\`\`\`powershell
# Step 1 — always works (no GPU needed)
cmake --preset windows-x64-fallback
cmake --build --preset build-windows-x64-fallback

# Step 2 — if CUDA Toolkit detected
${result.summary.canBuildCublas ? 'cmake --preset windows-x64-cuda-cublas\ncmake --build --preset build-windows-x64-cuda-cublas' : '# ❌ cuBLAS not found — install CUDA Toolkit first'}

# Step 3 — full production build
${result.summary.canBuildLibtorch ? 'cmake --preset windows-x64-cuda-libtorch\ncmake --build --preset build-windows-x64-cuda-libtorch\n# OR\ncmake --preset windows-cuda\ncmake --build --preset release' : '# ❌ LibTorch not found — set LIBTORCH_ROOT=' + (result.libtorch.root ?? 'C:/libtorch-.../libtorch')}
\`\`\`

---
*Output: \`.tmp/gpu-capabilities-audit.json\` + \`.tmp/gpu-capabilities-audit.md\`*
*Reference: [docs/native/gpu-primitives-map.md](../../docs/native/gpu-primitives-map.md)*
`;

fs.writeFileSync(OUT_MD, md);

// ── Console summary ───────────────────────────────────────────────────────

console.log('\n═══ GPU Capabilities Audit ════════════════════════════════════');
console.log(`  CUDA Runtime    : ${result.cudaRuntime.found ? `✅ v${result.cudaRuntime.toolkitVersion} at ${result.cudaRuntime.root}` : '❌ not found'}`);
console.log(`  nvcc            : ${result.cudaRuntime.nvccVersion ? '✅ ' + result.cudaRuntime.nvccVersion.split('\n')[0] : '❌ not found'}`);
console.log(`  cudart lib      : ${result.cudaRuntime.cudartLibFound ? '✅' : '❌'}`);
console.log(`  cuBLAS          : ${result.cuBLAS.found ? '✅' : '❌'}`);
console.log(`  cuBLASLt        : ${result.cuBLAS.ltFound ? '✅' : '❌'}`);
console.log(`  cuDNN           : ${result.cuDNN.found ? `✅ v${result.cuDNN.version}` : `❌ ${result.cuDNN.note}`}`);
console.log(`  cuVS/CAGRA      : ${result.cuVS.found ? `✅ CAGRA=${result.cuVS.hasCagra} IVF-RaBitQ=${result.cuVS.hasIvfRabitq}` : '❌ not found'}`);
console.log(`  CUTLASS 3.x     : ${result.cutlass.found ? `✅ ${result.cutlass.root}` : '❌ not found'}`);
console.log(`  LibTorch        : ${result.libtorch.found ? `✅ ${result.libtorch.root}` : '❌ not found'}`);
console.log(`  TorchConfig     : ${result.libtorch.torchConfigFound ? '✅' : '❌'}`);
console.log(`  Python          : ${result.python.version ?? '❌'} [${result.python.source}]`);
console.log(`  VS Code preset  : ${result.vsCode.cmakePreset ?? '(not set)'}`);
console.log(`  Preset issues   : ${presetAudit.issues.length === 0 ? '✅ none' : '⚠️  ' + presetAudit.issues.join('; ')}`);
console.log('───────────────────────────────────────────────────────────────');
console.log(`  Build fallback  : ✅ always`);
console.log(`  Build cuda-rt   : ${result.summary.canBuildCudaRuntime ? '✅' : '❌ needs nvcc'}`);
console.log(`  Build cublas    : ${result.summary.canBuildCublas ? '✅' : '❌ needs CUDA Toolkit cuBLAS'}`);
console.log(`  Build libtorch  : ${result.summary.canBuildLibtorch ? '✅' : '❌ needs LibTorch + TorchConfig'}`);
console.log('═══════════════════════════════════════════════════════════════');
console.log(`\nWritten:\n  ${OUT_JSON}\n  ${OUT_MD}\n`);
