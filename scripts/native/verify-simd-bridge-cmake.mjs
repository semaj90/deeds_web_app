#!/usr/bin/env node
// verify-simd-bridge-cmake.mjs
// Simple verifier: configure + build simd-bridge CMake project and capture link errors.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const srcDir = path.join(root, 'simd-bridge', 'cpp');
const buildDir = path.join(srcDir, 'build');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf-8', ...opts });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function writeJSON(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function writeMD(p, text) { fs.writeFileSync(p, text); }

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const configIdx = args.indexOf('--config');
const config = configIdx >= 0 && args.length > configIdx+1 ? args[configIdx+1] : 'Release';
const buildDirArgIdx = args.indexOf('--build-dir');
const requestedBuildDir = buildDirArgIdx >= 0 && args.length > buildDirArgIdx+1 ? args[buildDirArgIdx+1] : null;
const presetIdx = args.indexOf('--preset');
const preset = presetIdx >= 0 && args.length > presetIdx+1 ? args[presetIdx+1] : null;
const cudaFlagIdx = args.indexOf('--cuda');
const cudaFlag = cudaFlagIdx >= 0 && args.length > cudaFlagIdx+1 ? args[cudaFlagIdx+1] : null; // ON/OFF
const libtorchIdx = args.indexOf('--libtorch');
const libtorchPath = libtorchIdx >= 0 && args.length > libtorchIdx+1 ? args[libtorchIdx+1] : null;

let buildDirUsed = buildDir;
let clean_failed = false;
let clean_error_code = null;
let locked_path = null;

if (requestedBuildDir) {
  buildDirUsed = path.resolve(requestedBuildDir);
}

if (clean && fs.existsSync(buildDir)) {
  console.log('Cleaning build dir:', buildDir);
  try {
    fs.rmSync(buildDir, { recursive: true, force: true });
  } catch (e) {
    console.error('Clean failed:', e && e.code ? e.code : e);
    clean_failed = true;
    clean_error_code = e && e.code ? e.code : String(e);
    // If EPERM (locked .node), record locked path and fall back to a fresh build dir
    if (e && e.code === 'EPERM') {
      // try to detect locked file path from error message or known output
      locked_path = path.join(srcDir, 'build', 'Release', 'tensorrt_bridge.node');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      buildDirUsed = path.join(srcDir, `build-verify-${ts}`);
      console.log('Falling back to alternate build dir:', buildDirUsed);
    }
  }
}

fs.mkdirSync(buildDirUsed, { recursive: true });

console.log('Configuring CMake (Release):');
console.log('Using build dir:', buildDirUsed);
let res;
if (preset) {
  console.log('Using preset:', preset);
  // use cmake --preset which will manage generator/toolset/arch
  const presetArgs = ['--preset', preset];
  if (libtorchPath) presetArgs.push('--', `-DCMAKE_PREFIX_PATH=${libtorchPath}`);
  res = run('cmake', presetArgs);
} else {
  // ensure CMake places outputs into the chosen build dir to avoid touching locked outputs
  const cmakeArgs = ['-S', srcDir, '-B', buildDirUsed, '-G', 'Visual Studio 17 2022', '-A', 'x64', '-T', 'host=x64', '-DCMAKE_BUILD_TYPE=' + config,
    `-DCMAKE_LIBRARY_OUTPUT_DIRECTORY=${path.join(buildDirUsed, 'Release')}`,
    `-DCMAKE_RUNTIME_OUTPUT_DIRECTORY=${path.join(buildDirUsed, 'Release')}`,
    `-DCMAKE_ARCHIVE_OUTPUT_DIRECTORY=${path.join(buildDirUsed, 'Release')}`
  ];
  if (cudaFlag) cmakeArgs.push(`-DSIMD_ENABLE_CUDA=${cudaFlag}`);
  if (libtorchPath) cmakeArgs.push(`-DSIMD_ENABLE_LIBTORCH=ON`, `-DCMAKE_PREFIX_PATH=${libtorchPath}`);
  else cmakeArgs.push(`-DSIMD_ENABLE_LIBTORCH=OFF`);
  res = run('cmake', cmakeArgs);
}
let out = { configure_status: res.status, configure_stdout: res.stdout, configure_stderr: res.stderr };
console.log('Configure exit:', res.status);

console.log('\nBuilding (cmake --build):');
res = run('cmake', ['--build', buildDirUsed, '--config', config, '--', '/m']);
out.build_status = res.status;
out.build_stdout = res.stdout;
out.build_stderr = res.stderr;
console.log('Build exit:', res.status);

// scan for link errors in stdout/stderr
const combined = (out.configure_stdout + '\n' + out.configure_stderr + '\n' + out.build_stdout + '\n' + out.build_stderr);
const lnk2005 = Array.from(combined.matchAll(/LNK2005:.*?([\w:\.]+)"/g));
const lnk2019 = Array.from(combined.matchAll(/LNK2019: unresolved external symbol\s+(\S+)/g));
const unresolved = Array.from(combined.matchAll(/unresolved external symbol\s+"(.*?)"/g));

// detect libtorch / cuda messages from CMake output
const libtorch_found = /LibTorch found:/.test(combined) || /Torch_FOUND/.test(combined);
const fallback_stubs_active = /fallback\/stub/i.test(combined) || /NO_LIBTORCH=1/.test(combined);
const cuda_found = /CUDA Toolkit found:/.test(combined) || /CUDAToolkit_FOUND/.test(combined);

const report = {
  configure_status: out.configure_status,
  build_status: out.build_status,
  build_dir_used: buildDirUsed,
  clean_failed,
  clean_error_code,
  locked_path,
  libtorch_found: !!libtorch_found,
  fallback_stubs_active: !!fallback_stubs_active,
  cuda_found: !!cuda_found,
  lnk2005: lnk2005.map(m => m[0]),
  lnk2019: lnk2019.map(m => m[0]),
  unresolved_matches: unresolved.map(m => m[1]),
  duplicate_symbol_errors: lnk2005.map(m => m[0]),
  unresolved_external_errors: lnk2019.map(m => m[0]),
  exact_failing_symbols: unresolved.map(m => m[1]),
  short_stdout: combined.slice(0, 20000)
};

const outJson = path.join(root, '.tmp', 'simd-bridge-cmake-verify.json');
const outMd = path.join(root, '.tmp', 'simd-bridge-cmake-verify.md');
// ensure .tmp exists
fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
writeJSON(outJson, report);

let md = `# simd-bridge CMake Verify Report\n\n`;
md += `Configure status: ${report.configure_status}\n\n`;
md += `Build status: ${report.build_status}\n\n`;
md += `## LNK2005 (duplicate symbol) matches:\n`;
if (report.lnk2005.length) md += report.lnk2005.map(s => `- ${s}`).join('\n') + '\n'; else md += '- none\n';
md += `\n## LNK2019 / unresolved externals:\n`;
if (report.lnk2019.length) md += report.lnk2019.map(s => `- ${s}`).join('\n') + '\n'; else md += '- none\n';
md += `\n## Unresolved symbol names captured:\n`;
if (report.unresolved_matches.length) md += report.unresolved_matches.map(s => `- ${s}`).join('\n') + '\n'; else md += '- none\n';
md += '\n## Short build output (truncated)\n\n' + '```\n' + report.short_stdout + '\n```\n';

writeMD(outMd, md);

console.log('Wrote', outJson, outMd);
process.exit(report.build_status || 0);
