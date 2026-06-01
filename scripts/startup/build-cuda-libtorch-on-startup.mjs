import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cppDir = path.join(repoRoot, 'simd-bridge', 'cpp');
const nodePath = path.join(cppDir, 'build-x64-cuda', 'Release', 'tensorrt_bridge.node');
const libTorchLib = 'C:/libtorch-win-shared-with-deps-2.9.0+cu130/libtorch/lib';
const forceBuild = process.argv.includes('--force');
const freshnessWindowHours = 24;
const inputPaths = [
  path.join(cppDir, 'CMakeLists.txt'),
  path.join(cppDir, 'CMakePresets.json'),
  path.join(cppDir, 'binding.cc'),
  path.join(cppDir, 'cuda_graph_bridge.cu'),
  path.join(cppDir, 'pytorch_graph_fp16.cc'),
];

function hoursSince(filePath) {
  const stats = fs.statSync(filePath);
  return (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
}

function newestInputAgeHours() {
  const ages = inputPaths.filter((filePath) => fs.existsSync(filePath)).map((filePath) => hoursSince(filePath));
  return ages.length > 0 ? Math.min(...ages) : Infinity;
}

function shouldSkipBuild() {
  if (forceBuild) {
    return { skip: false, reason: 'force rebuild requested' };
  }

  if (!fs.existsSync(nodePath)) {
    return { skip: false, reason: 'native addon missing' };
  }

  const addonAge = hoursSince(nodePath);
  const newestSourceAge = newestInputAgeHours();
  const addonIsNewerThanSources = addonAge <= newestSourceAge;

  if (addonAge < freshnessWindowHours && addonIsNewerThanSources) {
    return {
      skip: true,
      reason: `addon is fresh (${Math.floor(addonAge)}h old) and newer than native inputs`,
    };
  }

  return {
    skip: false,
    reason: addonIsNewerThanSources
      ? 'addon is stale by age threshold'
      : 'native inputs are newer than addon',
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    shell: false,
    stdio: 'inherit',
    ...options,
  });
  return result.status ?? 1;
}

function main() {
  const decision = shouldSkipBuild();
  if (decision.skip) {
    console.log(`[ SKIP ] tensorrt_bridge.node ${decision.reason}`);
    process.exit(0);
  }

  console.log(`[ RUN ] cmake --preset windows-x64-cuda-libtorch (x64 CUDA + LibTorch) — ${decision.reason}`);
  let rc = run('cmake', ['--preset', 'windows-x64-cuda-libtorch'], { cwd: cppDir });
  if (rc !== 0) {
    console.log('[ FAIL ] configure step failed');
    process.exit(rc);
  }

  rc = run('cmake', ['--build', path.join(cppDir, 'build-x64-cuda'), '--config', 'Release', '--parallel', '4'], {
    cwd: cppDir,
  });
  if (rc !== 0) {
    console.log('[ FAIL ] build step failed');
    process.exit(rc);
  }

  if (!fs.existsSync(nodePath)) {
    console.log('[ FAIL ] build missing');
    process.exit(1);
  }

  console.log('[ OK ] tensorrt_bridge.node ready');
  const env = {
    ...process.env,
    PATH: `${libTorchLib};${process.env.PATH || ''}`,
  };
  const probe = spawnSync(
    'node',
    [
      '-e',
      "const b=require('./simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node');console.log('CUDA:',b.checkCudaAvailable()===1?'GPU active':'CPU stub')",
    ],
    {
      cwd: repoRoot,
      env,
      shell: false,
      stdio: 'inherit',
    }
  );
  process.exit(probe.status ?? 1);
}

main();
