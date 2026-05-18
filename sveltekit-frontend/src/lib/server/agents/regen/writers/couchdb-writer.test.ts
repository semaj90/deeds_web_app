// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
	writeCardToCouchDB,
	writeCardsToCouchDB,
	rollbackByRunId,
	CouchWriteOptions,
} from './couchdb-writer.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCard(overrides: Record<string, unknown> = {}) {
	return {
		id:           'dir:src/lib',
		type:         'wiki_note' as const,
		stableKey:    'dir:src/lib',
		tags:         [],
		contentHash:  'abc123',
		title:        'src/lib',
		body:         'Library directory',
		createdAt:    '2026-01-01T00:00:00Z',
		...overrides,
	} as Parameters<typeof writeCardToCouchDB>[0];
}

function baseOpts(fetchImpl: typeof fetch, extra: Partial<CouchWriteOptions> = {}): CouchWriteOptions {
	return {
		enabled:               true,
		url:                   'http://couch.example.com',
		database:              'test_wiki',
		user:                  'admin',
		password:              'secret',
		fetchImpl,
		allowLiveWritesInTests: true,
		runId:                 'run-001',
		workspace:             'deeds-web-app',
		...extra,
	};
}

// ── Lazy import (G26 pattern) ─────────────────────────────────────────────────

let writer: {
	writeCardToCouchDB:  typeof writeCardToCouchDB;
	writeCardsToCouchDB: typeof writeCardsToCouchDB;
	rollbackByRunId:     typeof rollbackByRunId;
};

beforeEach(async () => {
	writer = await import('./couchdb-writer.js');
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('writeCardToCouchDB', () => {
	it('returns skipped:disabled when enabled is false', async () => {
		const result = await writer.writeCardToCouchDB(makeCard(), { enabled: false });
		expect(result.wrote).toBe(false);
		expect(result.skipped).toBe('disabled');
	});

	it('returns skipped:test-env-blocked when VITEST is set and allowLiveWritesInTests is unset', async () => {
		// VITEST env var is always set during vitest runs — simulate a caller that
		// forgot to pass allowLiveWritesInTests.
		const result = await writer.writeCardToCouchDB(makeCard(), { enabled: true });
		expect(result.wrote).toBe(false);
		expect(result.skipped).toBe('test-env-blocked');
	});

	it('returns skipped:unchanged when existing doc has same contentHash', async () => {
		const card = makeCard({ contentHash: 'hash-v1' });
		const fetchImpl = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ _id: card.id, _rev: '1-aaa', contentHash: 'hash-v1' }), { status: 200 }),
		);

		const result = await writer.writeCardToCouchDB(card, baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.wrote).toBe(false);
		expect(result.skipped).toBe('unchanged');
		expect(result.contentHash).toBe('hash-v1');
		// Only the GET was issued — no PUT
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('writes a new doc (GET 404 → PUT 201)', async () => {
		const card = makeCard();
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 404 }))         // GET → not found
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: true, rev: '1-new' }), { status: 201 }), // PUT → created
			);

		const result = await writer.writeCardToCouchDB(card, baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.wrote).toBe(true);
		expect(result.rev).toBe('1-new');
		expect(result.skipped).toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		// PUT body must carry stamps
		const putBody = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
		expect(putBody.runId).toBe('run-001');
		expect(putBody.workspace).toBe('deeds-web-app');
		expect(typeof putBody.updatedAt).toBe('string');
	});

	it('includes _rev in PUT body when doc already exists', async () => {
		const card = makeCard({ contentHash: 'v2' });
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ _id: card.id, _rev: '2-bbb', contentHash: 'v1' }), { status: 200 }),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: true, rev: '3-ccc' }), { status: 201 }),
			);

		const result = await writer.writeCardToCouchDB(card, baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.wrote).toBe(true);
		expect(result.rev).toBe('3-ccc');

		const putBody = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
		expect(putBody._rev).toBe('2-bbb');
	});

	it('retries on 409 and succeeds with refreshed rev', async () => {
		const card = makeCard({ contentHash: 'v2' });
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(
				// GET → existing with old hash
				new Response(JSON.stringify({ _id: card.id, _rev: '1-old', contentHash: 'v1' }), { status: 200 }),
			)
			.mockResolvedValueOnce(
				// First PUT → 409 conflict
				new Response('{}', { status: 409 }),
			)
			.mockResolvedValueOnce(
				// Retry GET → fresh rev, different hash
				new Response(JSON.stringify({ _id: card.id, _rev: '2-new', contentHash: 'v1' }), { status: 200 }),
			)
			.mockResolvedValueOnce(
				// Retry PUT → success
				new Response(JSON.stringify({ ok: true, rev: '3-final' }), { status: 201 }),
			);

		const result = await writer.writeCardToCouchDB(card, baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.wrote).toBe(true);
		expect(result.conflicted).toBe(true);
		expect(result.rev).toBe('3-final');
		expect(fetchImpl).toHaveBeenCalledTimes(4);
	});

	it('returns skipped:unchanged+conflicted when 409 retry finds same hash', async () => {
		const card = makeCard({ contentHash: 'same-hash' });
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(
				// GET → old hash
				new Response(JSON.stringify({ _id: card.id, _rev: '1-x', contentHash: 'old' }), { status: 200 }),
			)
			.mockResolvedValueOnce(
				// PUT → 409
				new Response('{}', { status: 409 }),
			)
			.mockResolvedValueOnce(
				// Retry GET → same hash as card (another writer already wrote it)
				new Response(JSON.stringify({ _id: card.id, _rev: '2-y', contentHash: 'same-hash' }), { status: 200 }),
			);

		const result = await writer.writeCardToCouchDB(card, baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.wrote).toBe(false);
		expect(result.skipped).toBe('unchanged');
		expect(result.conflicted).toBe(true);
	});

	it('does not include the CouchDB password in any log output', async () => {
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const card = makeCard();
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(new Response('{}', { status: 404 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: true, rev: '1-a' }), { status: 201 }),
			);

		await writer.writeCardToCouchDB(card, baseOpts(fetchImpl as unknown as typeof fetch, { password: 'topsecret' }));

		for (const call of consoleSpy.mock.calls) {
			const msg = call.join(' ');
			expect(msg).not.toContain('topsecret');
		}
		consoleSpy.mockRestore();
	});
});

describe('writeCardsToCouchDB', () => {
	it('returns batch-disabled result when enabled is false', async () => {
		const cards = [makeCard(), makeCard({ id: 'dir:src/routes' })];
		const result = await writer.writeCardsToCouchDB(cards, { enabled: false });
		expect(result.wrote).toBe(0);
		expect(result.skipped).toBe(2);
		expect(result.results.every(r => r.skipped === 'disabled')).toBe(true);
	});

	it('uses _all_docs + _bulk_docs (2 HTTP calls per chunk)', async () => {
		const cards = [makeCard({ id: 'a', contentHash: 'h1' }), makeCard({ id: 'b', contentHash: 'h2' })];
		const fetchImpl = vi.fn()
			// _all_docs → both docs are new (no existing rows)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ rows: [
					{ id: 'a', error: 'not_found' },
					{ id: 'b', error: 'not_found' },
				]}), { status: 200 }),
			)
			// _bulk_docs → both succeed
			.mockResolvedValueOnce(
				new Response(JSON.stringify([
					{ id: 'a', ok: true, rev: '1-aa' },
					{ id: 'b', ok: true, rev: '1-bb' },
				]), { status: 201 }),
			);

		const result = await writer.writeCardsToCouchDB(cards, baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.wrote).toBe(2);
		expect(result.failed).toBe(0);
		// Exactly 2 HTTP calls for this chunk
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		const allDocsUrl = (fetchImpl.mock.calls[0][0] as string);
		expect(allDocsUrl).toContain('_all_docs');
		const bulkDocsUrl = (fetchImpl.mock.calls[1][0] as string);
		expect(bulkDocsUrl).toContain('_bulk_docs');
	});

	it('skips unchanged docs in batch (same contentHash)', async () => {
		const cards = [
			makeCard({ id: 'a', contentHash: 'same' }),
			makeCard({ id: 'b', contentHash: 'new' }),
		];
		const fetchImpl = vi.fn()
			// _all_docs → 'a' has same hash, 'b' is new
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ rows: [
					{ id: 'a', doc: { _id: 'a', _rev: '1-x', contentHash: 'same' } },
					{ id: 'b', error: 'not_found' },
				]}), { status: 200 }),
			)
			// _bulk_docs → only 'b'
			.mockResolvedValueOnce(
				new Response(JSON.stringify([
					{ id: 'b', ok: true, rev: '1-bb' },
				]), { status: 201 }),
			);

		const result = await writer.writeCardsToCouchDB(cards, baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.wrote).toBe(1);
		expect(result.skipped).toBe(1);

		const bulkBody = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
		expect(bulkBody.docs).toHaveLength(1);
		expect(bulkBody.docs[0]._id).toBe('b');
	});
});

describe('rollbackByRunId', () => {
	it('calls _find then _bulk_docs with _deleted:true', async () => {
		const fetchImpl = vi.fn()
			// _find → 2 docs with this runId
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ docs: [
					{ _id: 'doc-1', _rev: '1-aaa' },
					{ _id: 'doc-2', _rev: '2-bbb' },
				]}), { status: 200 }),
			)
			// _bulk_docs → both deleted
			.mockResolvedValueOnce(
				new Response(JSON.stringify([
					{ id: 'doc-1', ok: true },
					{ id: 'doc-2', ok: true },
				]), { status: 201 }),
			);

		const result = await writer.rollbackByRunId('run-001', baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.deleted).toBe(2);
		expect(result.failed).toBe(0);
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		const findUrl = (fetchImpl.mock.calls[0][0] as string);
		expect(findUrl).toContain('_find');

		const bulkBody = JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string);
		expect(bulkBody.docs.every((d: Record<string, unknown>) => d._deleted === true)).toBe(true);
	});

	it('returns deleted:0 when no docs match the runId', async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(
			new Response(JSON.stringify({ docs: [] }), { status: 200 }),
		);

		const result = await writer.rollbackByRunId('run-not-found', baseOpts(fetchImpl as unknown as typeof fetch));
		expect(result.deleted).toBe(0);
		expect(result.failed).toBe(0);
		expect(fetchImpl).toHaveBeenCalledTimes(1); // only _find, no _bulk_docs
	});

	it('returns disabled zeros when enabled is false', async () => {
		const result = await writer.rollbackByRunId('run-001', { enabled: false });
		expect(result.deleted).toBe(0);
		expect(result.failed).toBe(0);
		expect(result.durationMs).toBe(0);
	});
});
