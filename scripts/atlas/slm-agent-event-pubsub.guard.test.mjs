import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptPath = fileURLToPath(new URL('./slm-agent-event-pubsub.mjs', import.meta.url));

test('legacy demo exits before connecting to Redis', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--demo'], {
    encoding: 'utf8',
    timeout: 15000,
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /LEGACY_SLM_EVENT_DEMO_DISABLED/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
});

test('generic legacy publisher exits before connecting or parsing payloads', () => {
  const result = spawnSync(process.execPath, [scriptPath, '--publish', '--event=packet:infer', '--payload=not-json'], {
    encoding: 'utf8',
    timeout: 15000,
  });

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /LEGACY_SLM_EVENT_PUBLISH_DISABLED/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|JSON|SyntaxError/);
});
