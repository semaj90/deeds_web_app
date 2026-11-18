import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
	runSam2SilhouetteAdapterV1,
	selectSam2PromptBoxesV1,
	SAM2_MAX_BOXES_V1,
	type YoloBoxV1,
} from './sam2-silhouette-adapter-v1.js';

const bytes = new Uint8Array([1, 2, 3]);
const png = new Uint8Array([137, 80, 78, 71, 1, 2]);
const person = (conf: number, box: [number, number, number, number] = [0.1, 0.1, 0.5, 0.9]): YoloBoxV1 => ({
	label: 'person', confidence: conf, bboxNormalized: box,
});

function fakePorts(overrides: { runMask?: unknown; writeMask?: unknown } = {}) {
	const writes: Array<{ maskSha256: string; targetBoxIndex: number }> = [];
	return {
		writes,
		ports: {
			runMask: (overrides.runMask as never) ?? (async () => ({ maskPng: png, iouScore: 0.9 })),
			writeMask: (overrides.writeMask as never) ?? (async (input: { maskSha256: string; targetBoxIndex: number }) => {
				writes.push({ maskSha256: input.maskSha256, targetBoxIndex: input.targetBoxIndex });
				return { maskObjectKey: `derived/sam2/${input.maskSha256}.png` };
			}),
		},
	};
}

describe('sam2 silhouette adapter v1', () => {
	it('returns one contract-valid silhouette per admitted person box, with the mask hash the writer received', async () => {
		const { ports, writes } = fakePorts();
		const result = await runSam2SilhouetteAdapterV1({ bytes, mimeType: 'image/png', boxes: [person(0.8)] }, ports);
		expect(result.status).toBe('EXECUTED');
		expect(result.masks).toHaveLength(1);
		const mask = result.masks[0]!;
		expect(mask).toMatchObject({ artifactKind: 'sam2_alpha_silhouette', is3DReconstruction: false, targetBoxIndex: 0, label: 'person', iouScore: 0.9 });
		expect(mask.maskSha256).toBe(createHash('sha256').update(png).digest('hex'));
		expect(writes[0]).toEqual({ maskSha256: mask.maskSha256, targetBoxIndex: 0 });
	});

	it('drops boxes below the confidence floor and keeps the highest-confidence ones first', () => {
		const picked = selectSam2PromptBoxesV1([person(0.1), person(0.9), person(0.5)]);
		expect(picked.map((b) => b.confidence)).toEqual([0.9, 0.5]);
	});

	it('rejects non-unit or degenerate boxes instead of prompting SAM 2 with them', () => {
		const picked = selectSam2PromptBoxesV1([
			person(0.9, [0, 0, 1.2, 0.5]),
			person(0.9, [0.5, 0.5, 0.4, 0.9]),
			person(0.9, [0.1, 0.1, Number.NaN, 0.9]),
		]);
		expect(picked).toEqual([]);
	});

	it('caps the number of prompts', () => {
		const many = Array.from({ length: SAM2_MAX_BOXES_V1 + 5 }, (_, i) => person(0.9 - i * 0.01));
		expect(selectSam2PromptBoxesV1(many)).toHaveLength(SAM2_MAX_BOXES_V1);
	});

	it('returns EXECUTED with no masks when nothing qualifies, without calling the runner', async () => {
		let calls = 0;
		const { ports } = fakePorts({ runMask: async () => { calls++; return { maskPng: png, iouScore: 0.9 }; } });
		const result = await runSam2SilhouetteAdapterV1({ bytes, mimeType: 'image/png', boxes: [person(0.05)] }, ports);
		expect(result).toEqual({ status: 'EXECUTED', masks: [] });
		expect(calls).toBe(0);
	});

	it('fails closed with no partial output when the runner throws on the second box', async () => {
		let n = 0;
		const { ports } = fakePorts({
			runMask: async () => { if (++n === 2) throw new Error('CUDA_OOM'); return { maskPng: png, iouScore: 0.9 }; },
		});
		const result = await runSam2SilhouetteAdapterV1({ bytes, mimeType: 'image/png', boxes: [person(0.9), person(0.8)] }, ports);
		expect(result).toEqual({ status: 'FAILED', masks: [] });
	});

	it('fails closed when a mask is empty or the score is out of range', async () => {
		const empty = fakePorts({ runMask: async () => ({ maskPng: new Uint8Array(0), iouScore: 0.9 }) });
		expect((await runSam2SilhouetteAdapterV1({ bytes, mimeType: 'image/png', boxes: [person(0.9)] }, empty.ports)).status).toBe('FAILED');
		const bad = fakePorts({ runMask: async () => ({ maskPng: png, iouScore: 1.5 }) });
		expect((await runSam2SilhouetteAdapterV1({ bytes, mimeType: 'image/png', boxes: [person(0.9)] }, bad.ports)).status).toBe('FAILED');
	});

	it('fails closed when the mask writer fails, and never returns an unstored mask', async () => {
		const { ports } = fakePorts({ writeMask: async () => { throw new Error('STORAGE_DOWN'); } });
		const result = await runSam2SilhouetteAdapterV1({ bytes, mimeType: 'image/png', boxes: [person(0.9)] }, ports);
		expect(result).toEqual({ status: 'FAILED', masks: [] });
	});
});
