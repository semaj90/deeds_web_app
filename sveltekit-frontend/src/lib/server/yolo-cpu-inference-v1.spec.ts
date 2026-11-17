import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createYOLOService } from './yolo.js';

// Opt-in CPU inference check (DET-06). Set YOLO_TEST_IMAGE to a rights-cleared photo path.
// Skipped in normal runs so no photo or model is required in the repo.
const imagePath = process.env.YOLO_TEST_IMAGE?.trim();
const minObjects = Number(process.env.YOLO_TEST_MIN_OBJECTS ?? '1');

describe.skipIf(!imagePath)('YOLOX-Nano CPU inference (opt-in)', () => {
	it('detects objects on a supplied photo through the production service', async () => {
		const service = createYOLOService();
		expect(await service.isModelAvailable()).toBe(true);

		const result = await service.analyzeDocument(readFileSync(imagePath as string), 'fixture.jpg');

		expect(result.method).toBe('yolo');
		expect(result.objects.length).toBeGreaterThanOrEqual(minObjects);
		for (const object of result.objects) {
			expect(object.confidence).toBeGreaterThan(0);
			expect(object.confidence).toBeLessThanOrEqual(1);
			expect(object.bbox).toHaveLength(4);
		}
	});
});
