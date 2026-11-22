import { describe, expect, it, vi } from 'vitest';
import type { db } from '$lib/server/db/client.js';
import { activeSceneCaptionsV1, sceneCaptionResponseV1Schema } from '$lib/reconstruction/scene-captions-v1.js';
import { fuseVideoEventsV1 } from '$lib/server/features/evidence/video/video-event-fusion-v1.js';
import { loadSceneCaptionsV1 } from './load-scene-captions-v1.js';

const seed = {
	caseId: '11111111-1111-4111-8111-111111111111', evidenceId: '22222222-2222-4222-8222-222222222222',
	transcriptId: '33333333-3333-4333-8333-333333333333', analysisRevision: 'analysis-1', sourceRevision: `sha256:${'a'.repeat(64)}`
};
const segment = { segmentIndex: 3, startMs: 1200, endMs: 2000, text: 'Original model text' };
const generated = fuseVideoEventsV1({ ...seed, frames: [], transcriptSegments: [segment] });
const event = { ...generated.events[0]!, reviewStatus: 'APPROVED' as const, sceneAdmission: 'APPROVED_FOR_SCENE_PROPOSAL' as const };
const timeline = { ...generated, events: [event] };
const scope = { caseId: seed.caseId, evidenceId: seed.evidenceId, analysisRevision: seed.analysisRevision,
	sourceRevision: seed.sourceRevision, eventId: event.eventId, startMs: event.startMs, endMs: event.endMs };
const row = { ...segment, transcriptId: seed.transcriptId, id: '44444444-4444-4444-8444-444444444444',
	text: 'Reviewer corrected excerpt', metadata: { reviewStatus: 'approved' } };

function fixture(rows: Array<typeof row>) {
	const limit = vi.fn().mockResolvedValue(rows);
	const select = vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) }));
	return { select, limit, database: { select } as unknown as Pick<typeof db, 'select'> };
}

describe('reviewed scene captions', () => {
	it('reads the canonical corrected excerpt and preserves exact half-open source timing', async () => {
		const mock = fixture([row]);
		const result = sceneCaptionResponseV1Schema.parse(await loadSceneCaptionsV1(scope, timeline, mock.database));
		expect(result.captions).toEqual([{ referenceId: event.sourceReferences[0]!.referenceId, segmentId: row.id,
			startMs: row.startMs, endMs: row.endMs, text: row.text, reviewed: true }]);
		expect(mock.limit).toHaveBeenCalledWith(64);
		expect(activeSceneCaptionsV1(result, 1200)).toEqual(result.captions);
		expect(activeSceneCaptionsV1(result, 2000)).toEqual([]);
		expect(activeSceneCaptionsV1(result, 1200)).toEqual(result.captions);
	});

	it('declines revised analysis, altered interval or revoked review before reading transcript text', async () => {
		const mock = fixture([row]);
		expect(await loadSceneCaptionsV1({ ...scope, analysisRevision: 'old' }, timeline, mock.database)).toBeNull();
		expect(await loadSceneCaptionsV1({ ...scope, endMs: scope.endMs + 1 }, timeline, mock.database)).toBeNull();
		expect(await loadSceneCaptionsV1(scope, { ...timeline, events: [{ ...event, reviewStatus: 'REJECTED', sceneAdmission: 'NOT_ADMITTED' }] }, mock.database)).toBeNull();
		expect(mock.select).not.toHaveBeenCalled();
	});

	it('counts missing and rejected references without using their original model text', async () => {
		for (const candidate of [[], [{ ...row, metadata: { reviewStatus: 'rejected' } }],
			[{ ...row, startMs: row.startMs + 1 }]]) {
			const mock = fixture(candidate);
			expect(await loadSceneCaptionsV1(scope, timeline, mock.database)).toEqual({ scope, captions: [], unavailableCount: 1 });
		}
	});
});
