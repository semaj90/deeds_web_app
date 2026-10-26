#!/usr/bin/env node
/**
 * Thin Node wrapper for the Python NetworkX reference oracle.
 *
 * The canonical fixture implementation lives in
 * python/parent_atlas_networkx_pagerank.py. This wrapper exists so older
 * Node-based invocations still resolve to the actual reference runner instead
 * of the retired proof-of-concept script.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}
const containerFlag = process.argv.indexOf('--container');
const useContainer = containerFlag >= 0;
const args = process.argv.slice(2);
if (useContainer) args.splice(args.indexOf('--container'), 1);
const outputArgumentIndex = args.findIndex((argument) => argument.startsWith('--output='));
const outputPath = outputArgumentIndex >= 0 ? resolve(root, args[outputArgumentIndex].slice('--output='.length)) : null;
if (outputArgumentIndex >= 0) args.splice(outputArgumentIndex, 1);
if (outputPath && !outputPath.startsWith(`${root}${sep}`)) {
  console.error('Receipt output must be inside the repository root');
  process.exit(2);
}
if (outputPath && !useContainer) {
  console.error('--output is supported only with --container');
  process.exit(2);
}

const snapshotArgument = args.find((argument) => argument.startsWith('--snapshot='));
if (useContainer && !snapshotArgument) {
  console.error('Container NetworkX execution requires --snapshot=<repo-relative-path>');
  process.exit(2);
}

if (useContainer) {
  args.splice(args.indexOf(snapshotArgument), 1);
  const snapshotPath = resolve(root, snapshotArgument.slice('--snapshot='.length));
  const relativePath = snapshotPath.startsWith(`${root}${sep}`) ? snapshotPath.slice(root.length + 1) : null;
  if (!relativePath) {
    console.error('Container snapshot must be inside the repository root');
    process.exit(2);
  }
  const containerRoot = '/mnt/c/Users/james/Videos/deeds-web-app';
  const pythonScript = `${containerRoot}/python/stage5_networkx_pagerank_oracle_v1.py`;
  const containerSnapshot = `${containerRoot}/${relativePath.split(sep).join('/')}`;
  const result = spawnSync(process.env.DOCKER ?? 'docker', [
    'exec', 'atlas-gpu-8098', 'python', pythonScript, '--snapshot', containerSnapshot, ...args,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error) {
    console.error(`Failed to execute NetworkX in atlas-gpu-8098: ${String(result.error.message ?? result.error)}`);
    process.exit(1);
  }
  if (result.stdout) {
    if (result.status === 0) {
      const receipt = JSON.parse(result.stdout);
      delete receipt.receipt_sha256;
      receipt.receipt_sha256 = `sha256:${crypto.createHash('sha256').update(stableJson(receipt), 'utf8').digest('hex')}`;
      const sealedReceipt = `${JSON.stringify(receipt)}\n`;
      process.stdout.write(sealedReceipt);
      if (outputPath) {
      fs.mkdirSync(dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      }
    } else {
      process.stdout.write(result.stdout);
    }
  }
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const pythonScript = resolve(root, 'python/parent_atlas_networkx_pagerank.py');
const pythonBin = process.env.PYTHON ?? 'python';

const result = spawnSync(pythonBin, [pythonScript, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Failed to execute NetworkX oracle: ${String(result.error.message ?? result.error)}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
