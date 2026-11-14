import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const mocks = vi.hoisted(() => ({
	select: vi.fn(),
	from: vi.fn(),
	leftJoin: vi.fn(),
	where: vi.fn(),
	limit: vi.fn(),
	getVlmState: vi.fn(),
	getFile: vi.fn(),
	yolo: { isModelAvailable: vi.fn(), analyzeDocument: vi.fn() },
	analyzeEvidenceImage: vi.fn(),
	update: vi.fn(),
	set: vi.fn(),
	updateWhere: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({ db: { select: (...args: unknown[]) => mocks.select(...args), update: (...args: unknown[]) => mocks.update(...args) } }));
vi.mock('$lib/server/db/schema-postgres.js', () => ({
	cases: { id: 'case.id', userId: 'case.userId', assignedAttorney: 'case.assignedAttorney' },
	evidence: {
		id: 'evidence.id', caseId: 'evidence.caseId', userId: 'evidence.userId', uploadedBy: 'evidence.uploadedBy',
		fileUrl: 'evidence.fileUrl', fileName: 'evidence.fileName', mimeType: 'evidence.mimeType', title: 'evidence.title', hash: 'evidence.hash',
	},
}));
vi.mock('$lib/server/seaweed-client.js', () => ({ getSeaweedFile: (...args: unknown[]) => mocks.getFile(...args) }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_EVIDENCE_BUCKET: 'evidence' } }));
vi.mock('$lib/server/validation.js', () => ({ isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value) }));
vi.mock('$lib/server/inference/vlm-lifecycle.js', () => ({
	getVlmState: (...args: unknown[]) => mocks.getVlmState(...args),
	VlmMode: { VISION: 'VISION', TEXT: 'TEXT' },
}));
vi.mock('$lib/server/yolo.js', () => ({ createYOLOService: () => mocks.yolo }));
vi.mock('$lib/server/analysis/vlm-evidence-analyzer.js', () => ({ analyzeEvidenceImage: (...args: unknown[]) => mocks.analyzeEvidenceImage(...args) }));
vi.mock('drizzle-orm', () => ({
	and: (...conditions: unknown[]) => ({ and: conditions }),
	eq: (...fields: unknown[]) => ({ eq: fields }),
	isNotNull: (field: unknown) => ({ isNotNull: field }),
	or: (...conditions: unknown[]) => ({ or: conditions }),
}));

import { POST } from './+server.js';

const evidenceId = '6b2749f6-03d8-42b7-a4e0-93983c62cc1d';

function makeEvent(user?: { id: string }) {
	return {
		params: { id: evidenceId },
		locals: user ? { user } : {},
		request: new Request('http://localhost/api/evidence/test/vlm-analyze', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		}),
	} as never;
}

describe('evidence VLM analysis access boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getVlmState.mockResolvedValue('VISION');
		mocks.yolo.isModelAvailable.mockResolvedValue(false);
		mocks.update.mockReturnValue({ set: (...args: unknown[]) => { mocks.set(...args); return { where: (...whereArgs: unknown[]) => mocks.updateWhere(...whereArgs) }; } });
		mocks.updateWhere.mockResolvedValue([]);
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.from.mockReturnValue({ leftJoin: mocks.leftJoin });
		mocks.leftJoin.mockReturnValue({ where: mocks.where });
		mocks.where.mockReturnValue({ limit: mocks.limit });
	});

	it('rejects unauthenticated calls before lifecycle or database access', async () => {
		const response = await POST(makeEvent());

		expect(response.status).toBe(401);
		expect(mocks.getVlmState).not.toHaveBeenCalled();
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it('does not expose evidence outside the user or assigned case', async () => {
		mocks.limit.mockResolvedValue([]);

		const response = await POST(makeEvent({ id: '42' }));

		expect(response.status).toBe(404);
		expect(mocks.leftJoin).toHaveBeenCalled();
		expect(mocks.where).toHaveBeenCalledTimes(1);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('admits an authorized row without reading storage when it has no source location', async () => {
		mocks.limit.mockResolvedValue([{ fileUrl: null, fileName: null, mimeType: 'image/png', title: 'Evidence' }]);

		const response = await POST(makeEvent({ id: '42' }));

		expect(response.status).toBe(400);
		expect(mocks.where).toHaveBeenCalledTimes(1);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});

	it('returns source-bound object detections and a visual description for the stored image', async () => {
		const source = Buffer.from('verified-image-fixture');
		const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
		mocks.limit.mockResolvedValue([{
			fileUrl: 'seaweed://evidence/case/image.png', fileName: 'image.png', mimeType: 'image/png',
			title: 'Exhibit image', hash: sourceHash,
		}]);
		mocks.getFile.mockResolvedValue(source);
		mocks.yolo.isModelAvailable.mockResolvedValue(true);
		mocks.yolo.analyzeDocument.mockResolvedValue({
			objects: [{ class: 'vehicle', bbox: [10, 12, 80, 90], confidence: 0.91 }],
			layout: { regions: [] },
		});
		mocks.analyzeEvidenceImage.mockResolvedValue({ summary: 'A vehicle is visible.', keyFindings: ['Vehicle'], suggestedTags: ['vehicle'] });

		const response = await POST(makeEvent({ id: '42' }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.sourceRevision).toBe(`sha256:${sourceHash}`);
		expect(payload.boxes).toEqual([{ x: 10, y: 12, w: 70, h: 78, label: 'vehicle', conf: 0.91 }]);
		expect(payload.analysis.summary).toBe('A vehicle is visible.');
		expect(payload.detectorStatus).toBe('completed');
		expect(payload.vlmStatus).toBe('completed');
		expect(mocks.update).toHaveBeenCalledOnce();
	});

	it('rejects stored bytes that no longer match the evidence source hash before inference', async () => {
		mocks.limit.mockResolvedValue([{
			fileUrl: 'seaweed://evidence/case/image.png', fileName: 'image.png', mimeType: 'image/png',
			title: 'Exhibit image', hash: 'a'.repeat(64),
		}]);
		mocks.getFile.mockResolvedValue(Buffer.from('changed-bytes'));

		const response = await POST(makeEvent({ id: '42' }));
		const payload = await response.json();

		expect(response.status).toBe(409);
		expect(payload.code).toBe('SOURCE_HASH_MISMATCH');
		expect(mocks.yolo.analyzeDocument).not.toHaveBeenCalled();
		expect(mocks.analyzeEvidenceImage).not.toHaveBeenCalled();
	});

	it('keeps image detection available when the visual language model is not in vision mode', async () => {
		const source = Buffer.from('verified-image-fixture');
		const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
		mocks.limit.mockResolvedValue([{
			fileUrl: 'seaweed://evidence/case/image.png', fileName: 'image.png', mimeType: 'image/png',
			title: 'Exhibit image', hash: sourceHash,
		}]);
		mocks.getFile.mockResolvedValue(source);
		mocks.getVlmState.mockResolvedValue('TEXT');
		mocks.yolo.isModelAvailable.mockResolvedValue(true);
		mocks.yolo.analyzeDocument.mockResolvedValue({
			objects: [{ class: 'person', bbox: [1, 2, 11, 22], confidence: 0.7 }],
			layout: { regions: [] },
		});

		const response = await POST(makeEvent({ id: '42' }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.detectorStatus).toBe('completed');
		expect(payload.boxes).toHaveLength(1);
		expect(payload.vlmStatus).toBe('unavailable');
		expect(payload.warnings.join(' ')).toContain('Vision model is not ready');
		expect(mocks.analyzeEvidenceImage).not.toHaveBeenCalled();
	});

	it('refuses non-image evidence before reading the stored object', async () => {
		mocks.limit.mockResolvedValue([{
			fileUrl: 'seaweed://evidence/case/clip.mp4', fileName: 'clip.mp4', mimeType: 'video/mp4',
			title: 'Video exhibit', hash: 'a'.repeat(64),
		}]);

		const response = await POST(makeEvent({ id: '42' }));

		expect(response.status).toBe(415);
		expect(mocks.getFile).not.toHaveBeenCalled();
	});
});
