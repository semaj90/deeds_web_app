import { describe, expect, it, vi } from 'vitest';
import { dryRunVideoIngest } from './courtroom-video-dryrun-v1';

const CASE = '123e4567-e89b-42d3-a456-426614174000';

describe('video ingest dry run', () => {
	it('never sends and refuses the write without approval', () => {
		const spy = vi.spyOn(globalThis, 'fetch');
		const r = dryRunVideoIngest({ caseId: CASE, fileName: 'depo.mp4' });
		expect(r.sent).toBe(false);
		expect(r.problems).toEqual([]);
		expect(r.plan).toMatchObject({ ok: false, reason: 'WRITE_NEEDS_APPROVAL' });
		expect(spy).not.toHaveBeenCalled();
	});

	it('reports field problems', () => {
		const r = dryRunVideoIngest({ caseId: 'nope', sourceUrl: 'not a url' });
		expect(r.problems).toEqual(['caseId must be a uuid', 'sourceUrl is not a url']);
	});

	it('needs a source', () => {
		expect(dryRunVideoIngest({ caseId: CASE }).problems).toContain('needs a sourceUrl or a file');
	});
});
