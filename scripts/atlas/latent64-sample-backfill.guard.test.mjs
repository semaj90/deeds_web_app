import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const script = resolve('scripts/atlas/latent64-sample-backfill.mjs');

test('legacy latent64 sample writer rejects apply before database access', () => {
	const result = spawnSync(process.execPath, [script, '--apply'], {
		encoding: 'utf8',
		timeout: 10_000,
	});

	assert.equal(result.status, 78);
	assert.match(result.stderr, /LEGACY_LATENT64_APPLY_BLOCKED/);
	assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Fetching 20 sample embeddings/);
});
