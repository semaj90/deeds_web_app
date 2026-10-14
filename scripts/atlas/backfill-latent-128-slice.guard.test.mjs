import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/atlas/backfill-latent-128-slice.mjs');

test('latent128 slice writer rejects apply before opening a database pool', () => {
	const result = spawnSync(process.execPath, [script, '--apply'], {
		encoding: 'utf8',
		timeout: 10_000,
	});

	assert.equal(result.status, 78);
	assert.match(result.stderr, /LATENT_128_APPLY_BLOCKED/);
	assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /atlas\.latent-128-slice-backfill/);
});
