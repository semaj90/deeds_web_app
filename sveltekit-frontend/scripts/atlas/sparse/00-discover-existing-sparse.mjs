#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const TERMS = ['BM25', 'BM42', 'SparseVector', 'sparse_vectors', 'lexical_v1', 'miniCOIL', 'uniCOIL', 'SPLADE', 'RRF', 'prefetch', 'document_frequency', 'token_registry'];

const result = spawnSync('rg', ['-n', TERMS.join('|'), 'src', 'scripts', 'scripts/atlas'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  shell: false,
  maxBuffer: 1024 * 1024 * 20,
});

const lines = (result.stdout ?? '').split(/\r?\n/).filter(Boolean);
const summary = {
  artifact_id: 'atlas-sparse-discovery-v1',
  status: 'RUNTIME_PROOF_PENDING',
  terms: TERMS,
  hit_count: lines.length,
  sample_hits: lines.slice(0, 200),
  exit_code: result.status,
};

if (result.stderr) {
  summary.stderr = result.stderr.trim();
}

console.log(JSON.stringify(summary, null, 2));
process.exit(lines.length > 0 ? 0 : (result.status ?? 0));
