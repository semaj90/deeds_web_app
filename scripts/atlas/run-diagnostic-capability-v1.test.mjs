import assert from 'node:assert/strict';
import test from 'node:test';
import { executeDiagnosticCapabilityV1 } from './run-diagnostic-capability-v1.mjs';

const simulatedFreeMemoryBytes = 4096 * 1024 * 1024;

test('dispatches an allowlisted capability with fixed args and shell disabled', () => {
  let invocation;
  const output = executeDiagnosticCapabilityV1('workspace.revision.diagnostic', {
    freeMemoryBytes: simulatedFreeMemoryBytes,
    execFileSyncImpl: (...args) => {
      invocation = args;
      return `${'a'.repeat(40)}\n`;
    },
  });

  assert.equal(output, `${'a'.repeat(40)}\n`);
  assert.equal(invocation[0], 'git');
  assert.deepEqual(invocation[1], ['rev-parse', '--verify', 'HEAD']);
  assert.equal(invocation[2].shell, false);
  assert.equal(invocation[2].cwd, process.cwd());
  assert.equal(invocation[2].env.ATLAS_DIAGNOSTIC_ONLY, '1');
  assert.equal('DATABASE_URL' in invocation[2].env, false);
  assert.ok(invocation[2].timeout > 0);
  assert.ok(invocation[2].maxBuffer > 0);
});

test('rejects unknown capabilities before starting a process', () => {
  let invoked = false;
  assert.throws(() => executeDiagnosticCapabilityV1('arbitrary-command', {
    execFileSyncImpl: () => { invoked = true; },
  }), /ATLAS_CAPABILITY_UNKNOWN/);
  assert.equal(invoked, false);
});

test('rejects malformed structured receipt output after an allowlisted command', () => {
  assert.throws(() => executeDiagnosticCapabilityV1('workspace.revision.diagnostic', {
    freeMemoryBytes: simulatedFreeMemoryBytes,
    execFileSyncImpl: () => 'not-a-git-revision\n',
  }), /ATLAS_CAPABILITY_OUTPUT_INVALID:git-commit-hex-v1/);
});

test('rejects a capability before launch when free memory is below its budget plus reserve', () => {
  let invoked = false;
  assert.throws(() => executeDiagnosticCapabilityV1('workspace.revision.diagnostic', {
    freeMemoryBytes: 1024 * 1024,
    execFileSyncImpl: () => { invoked = true; },
  }), /ATLAS_CAPABILITY_INSUFFICIENT_MEMORY/);
  assert.equal(invoked, false);
});
