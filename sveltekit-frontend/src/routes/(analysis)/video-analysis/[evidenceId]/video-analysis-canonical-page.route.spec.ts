// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EVIDENCE_ID = '00000000-0000-4000-8000-0000000000aa';
const CASE_ID = '00000000-0000-4000-8000-0000000000bb';
const mocks = vi.hoisted(() => ({ selectCall: 0, canonicalRow: null as Record<string, unknown> | null, caseRows: [] as Array<{ id: string }> }));

vi.mock('$lib/server/db/client', () => ({
	db: {
		select: () => {
			const call = mocks.selectCall++;
			if (call === 0) return { from: () => ({ where: () => ({ limit: async () => mocks.canonicalRow ? [mocks.canonicalRow] : [] }) }) };
			return { from: () => ({ where: () => ({ limit: async () => mocks.caseRows }) }) };
		},
	},
}));

import { load } from './+page.server.js';

describe('video analysis SSR page canonical evidence lookup', () => {
	beforeEach(() => {
		mocks.selectCall = 0;
		mocks.caseRows = [{ id: CASE_ID }];
		mocks.canonicalRow = { id: EVIDENCE_ID, caseId: CASE_ID, title: 'Canonical video', fileName: 'canonical.mp4', mimeType: 'video/mp4', evidenceType: 'video', type: 'video' };
	});

	it('authorizes and renders the durable worker evidence row', async () => {
		const result = await load({ params: { evidenceId: EVIDENCE_ID }, locals: { user: { id: '7' } } } as never);
		expect(result).toEqual({ evidenceId: EVIDENCE_ID, title: 'Canonical video', loadError: null });
		expect(mocks.selectCall).toBe(2);
	});

	it('does not render canonical evidence when case authorization fails', async () => {
		mocks.caseRows = [];
		const result = await load({ params: { evidenceId: EVIDENCE_ID }, locals: { user: { id: '7' } } } as never);
		expect(result).toMatchObject({ loadError: 'Failed to load video evidence', evidenceId: null });
	});
});
