#!/usr/bin/env node
/**
 * DIR-INDEX-01 read-only proof runner.
 *
 * This command performs no database, Qdrant, Neo4j, Valkey, model, or source-file writes.
 * It compiles @deeds/parent-atlas, runs the fixed SourceArtifactV1 test suite, and emits the
 * result to stdout only. A caller may redirect stdout to a report file after inspecting it.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const packageRoot = path.join(repoRoot, 'packages', 'parent-atlas');
const tsc = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const testFile = path.join(packageRoot, 'test', 'source-artifact-v1.test.mjs');

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
    schema: 'atlas.dir-index-01-source-identity-proof.v1',
    status: 'FAILED_COMPILE',
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
  schema: 'atlas.dir-index-01-source-identity-proof.v1',
  status: pass ? 'DIR_SOURCE_IDENTITY_PASS' : 'FAILED_TESTS',
  gates: {
    sourceArtifactContract: pass,
    immutableRevision: pass,
    diagnosticMtimeExcluded: pass,
    deterministicOrdering: pass,
    deterministicReplayChecksum: pass,
    inventoryPolicy: pass,
    repositoryEscapeFailClosed: pass,
  },
  canonicalWrites: false,
  datastoreWrites: false,
  modelCalls: false,
  compile: { status: compile.status },
  tests: { status: tests.status, stdout: tests.stdout, stderr: tests.stderr },
}, null, 2) + '\n');

process.exit(pass ? 0 : 1);
