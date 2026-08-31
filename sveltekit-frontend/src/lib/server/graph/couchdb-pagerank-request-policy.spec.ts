import { describe, expect, it } from 'vitest';
import {
	parseCouchDbPageRankRequest,
	requiresCouchDbPageRankApply,
} from './couchdb-pagerank-request-policy.js';

describe('CouchDB PageRank request policy', () => {
	it('defaults to a read-only dry run', () => {
		const parsed = parseCouchDbPageRankRequest({});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.dryRun).toBe(true);
			expect(parsed.data.apply).toBe(false);
			expect(requiresCouchDbPageRankApply(parsed.data)).toBe(false);
		}
	});

	it('requires apply for non-dry-run execution', () => {
		const parsed = parseCouchDbPageRankRequest({ dryRun: false, apply: false });
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(requiresCouchDbPageRankApply(parsed.data)).toBe(true);
	});

	it('rejects explicit null and undeclared fields', () => {
		expect(parseCouchDbPageRankRequest(null).success).toBe(false);
		expect(parseCouchDbPageRankRequest({ unsafeWriteTarget: 'qdrant' }).success).toBe(false);
	});
});
