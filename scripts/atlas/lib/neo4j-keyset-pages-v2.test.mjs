import test from 'node:test';
import assert from 'node:assert/strict';
import { forEachNeo4jKeysetPageV2, readNeo4jKeysetPagesV2 } from './neo4j-keyset-pages-v2.mjs';

test('reads keyset pages in deterministic cursor order', async () => {
	const calls = [];
	const records = await readNeo4jKeysetPagesV2({
		pageSize: 2,
		runPage: async ({ after }) => {
			calls.push(after);
			if (after === null) return [{ cursor: 'a' }, { cursor: 'b' }];
			if (after === 'b') return [{ cursor: 'c' }];
			return [];
		},
	});
	assert.deepEqual(records.map(({ cursor }) => cursor), ['a', 'b', 'c']);
	assert.deepEqual(calls, [null, 'b']);
});

test('rejects non-increasing cursors and oversized exports', async () => {
	await assert.rejects(
		readNeo4jKeysetPagesV2({ runPage: async () => [{ cursor: 'a' }, { cursor: 'a' }] }),
		/NEO4J_KEYSET_CURSOR_NOT_STRICTLY_INCREASING/,
	);
	await assert.rejects(
		readNeo4jKeysetPagesV2({
			pageSize: 1,
			maxRows: 1,
			runPage: async ({ after }) => [{ cursor: after === null ? 'a' : 'b' }],
		}),
		/NEO4J_EXPORT_MAX_ROWS_EXCEEDED/,
	);
});

test('visits pages incrementally without retaining prior page records', async () => {
	const visited = [];
	let activePage = 0;
	const count = await forEachNeo4jKeysetPageV2({
		pageSize: 2,
		runPage: async ({ after }) => {
			assert.equal(activePage, 0);
			activePage = 1;
			const page = after === null ? [{ cursor: 'a' }, { cursor: 'b' }] : [{ cursor: 'c' }];
			return page;
		},
		onRecord: async (record) => {
			visited.push(record.cursor);
			if (visited.length === 2) activePage = 0;
		},
	});
	assert.equal(count, 3);
	assert.deepEqual(visited, ['a', 'b', 'c']);
});
