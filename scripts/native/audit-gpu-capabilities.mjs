import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cppDir = path.join(repoRoot, 'simd-bridge', 'cpp');
const vscodeSettingsPath = path.join(repoRoot, '.vscode', 'settings.json');
const presetsPath = path.join(cppDir, 'CMakePresets.json');
const tmpDir = path.join(repoRoot, '.tmp');
const outJson = path.join(tmpDir, 'gpu-capabilities-audit.json');
const outMd = path.join(tmpDir, 'gpu-capabilities-audit.md');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(p, fallback = '') {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fallback;
  }
}

function which(cmd) {
  try {
    const raw = execFileSync('where', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && exists(candidate)) return candidate;
  }
  return '';
}

function expandWindowsCandidates(candidates) {
  const expanded = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    expanded.push(candidate);
    expanded.push(path.join(candidate, 'Library'));
  }
  return [...new Set(expanded)];
}

function parentDir(p, levels = 1) {
  let cur = p;
  for (let i = 0; i < levels; i += 1) cur = path.dirname(cur);
  return cur;
}

function readPresetMap() {
  const data = readJson(presetsPath, null);
  const map = new Map();
  for (const item of data?.configurePresets ?? []) {
    map.set(item.name, item);
  }
  return map;
}

function readVscodeSettings() {
  return readJson(vscodeSettingsPath, {});
}

function detectNvcc() {
  const envCudaPath = process.env.CUDA_PATH || process.env.CUDA_HOME || '';
  const nvccWhere = which('nvcc')[0] || '';
  const nvccPath = firstExisting([
    envCudaPath ? path.join(envCudaPath, 'bin', 'nvcc.exe') : '',
    nvccWhere,
  ]);
  const cudaRoot = envCudaPath || (nvccPath ? parentDir(nvccPath, 2) : '');
  let nvccVersion = '';
  if (nvccPath) {
    try {
      nvccVersion = execFileSync(nvccPath, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      nvccVersion = '';
    }
  }

  const libDir = cudaRoot ? path.join(cudaRoot, 'lib', 'x64') : '';
  const binDir = cudaRoot ? path.join(cudaRoot, 'bin') : '';
  return {
    cudaRoot,
    nvccPath,
    nvccVersion,
    cudart: firstExisting([
      libDir ? path.join(libDir, 'cudart.lib') : '',
      binDir ? path.join(binDir, 'cudart64_130.dll') : '',
      binDir ? path.join(binDir, 'cudart64_120.dll') : '',
    ]),
    cublas: firstExisting([
      libDir ? path.join(libDir, 'cublas.lib') : '',
      binDir ? path.join(binDir, 'cublas64_12.dll') : '',
    ]),
    cublasLt: firstExisting([
      libDir ? path.join(libDir, 'cublasLt.lib') : '',
      binDir ? path.join(binDir, 'cublasLt64_12.dll') : '',
    ]),
    cutlassRoot: process.env.CUTLASS_ROOT || '',
  };
}

function detectLibtorch() {
  const envRoot = process.env.LIBTORCH_ROOT || '';
  const preset = readPresetMap().get((readVscodeSettings()?.['cmake.defaultConfigurePreset']) || '');
  const presetPrefix = Array.isArray(preset?.environment?.LIBTORCH_ROOT) ? preset.environment.LIBTORCH_ROOT[0] : preset?.environment?.LIBTORCH_ROOT;
  const candidates = expandWindowsCandidates([
    envRoot,
    presetPrefix,
    'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch',
    'C:/libtorch',
    'C:/Program Files/libtorch',
  ].filter(Boolean));
  const root = firstExisting(candidates);
  return {
    root,
    torchConfig: firstExisting([
      root ? path.join(root, 'share', 'cmake', 'Torch', 'TorchConfig.cmake') : '',
      root ? path.join(root, 'share', 'cmake', 'TorchConfig.cmake') : '',
      root ? path.join(root, 'TorchConfig.cmake') : '',
    ]),
  };
}

function detectCudnn() {
  const envRoot = process.env.CUDNN_ROOT || '';
  const candidates = expandWindowsCandidates([
    envRoot,
    process.env.CONDA_PREFIX,
    'C:/Program Files/NVIDIA/CUDNN',
    'C:/cudnn',
    'C:/ProgramData/Miniconda3/Library',
    'C:/Users/james/miniconda3/Library',
  ].filter(Boolean));
  const root = firstExisting(candidates.map((candidate) => {
    const include = path.join(candidate, 'include', 'cudnn.h');
    return exists(include) ? candidate : '';
  })) || '';
  const libDir = root ? [path.join(root, 'lib'), path.join(root, 'lib64'), path.join(root, 'lib', 'x64')] : [];
  return {
    root,
    header: root ? path.join(root, 'include', 'cudnn.h') : '',
    library: firstExisting(libDir.flatMap((dir) => [
      path.join(dir, 'cudnn.lib'),
      path.join(dir, 'cudnn64_9.lib'),
      path.join(dir, 'cudnn64_8.lib'),
      path.join(dir, 'cudnn64_9.dll'),
      path.join(dir, 'cudnn64_8.dll'),
    ])),
  };
}

function detectCuvs() {
  const envRoot = process.env.CUVS_ROOT || '';
  const candidates = expandWindowsCandidates([
    envRoot,
    process.env.CONDA_PREFIX,
    'C:/rapids/cuvs',
    'C:/ProgramData/Miniconda3/Library',
    'C:/Users/james/miniconda3/Library',
  ].filter(Boolean));
  const root = firstExisting(candidates.map((candidate) => {
    const include = path.join(candidate, 'include', 'cuvs', 'neighbors', 'ivf_pq.hpp');
    return exists(include) ? candidate : '';
  })) || '';
  return {
    root,
    ivfPq: root ? path.join(root, 'include', 'cuvs', 'neighbors', 'ivf_pq.hpp') : '',
    cagra: root ? path.join(root, 'include', 'cuvs', 'neighbors', 'cagra.hpp') : '',
    ivfRaBitQ: root ? path.join(root, 'include', 'cuvs', 'neighbors', 'ivf_rabitq.hpp') : '',
  };
}

function detectCutlass() {
  const envRoot = process.env.CUTLASS_ROOT || '';
  const candidates = expandWindowsCandidates([
    envRoot,
    'C:/cutlass',
    path.join(process.env.USERPROFILE || '', 'cutlass'),
    path.join(process.env.HOME || '', 'cutlass'),
  ].filter(Boolean));
  const root = firstExisting(candidates.map((candidate) => {
    const include = path.join(candidate, 'include', 'cutlass', 'gemm', 'device', 'gemm.h');
    return exists(include) ? candidate : '';
  })) || '';
  return {
    root,
    header: root ? path.join(root, 'include', 'cutlass', 'gemm', 'device', 'gemm.h') : '',
  };
}

function detectPython() {
  const vscode = readVscodeSettings();
  const selected = vscode?.['python.defaultInterpreterPath'] || '';
  const resolvedSelected = selected
    .replace('${workspaceFolder}', repoRoot)
    .replace(/\//g, path.sep);
  const active = which('python')[0] || which('py')[0] || '';
  return {
    selected,
    resolvedSelected,
    resolvedSelectedExists: exists(resolvedSelected),
    active,
  };
}

function detectPresetSelection() {
  const vscode = readVscodeSettings();
  const presetName = vscode?.['cmake.defaultConfigurePreset'] || '';
  const presetMap = readPresetMap();
  const preset = presetMap.get(presetName) || null;
  const buildPreset = vscode?.['cmake.defaultBuildPreset'] || '';
  const generator = vscode?.['cmake.generator'] || '';
  const cache = {};

  const cacheDirs = [
    path.join(cppDir, 'build-x64-cuda', 'CMakeCache.txt'),
    path.join(cppDir, 'build-x64-cuda-cublas', 'CMakeCache.txt'),
    path.join(cppDir, 'build-x64-cuda-runtime', 'CMakeCache.txt'),
    path.join(cppDir, 'build-x64-fallback', 'CMakeCache.txt'),
    path.join(cppDir, 'build', 'CMakeCache.txt'),
  ];
  const cachePath = firstExisting(cacheDirs);
  if (cachePath) {
    const cacheText = readText(cachePath, '');
    for (const key of ['CMAKE_GENERATOR_PLATFORM', 'CMAKE_VS_PLATFORM_TOOLSET_HOST_ARCHITECTURE', 'CMAKE_CUDA_ARCHITECTURES']) {
      const match = cacheText.match(new RegExp(`^${key}:.*?=(.*)$`, 'm'));
      if (match) cache[key] = match[1].trim();
    }
  }

  const accidentalWin32 = [preset?.architecture, cache.CMAKE_GENERATOR_PLATFORM, cache.CMAKE_VS_PLATFORM_TOOLSET_HOST_ARCHITECTURE]
    .filter(Boolean)
    .some((value) => /win32|x86/i.test(String(value)));

  return {
    presetName,
    buildPreset,
    generator,
    preset,
    cachePath,
    cache,
    accidentalWin32,
    useCMakePresets: vscode?.['cmake.useCMakePresets'] || '',
  };
}

function summarizeAvailability(section) {
  return Object.fromEntries(
    Object.entries(section).map(([key, value]) => [
      key,
      typeof value === 'string' ? Boolean(value) : value,
    ])
  );
}

function detectTorchConfig(root) {
  return firstExisting([
    root ? path.join(root, 'share', 'cmake', 'Torch', 'TorchConfig.cmake') : '',
    root ? path.join(root, 'share', 'cmake', 'TorchConfig.cmake') : '',
  ]);
}

function makeLine(label, value) {
  return `- ${label}: ${value}`;
}

function writeReport(payload) {
  ensureDir(tmpDir);
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));

  const md = [];
  md.push('# GPU Capability Audit');
  md.push('');
  md.push(makeLine('Repository', repoRoot));
  md.push(makeLine('VS Code preset', payload.vscode.presetName || '(unset)'));
  md.push(makeLine('Build preset', payload.vscode.buildPreset || '(unset)'));
  md.push(makeLine('Generator', payload.vscode.generator || '(unset)'));
  md.push(makeLine('Use CMake presets', String(payload.vscode.useCMakePresets || '(unset)')));
  md.push(makeLine('Accidental Win32/x86', String(payload.vscode.accidentalWin32)));
  md.push('');
  md.push('## CUDA');
  md.push(makeLine('CUDA root', payload.cuda.cudaRoot || '(missing)'));
  md.push(makeLine('nvcc', payload.cuda.nvccPath || '(missing)'));
  md.push(makeLine('cudart', payload.cuda.cudart || '(missing)'));
  md.push(makeLine('cuBLAS', payload.cuda.cublas || '(missing)'));
  md.push(makeLine('cuBLASLt', payload.cuda.cublasLt || '(missing)'));
  md.push('');
  md.push('## cuDNN / cuVS / CUTLASS');
  md.push(makeLine('cuDNN root', payload.cudnn.root || '(missing)'));
  md.push(makeLine('cuDNN library', payload.cudnn.library || '(missing)'));
  md.push(makeLine('cuVS root', payload.cuvs.root || '(missing)'));
  md.push(makeLine('CUTLASS root', payload.cutlass.root || '(missing)'));
  md.push('');
  md.push('## LibTorch');
  md.push(makeLine('LibTorch root', payload.libtorch.root || '(missing)'));
  md.push(makeLine('TorchConfig.cmake', payload.libtorch.torchConfig || '(missing)'));
  md.push('');
  md.push('## Python');
  md.push(makeLine('Selected interpreter', payload.python.resolvedSelected || '(missing)'));
  md.push(makeLine('Selected interpreter exists', String(payload.python.resolvedSelectedExists)));
  md.push(makeLine('Active python', payload.python.active || '(missing)'));
  md.push('');
  md.push('## Summary');
  md.push(makeLine('CUDA runtime available', String(payload.summary.cudaRuntime)));
  md.push(makeLine('cuBLAS available', String(payload.summary.cublas)));
  md.push(makeLine('cuBLASLt available', String(payload.summary.cublasLt)));
  md.push(makeLine('cuDNN available', String(payload.summary.cudnn)));
  md.push(makeLine('cuVS available', String(payload.summary.cuvs)));
  md.push(makeLine('CUTLASS available', String(payload.summary.cutlass)));
  md.push(makeLine('LibTorch available', String(payload.summary.libtorch)));
  md.push('');

  fs.writeFileSync(outMd, md.join('\n'));
}

function main() {
  const cuda = detectNvcc();
  const cudnn = detectCudnn();
  const cuvs = detectCuvs();
  const cutlass = detectCutlass();
  const libtorch = detectLibtorch();
  const python = detectPython();
  const vscode = detectPresetSelection();

  const payload = {
    timestamp: new Date().toISOString(),
    repoRoot,
    vscode,
    cuda,
    cudnn,
    cuvs,
    cutlass,
    libtorch,
    python,
    summary: {
      cudaRuntime: Boolean(cuda.nvccPath),
      cublas: Boolean(cuda.cublas),
      cublasLt: Boolean(cuda.cublasLt),
      cudnn: Boolean(cudnn.root && cudnn.library),
      cuvs: Boolean(cuvs.root),
      cutlass: Boolean(cutlass.root),
      libtorch: Boolean(libtorch.root && libtorch.torchConfig),
    },
  };

  writeReport(payload);

  console.log(JSON.stringify({
    ok: true,
    outJson,
    outMd,
    summary: payload.summary,
    preset: vscode.presetName,
    accidentalWin32: vscode.accidentalWin32,
  }, null, 2));
}

main();
