import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLargeCorpusWorkerCountV1 } from './large-corpus-worker-config-v1.mjs';

test('large corpus worker count defaults to a bounded pool below available parallelism', () => {
	assert.equal(resolveLargeCorpusWorkerCountV1([], 16), 8);
	assert.equal(resolveLargeCorpusWorkerCountV1([], 4), 3);
	assert.equal(resolveLargeCorpusWorkerCountV1([], 1), 1);
});

test('large corpus worker count accepts explicit bounded operator overrides', () => {
	assert.equal(resolveLargeCorpusWorkerCountV1(['--workers=1'], 16), 1);
	assert.equal(resolveLargeCorpusWorkerCountV1(['--workers=16'], 16), 16);
	assert.throws(() => resolveLargeCorpusWorkerCountV1(['--workers=17'], 16), /1 to 16/);
	assert.throws(() => resolveLargeCorpusWorkerCountV1(['--workers=0'], 16), /1 to 16/);
	assert.throws(() => resolveLargeCorpusWorkerCountV1(['--workers=2.5'], 16), /1 to 16/);
});
