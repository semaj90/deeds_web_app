import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./parent-atlas-memory-refresh.mjs', import.meta.url));

function runScript(...args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
}

test('dry run reports a plan without claiming stages ran', () => {
  const result = runScript('--dry-run', '--verbose');

  assert.equal(result.status, 0);
  assert.match(result.stdout, /DRY-RUN PLAN ONLY/);
  assert.match(result.stdout, /NOT EXECUTED: gemma4-parent-atlas-summaries\.mjs/);
  assert.match(result.stdout, /not a completed refresh/);
  assert.doesNotMatch(result.stdout, /SIMULATING EXECUTION|Complete and Applied/);
});

test('apply fails closed when no stage executor exists', () => {
  const result = runScript('--apply');

  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED: this wrapper has no stage executor/);
  assert.doesNotMatch(result.stdout, /Complete and Applied/);
});

test('missing or unsupported mode fails with usage', () => {
  const result = runScript('--run', '2026-10-29');

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

test('combined daily parent command gates Graphify behind the blocked refresh', () => {
  const packageJsonPath = fileURLToPath(new URL('../../sveltekit-frontend/package.json', import.meta.url));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  assert.equal(
    packageJson.scripts['graphify:daily:parent'],
    'npm run atlas:parent:memory:apply && npm run graphify:daily',
  );
});
