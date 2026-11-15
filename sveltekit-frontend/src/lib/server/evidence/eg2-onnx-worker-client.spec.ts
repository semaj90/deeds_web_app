// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	EG2_ONNX_WORKER_BUNDLE_RELATIVE_PATH_V1,
	embedEvidenceTextViaEg2WorkerV1,
	shutdownEg2OnnxWorkerV1,
} from './eg2-onnx-worker-client.js';

const modelDir = process.env.ATLAS_EG2_WORKER_TEST_MODEL_DIR?.trim() || '';
const realModelEnabled = process.env.ATLAS_EG2_WORKER_E2E === '1' && modelDir.length > 0;

describe('EmbeddingGemma 2 ONNX worker client', () => {
	beforeAll(() => {
		const bundle = path.resolve(process.cwd(), EG2_ONNX_WORKER_BUNDLE_RELATIVE_PATH_V1);
		if (!existsSync(bundle)) {
			execFileSync(process.execPath, [path.resolve(process.cwd(), 'scripts/build/build-eg2-onnx-worker.mjs')], { stdio: 'pipe' });
		}
	});

	afterAll(async () => {
		await shutdownEg2OnnxWorkerV1();
	});

	it('returns the encoder error across the worker boundary and keeps the worker usable', async () => {
		const first = embedEvidenceTextViaEg2WorkerV1({ text: '   ', kind: 'document', modelDir: null });
		await expect(first).rejects.toThrow('EMBEDDINGGEMMA2_TEXT_INPUT_INVALID');
		const second = embedEvidenceTextViaEg2WorkerV1({ text: 'x', kind: 'document', modelDir: null });
		await expect(second).rejects.toThrow('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	});

	it.runIf(realModelEnabled)('matches the in-process text encoder on the real model', async () => {
		const { embedEvidenceTextWithEmbeddingGemma2OnnxV1 } = await import('./embeddinggemma2-onnx-image-v1.js');
		const text = 'Parent Atlas worker parity fixture';
		const viaWorker = await embedEvidenceTextViaEg2WorkerV1({ text, kind: 'document', modelDir });
		const direct = await embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text, kind: 'document', modelDir });
		expect(viaWorker.embedding).toHaveLength(768);
		expect(viaWorker.inputSha256).toBe(direct.inputSha256);
		expect(viaWorker.outputSha256).toBe(direct.outputSha256);
		expect(viaWorker.embedding).toEqual(direct.embedding);
	}, 300_000);
});
