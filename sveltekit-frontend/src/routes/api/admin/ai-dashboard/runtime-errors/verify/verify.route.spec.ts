import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadRuntimeErrorPriorities } = vi.hoisted(() => ({
	loadRuntimeErrorPriorities: vi.fn(),
}));

vi.mock('$lib/server/atlas/board/runtime-error-priorities.js', () => ({
	loadRuntimeErrorPriorities,
}));

import { GET, POST } from './+server.js';
import { repairErrorFingerprintV1 } from '$lib/server/atlas/agentic/contracts/repair-episode-verifier-v1.js';

describe('admin runtime-errors read-only repair verifier route', () => {
	beforeEach(() => {
		loadRuntimeErrorPriorities.mockReset();
	});

	it('rejects non-admin GET with stable empty shape', async () => {
		const res = await GET({ locals: { user: null } } as never);
		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({ status: 'UNAVAILABLE', total: 0, candidates: [], writesPerformed: false });
	});

	it('returns read-only candidates with canonicalErrorKey and repairFingerprint on admin GET', async () => {
		loadRuntimeErrorPriorities.mockResolvedValue({
			status: 'AVAILABLE',
			total: 1,
			top10: [{
				fingerprint: 'fp1',
				canonicalErrorKey: 'errkey:1234',
				source: 'error_events',
				routePath: '/cases',
				kind: 'runtime',
				severity: 'error',
				message: 'boom',
				occurrences: 2,
				lastSeen: '2026-11-24T00:00:00.000Z',
				priorityScore: 5,
				firstAppFrame: 'src/routes/cases/+page.svelte',
				affectedFiles: ['src/routes/cases/+page.svelte'],
				affectedFileCount: 1,
			}],
			top100: [],
		});

		const res = await GET({ locals: { user: { role: 'admin' } } } as never);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.writesPerformed).toBe(false);
		expect(body.canonicalAuthority).toBe(false);
		expect(body.candidates[0]).toMatchObject({
			fingerprint: 'fp1',
			canonicalErrorKey: 'errkey:1234',
			firstAppFrame: 'src/routes/cases/+page.svelte',
		});
		expect(body.candidates[0].repairFingerprint).toMatch(/^tsfp:[a-f0-9]{32}$/);
	});

	it('verifies a read-only repair episode via POST without writes', async () => {
		const target = repairErrorFingerprintV1({ file: 'src/a.ts', code: 'TS2322', message: 'type mismatch' });
		const res = await POST({
			locals: { user: { role: 'admin' } },
			request: new Request('http://localhost/', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					before: { workspaceRevision: 'ws1', sourceRevision: 'src1', fingerprints: [target] },
					after: { workspaceRevision: 'ws1', sourceRevision: 'src2', fingerprints: [] },
					targetFingerprints: [target],
				}),
			}),
		} as never);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.writesPerformed).toBe(false);
		expect(body.verification.verdict).toBe('PASS');
	});
});
