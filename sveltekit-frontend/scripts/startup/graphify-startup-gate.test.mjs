import test from 'node:test';
import assert from 'node:assert/strict';
import { isGraphifyStartupEnabled } from './graphify-startup-gate.mjs';

test('Graphify startup is opt-in and defaults off', () => {
  for (const value of [undefined, null, '', 'false', '0', 'no', 'off']) {
    assert.equal(isGraphifyStartupEnabled(value), false);
  }

  for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
    assert.equal(isGraphifyStartupEnabled(value), true);
  }
});
