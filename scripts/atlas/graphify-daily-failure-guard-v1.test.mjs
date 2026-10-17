import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { CANONICAL_PROJECTION_PREDICATES_V1 } from './canonical-projection-admission-summary-v1.mjs';

const startup = readFileSync(new URL('../startup/run-graphify-daily-startup.mjs', import.meta.url), 'utf8');
const audit = readFileSync(new URL('./audit-canonical-projection-fabric.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../sveltekit-frontend/package.json', import.meta.url), 'utf8'));

test('direct apply-capable daily aliases enforce admission before any child stage', () => {
  for (const alias of ['graphify:daily:chain', 'graphify:daily:fast', 'graphify:daily:skip-validation']) {
    assert.ok(packageJson.scripts[alias].startsWith('npm run atlas:graphify:daily:admission && '), alias);
  }
  assert.equal(packageJson.scripts['graphify:daily:full'], 'npm run graphify:daily:chain');
  assert.equal(packageJson.scripts['atlas:graphify:daily:admission'], 'node ../scripts/atlas/require-canonical-projection-admission-v1.mjs');
});

test('admission requirements match the existing fabric audit producer', () => {
  const assignment = audit.match(/report\.predicates = \{([\s\S]*?)\n    \};/);
  assert.ok(assignment);
  const produced = [...assignment[1].matchAll(/^\s*([A-Z_]+):/gm)].map((match) => match[1]);
  assert.deepEqual(produced, [...CANONICAL_PROJECTION_PREDICATES_V1]);
});

for (const failure of ['projection admission', 'snapshot binding', 'lifecycle open', 'apply child']) {
  test(`daily ${failure} failure cannot reach a legacy fallback, even when enabled`, () => {
    const boundary = startup.lastIndexOf('} catch (err) {');
    assert.ok(boundary > 0);
    const messages = [];
    const exits = [];
    const stop = new Error('test process exit');
    const admissionScript = 'node scripts/atlas/require-canonical-projection-admission-v1.mjs';
    const message = failure === 'projection admission' ? admissionScript : failure;
    const context = {
      console: { log: (value) => messages.push(value), error: (value) => messages.push(value) },
      process: { env: { GRAPHIFY_ALLOW_FALLBACK: '1' }, exit: (code) => { exits.push(code); throw stop; } },
      PROMOTION_ADMISSION_SCRIPT: admissionScript,
      execSync: () => assert.fail('No fallback child may run after failure'),
      failure: new Error(message),
    };
    assert.throws(() => vm.runInNewContext(`try { throw failure; ${startup.slice(boundary)}`, context), (error) => error === stop);
    assert.deepEqual(exits, [1]);
    assert.ok(messages.includes('graphify:daily complete'));
    assert.ok(messages.includes(`graphify:daily status: ${failure === 'projection admission' ? 'BLOCKED_BY_PROJECTION_ADMISSION' : 'FAILED'}`));
  });
}
