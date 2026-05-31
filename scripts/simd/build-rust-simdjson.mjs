#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { existsSync, copyFileSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function now(){ return new Date().toISOString(); }

const repoRoot = process.cwd();
const crateDir = path.join(repoRoot, 'simd-bridge', 'rust-simdjson');
const targetDir = path.join(crateDir, 'target', 'release');
const outDir = path.join(repoRoot, '.tmp');
await fs.mkdir(outDir, { recursive: true });

let report = {
  startedAt: now(),
  platform: process.platform,
  nodePath: null,
  exports: {},
  error: null,
};

try{
  console.log('Building Rust crate in', crateDir);
  execSync('cargo build --release', { cwd: crateDir, stdio: 'inherit' });

  // determine artifacts per platform
  let dllPath;
  if(process.platform === 'win32'){
    dllPath = path.join(targetDir, 'simd_bridge_rs.dll');
  } else if(process.platform === 'linux'){
    dllPath = path.join(targetDir, 'libsimd_bridge_rs.so');
  } else if(process.platform === 'darwin'){
    dllPath = path.join(targetDir, 'libsimd_bridge_rs.dylib');
  } else {
    throw new Error('Unsupported platform: ' + process.platform);
  }

  const nodePath = path.join(targetDir, 'simd_bridge_rs.node');
  report.nodePath = nodePath;

  if(!existsSync(dllPath)){
    throw new Error('Expected artifact not found: ' + dllPath);
  }

  // copy/rename to .node
  console.log('Copying', dllPath, '->', nodePath);
  copyFileSync(dllPath, nodePath);

  if(!existsSync(nodePath)) throw new Error('Failed to produce ' + nodePath);

  // try to load the module and check exports
  console.log('Requiring', nodePath);
  const native = require(nodePath);

  report.exports.parseBatchAsync = typeof native.parseBatchAsync === 'function' || typeof native.parse_batch_async === 'function';
  report.exports.parseBatch = typeof native.parseBatch === 'function' || typeof native.parse_batch === 'function';

  // write report files
  const jsonReport = path.join(outDir, 'simd-build-report.json');
  await fs.writeFile(jsonReport, JSON.stringify(report, null, 2), 'utf8');

  const mdReport = path.join(outDir, 'simd-build-report.md');
  const md = [`# SIMD build report`, `started: ${report.startedAt}`, `platform: ${report.platform}`, `nodePath: ${report.nodePath}`, ``, `## Exports`, `- parseBatchAsync: ${report.exports.parseBatchAsync}`, `- parseBatch: ${report.exports.parseBatch}`, ``].join('\n');
  await fs.writeFile(mdReport, md, 'utf8');

  console.log('Build report written to', jsonReport, mdReport);
}catch(err){
  console.error('Build failed:', err.message || err);
  report.error = String(err.stack || err.message || err);
  const jsonReport = path.join(outDir, 'simd-build-report.json');
  await fs.writeFile(jsonReport, JSON.stringify(report, null, 2), 'utf8');
  process.exitCode = 1;
}
