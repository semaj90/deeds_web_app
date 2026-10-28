import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { shouldSkipSummaryRegeneration } from './summary-enrichment.js';

describe('shouldSkipSummaryRegeneration', () => {
	it('checks the stored content hash without depending on summary_generated_at', async () => {
		const query = vi.fn(async (_statement: string) => ({ rows: [{ content_hash: 'sha256:unchanged' }] }));
		const db = { query } as unknown as Pool;

		const result = await shouldSkipSummaryRegeneration(db, 'packet-1', 'sha256:unchanged');

		expect(query).toHaveBeenCalledOnce();
		expect(query.mock.calls[0][0]).not.toContain('summary_generated_at');
		expect(result.skip).toBe(true);
		expect(result.cachedContentHash).toBe('sha256:unchanged');
	});
});
