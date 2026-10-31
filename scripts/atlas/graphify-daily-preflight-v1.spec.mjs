import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./graphify-daily-preflight-v1.mjs', import.meta.url), 'utf8');

test('daily preflight binds host and GPU observations to distinct payload digests', () => {
  assert.match(source, /sha256\(JSON\.stringify\(host\.host\)\)/);
  assert.match(source, /sha256\(JSON\.stringify\(host\.gpu\)\)/);
  assert.match(source, /host-resource-observation-sha256:/);
  assert.match(source, /gpu-observation-sha256:/);
  assert.doesNotMatch(source, /host-preflight-sha256:/);
});

test('resource observations cannot pass gates without a separate threshold verifier', () => {
  assert.match(source, /const observed = \(ref, revision\) => \(\{ status: 'UNVERIFIED'/);
  assert.match(source, /hostResources: observed\(/);
  assert.match(source, /gpuResources: observed\(/);
  assert.doesNotMatch(source, /status:\s*'PASS'.*host\.gpu|host\.gpu.*status:\s*'PASS'/s);
});
