import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./triton-trt-llm-batch-orchestrator.mjs', import.meta.url));

test('legacy daemon mode stops before connecting to Redis or Triton', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--start-daemon'], {
    encoding: 'utf8',
    timeout: 15000,
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /LEGACY_GEMMA4_TRT_EXECUTION_DISABLED/);
});

test('legacy batch mode stops before reading a packet file or connecting to services', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--submit-batch', '--packets=@missing.json'], {
    encoding: 'utf8',
    timeout: 15000,
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /LEGACY_GEMMA4_TRT_EXECUTION_DISABLED/);
  assert.doesNotMatch(result.stderr, /ENOENT|ECONNREFUSED/);
});
