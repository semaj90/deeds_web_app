#!/usr/bin/env node
/**
 * Static regression test for the legacy chunk-index AST producer.
 *
 * This test does not connect to PostgreSQL. It protects the producer boundary
 * so future applies cannot reinterpret a path, symbol, or chunk digest as a
 * whole-file source-content digest.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const producerPath = path.join(repoRoot, 'sveltekit-frontend/scripts/atlas/populate-atlas-ast-nodes.mjs');
const source = readFileSync(producerPath, 'utf8');
const astPhase = source.split('// ── Upsert in batches')[0];

const checks = [
  ['documents whole-file contract', source.includes('source_content_hash is the whole-file raw-byte digest')],
  ['selects file_content_hash', astPhase.includes('file_content_hash,')],
  ['requires valid whole-file digest', astPhase.includes('WHOLE_FILE_CONTENT_HASH_REQUIRED')],
  ['uses file digest for file nodes', astPhase.includes('source_content_hash:  sourceContentHash')],
  ['uses file digest for symbol nodes', astPhase.includes('source_content_hash:  sourceContentHash')],
  ['does not use path hash as source digest', !astPhase.includes("source_content_hash:  crypto.createHash('sha256').update(np)")],
  ['does not use symbol fallback as source digest', !astPhase.includes('const contentHash = row.content_hash')],
  ['does not use path/symbol fallback expression', !astPhase.includes('crypto.createHash(\'sha256\').update(`${np}#${symbol}`)')],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exitCode = 1;
else console.log(`legacy-ast-producer-contract: ${checks.length}/${checks.length} PASS`);
