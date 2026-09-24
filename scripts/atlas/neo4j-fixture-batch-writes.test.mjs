import test from 'node:test';
import assert from 'node:assert/strict';
import {
	NEO4J_FIXTURE_WRITE_BATCH_SIZE,
	writeFixtureEdgesBatched,
	writeFixtureNodesBatched,
} from './neo4j-fixture-batch-writes.mjs';

test('batches node creation and preserves fixture lineage on each row', async () => {
	const calls = [];
	const session = { run: async (query, params) => calls.push({ query, params }) };
	const nodes = Array.from({ length: 5 }, (_, index) => ({ nodeKey: `n${index}`, nodeType: 'FILE' }));
	const count = await writeFixtureNodesBatched(session, nodes, { snapshotId: 'snapshot:test', fixtureRunId: 'run:test', batchSize: 2 });
	assert.equal(count, 3);
	assert.equal(calls.length, 3);
	assert.ok(calls.every(({ query }) => query.includes('UNWIND $rows AS row')));
	assert.deepEqual(calls.flatMap(({ params }) => params.rows).map((row) => [row.snapshotId, row.fixtureRunId]),
		Array.from({ length: 5 }, () => ['snapshot:test', 'run:test']));
});

test('batches edges per allowlisted relationship type and keeps endpoint keys', async () => {
	const calls = [];
	const session = { run: async (query, params) => calls.push({ query, params }) };
	const edges = [
		{ edgeType: 'CALLS', edgeKey: 'e1', sourceNodeKey: 'a', targetNodeKey: 'b', weight: 1, confidence: 0.9 },
		{ edgeType: 'CALLS', edgeKey: 'e2', sourceNodeKey: 'b', targetNodeKey: 'c', weight: 2, confidence: 0.8 },
		{ edgeType: 'USES_CONCEPT', edgeKey: 'e3', sourceNodeKey: 'a', targetNodeKey: 'c', weight: 1, confidence: 1 },
	];
	const count = await writeFixtureEdgesBatched(session, edges, { snapshotId: 'snapshot:test', fixtureRunId: 'run:test', batchSize: 2 });
	assert.equal(count, 2);
	assert.equal(calls.length, 2);
	assert.ok(calls.every(({ query }) => query.includes('UNWIND $rows AS row')));
	assert.deepEqual(calls.flatMap(({ params }) => params.rows.map((row) => row.edgeKey)), ['e1', 'e2', 'e3']);
	assert.ok(calls.every(({ params }) => params.snapshotId === 'snapshot:test' && params.fixtureRunId === 'run:test'));
});

test('rejects an unsupported relationship before making any session call', async () => {
	let calls = 0;
	const session = { run: async () => { calls += 1; } };
	await assert.rejects(
		writeFixtureEdgesBatched(session, [{ edgeType: 'INJECTED', edgeKey: 'x' }], { snapshotId: 's', fixtureRunId: 'r' }),
		/Unsupported fixture relationship type/,
	);
	assert.equal(calls, 0);
});

test('uses a bounded one-thousand-row batch default', () => {
	assert.equal(NEO4J_FIXTURE_WRITE_BATCH_SIZE, 1000);
});
