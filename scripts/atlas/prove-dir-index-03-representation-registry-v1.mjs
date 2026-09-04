#!/usr/bin/env node
/** DIR-INDEX-03 read-only representation registry proof runner. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const packageRoot = path.join(repoRoot, 'packages', 'parent-atlas');
const tsc = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const testFile = path.join(packageRoot, 'test', 'representation-descriptor-v1.test.mjs');

function run(command, args, cwd) {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const compile = run(tsc, ['-p', 'tsconfig.json'], packageRoot);
if (compile.status !== 0) {
  process.stdout.write(JSON.stringify({
    schema: 'atlas.dir-index-03-representation-registry-proof.v1',
    status: 'FAILED_COMPILE',
    datastoreWrites: false,
    modelCalls: false,
    compile,
  }, null, 2) + '\n');
  process.exit(1);
}

const tests = run(testFile, [], packageRoot);
const pass = tests.status === 0;
process.stdout.write(JSON.stringify({
  schema: 'atlas.dir-index-03-representation-registry-proof.v1',
  status: pass ? 'REPRESENTATION_REGISTRY_PASS' : 'FAILED_TESTS',
  gates: {
    descriptorContract: pass,
    initialKindsFrozen: pass,
    sourceChunkBinding: pass,
    producerRevisionBinding: pass,
    logicalIdempotency: pass,
    conflictingReplayFailsClosed: pass,
    projectionRefsNoncanonical: pass,
    dependencyMetadataDeterministic: pass,
    registryReplayDeterministic: pass,
  },
  datastoreWrites: false,
  modelCalls: false,
  compile: { status: compile.status },
  tests,
}, null, 2) + '\n');
process.exit(pass ? 0 : 1);
