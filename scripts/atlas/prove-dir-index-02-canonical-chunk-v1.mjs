#!/usr/bin/env node
/**
 * DIR-INDEX-02 read-only canonical chunk identity proof runner.
 *
 * This command performs no database, Qdrant, Neo4j, Valkey, model, or source-file writes.
 * It compiles @deeds/parent-atlas and runs the focused CanonicalChunkV1 test suite.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const packageRoot = path.join(repoRoot, 'packages', 'parent-atlas');
const tsc = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const testFile = path.join(packageRoot, 'test', 'canonical-chunk-v1.test.mjs');

function run(command, args, cwd) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

const compile = run(tsc, ['-p', 'tsconfig.json'], packageRoot);
if (compile.status !== 0) {
  process.stdout.write(JSON.stringify({
    schema: 'atlas.dir-index-02-canonical-chunk-proof.v1',
    status: 'FAILED_COMPILE',
    gates: {
      canonicalChunkContract: false,
      existingOwnerReuse: false,
      byteAccurateSpan: false,
      deterministicReplay: false,
      noCompetingIdentityDerivation: false,
    },
    canonicalWrites: false,
    datastoreWrites: false,
    modelCalls: false,
    compile: { status: compile.status, stdout: compile.stdout, stderr: compile.stderr },
  }, null, 2) + '\n');
  process.exit(1);
}

const tests = run(testFile, [], packageRoot);
const pass = tests.status === 0;

process.stdout.write(JSON.stringify({
  schema: 'atlas.dir-index-02-canonical-chunk-proof.v1',
  status: pass ? 'DIR_CHUNK_IDENTITY_PASS' : 'FAILED_TESTS',
  gates: {
    canonicalChunkContract: pass,
    existingOwnerReuse: pass,
    byteAccurateSpan: pass,
    deterministicReplay: pass,
    noCompetingIdentityDerivation: pass,
  },
  intentionallyNotProven: {
    markdownSectionSegmentation: true,
    jsonYamlLogicalObjectSegmentation: true,
    productionWrites: true,
  },
  canonicalWrites: false,
  datastoreWrites: false,
  modelCalls: false,
  compile: { status: compile.status },
  tests: { status: tests.status, stdout: tests.stdout, stderr: tests.stderr },
}, null, 2) + '\n');

process.exit(pass ? 0 : 1);
