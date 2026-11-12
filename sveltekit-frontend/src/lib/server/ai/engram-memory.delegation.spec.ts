// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const canonical = vi.hoisted(() => ({ record: vi.fn(async () => undefined) }));
vi.mock('$lib/server/search/engram-bigram.js', async () => {
	const { createHash } = await import('node:crypto');
	const norm = (q: string) => q.toLowerCase().trim().replace(/\s+/g, ' ');
	return {
		qHash: (q: string) => createHash('sha256').update(norm(q)).digest('hex').slice(0, 16),
		recordEngramTransition: canonical.record,
	};
});

import { hashQuery, recordEngramTransition } from './engram-memory';

const makeRedis = () => ({
	set: vi.fn(async () => 'OK'),
	zincrby: vi.fn(async () => 1),
	expire: vi.fn(async () => 1),
});

describe('ai/engram-memory delegates to the canonical bigram writer', () => {
	beforeEach(() => canonical.record.mockClear());

	it('hashes with the canonical normalization (whitespace runs and case do not split keys)', () => {
		expect(hashQuery('Motion   to  Dismiss')).toBe(hashQuery('motion to dismiss'));
	});

	it('hands prev -> current to the canonical writer and writes no bigram or query-text keys itself', async () => {
		const redis = makeRedis();
		const { currentHash } = await recordEngramTransition(redis as never, { previousQuery: 'a b', currentQuery: 'c d' });

		expect(canonical.record).toHaveBeenCalledExactlyOnceWith('a b', 'c d');
		expect(currentHash).toBe(hashQuery('c d'));
		expect(redis.set).not.toHaveBeenCalled();
		expect(redis.zincrby).not.toHaveBeenCalled();
	});

	it('keeps the current query text recoverable when there is no previous query', async () => {
		const redis = makeRedis();
		await recordEngramTransition(redis as never, { currentQuery: 'first query' });

		expect(canonical.record).not.toHaveBeenCalled();
		expect(redis.set).toHaveBeenCalledWith(`ace:engram:query:${hashQuery('first query')}`, 'first query', 'EX', expect.any(Number));
	});

	it('still records the SOM BMU link locally (the adapter feature the canonical writer lacks)', async () => {
		const redis = makeRedis();
		const { currentHash } = await recordEngramTransition(redis as never, {
			previousQuery: 'x',
			currentQuery: 'y',
			somRow: 3,
			somCol: 4,
		});

		expect(redis.set).toHaveBeenCalledWith(`ace:engram:query-bmu:${currentHash}`, '3:4', 'EX', expect.any(Number));
		expect(redis.zincrby).toHaveBeenCalledWith('ace:engram:bmu:3:4', 1, currentHash);
	});
});
