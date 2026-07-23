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
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
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
