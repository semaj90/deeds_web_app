// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/db/client', () => ({ pgRows: (value: unknown) => value, db: {} }));
vi.mock('$lib/server/ai/local-llama-provider.js', () => ({
	LLAMA_SERVER_BASE_URL: 'http://llama.invalid/v1',
	LOCAL_VLM_MODEL: 'fixture-vlm',
}));

import { detectEvidenceObjects, type EvidenceDetectionDeps } from './evidence-analysis-pipeline.js';

const buffer = Buffer.from('image-fixture');
const localResult = {
	text: '',
	layout: { regions: [] },
	objects: [{ class: 'bus', confidence: 0.87, bbox: [6, 228, 806, 744] }],
	processingTime: 12,
	method: 'yolo' as const,
	modelType: 'coco' as const,
};

function deps(overrides: Partial<EvidenceDetectionDeps> = {}): EvidenceDetectionDeps {
	return {
		serviceUrl: () => 'http://detector.invalid',
		detectViaService: vi.fn(async () => ({
			detections: [{ class: 'person', confidence: 0.9, bbox: [1, 2, 3, 4] }],
		})),
		localAvailable: vi.fn(async () => true),
		detectLocal: vi.fn(async () => localResult),
		...overrides,
	};
}

// Opt-in real run (no mocks for the detector): set ATLAS_DETECT_FIXTURE to an image path.
// Uses the default dependencies, so it honours YOLO_PYTHON and DOCLING_SERVICE_URL. Writes nothing.
describe.skipIf(!process.env.ATLAS_DETECT_FIXTURE)('detectEvidenceObjects (real detector, opt-in)', () => {
	it('runs the default detector path on the fixture image', async () => {
		const { readFile } = await import('node:fs/promises');
		const outcome = await detectEvidenceObjects(await readFile(process.env.ATLAS_DETECT_FIXTURE!), 'fixture.jpg');
		console.log(
			'REAL_DETECT ' +
				JSON.stringify({
					source: outcome.source,
					errors: outcome.errors,
					objects: outcome.result?.objects.map((o) => `${o.class}:${o.confidence.toFixed(2)}`) ?? null,
				})
		);
		if (process.env.ATLAS_DETECT_EXPECT === 'none') {
			expect(outcome.result).toBeNull();
			expect(outcome.errors.length).toBeGreaterThan(0);
		} else {
			expect(outcome.result).not.toBeNull();
			for (const o of outcome.result!.objects) expect(o.bbox).toHaveLength(4);
		}
	}, 120_000);
});

describe('detectEvidenceObjects', () => {
	it('uses the detection service first and does not start the local detector', async () => {
		const d = deps();
		const outcome = await detectEvidenceObjects(buffer, 'a.jpg', d);

		expect(outcome.source).toBe('service');
		expect(outcome.result?.objects).toEqual([{ class: 'person', confidence: 0.9, bbox: [1, 2, 3, 4] }]);
		expect(outcome.errors).toEqual([]);
		expect(d.localAvailable).not.toHaveBeenCalled();
	});

	it('falls back to the local detector when the service fails, and records why', async () => {
		const d = deps({ detectViaService: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
		const outcome = await detectEvidenceObjects(buffer, 'a.jpg', d);

		expect(outcome.source).toBe('local');
		expect(outcome.result).toBe(localResult);
		expect(outcome.errors).toEqual(['service:ECONNREFUSED']);
	});

	it('skips the service when it is not configured', async () => {
		const d = deps({ serviceUrl: () => undefined });
		const outcome = await detectEvidenceObjects(buffer, 'a.jpg', d);

		expect(outcome.source).toBe('local');
		expect(d.detectViaService).not.toHaveBeenCalled();
		expect(outcome.errors).toEqual(['service:DOCLING_SERVICE_URL_NOT_CONFIGURED']);
	});

	it('rejects malformed service detections instead of passing them through', async () => {
		const d = deps({
			detectViaService: vi.fn(async () => ({
				detections: [{ class: 'person', confidence: 2, bbox: [1, 2] }],
			})),
			localAvailable: vi.fn(async () => false),
		});
		const outcome = await detectEvidenceObjects(buffer, 'a.jpg', d);

		expect(outcome.result).toBeNull();
		expect(outcome.errors[0]).toBe('service:SERVICE_DETECTION_INVALID');
	});

	it('reports no detector as a null result with reasons, never an empty success', async () => {
		const d = deps({ serviceUrl: () => undefined, localAvailable: vi.fn(async () => false) });
		const outcome = await detectEvidenceObjects(buffer, 'a.jpg', d);

		expect(outcome.result).toBeNull();
		expect(outcome.source).toBe('none');
		expect(outcome.errors).toEqual([
			'service:DOCLING_SERVICE_URL_NOT_CONFIGURED',
			'local:PYTHON_ONNXRUNTIME_OR_MODEL_UNAVAILABLE',
		]);
		expect(d.detectLocal).not.toHaveBeenCalled();
	});

	it('records a local detector crash', async () => {
		const d = deps({
			serviceUrl: () => undefined,
			detectLocal: vi.fn().mockRejectedValue(new Error('YOLO process exited 1')),
		});
		const outcome = await detectEvidenceObjects(buffer, 'a.jpg', d);

		expect(outcome.result).toBeNull();
		expect(outcome.errors).toContain('local:YOLO process exited 1');
	});
});
