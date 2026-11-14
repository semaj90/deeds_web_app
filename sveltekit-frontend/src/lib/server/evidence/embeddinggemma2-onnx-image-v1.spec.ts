// @vitest-environment node
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
	EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1,
	EMBEDDINGGEMMA2_ONNX_QUANTIZATION_V1,
	EMBEDDINGGEMMA2_ONNX_REVISION_V1,
	EMBEDDINGGEMMA2_ONNX_EXPECTED_FILES_V1,
	embedEvidenceImageWithEmbeddingGemma2OnnxV1,
} from './embeddinggemma2-onnx-image-v1.js';

describe('EmbeddingGemma 2 ONNX image adapter', () => {
	it('pins the model export and all three modality graph-data pairs', () => {
		expect(EMBEDDINGGEMMA2_ONNX_REVISION_V1).toMatch(/^[a-f0-9]{40}$/);
		expect(EMBEDDINGGEMMA2_ONNX_QUANTIZATION_V1).toBe('q8');
		expect(Object.keys(EMBEDDINGGEMMA2_ONNX_EXPECTED_FILES_V1)).toHaveLength(13);
		expect(EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it('fails closed when the local pinned model directory is not configured', async () => {
		await expect(embedEvidenceImageWithEmbeddingGemma2OnnxV1({
			buffer: Buffer.from([1]),
		})).rejects.toThrow('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	});

	const modelDir = process.env.ATLAS_EMBEDDINGGEMMA2_ONNX_MODEL_DIR;
	const integration = modelDir ? describe : describe.skip;
	integration('local pinned model smoke', () => {
		it('embeds a fixture image through the vision and text towers', async () => {
			const buffer = await sharp({
				create: { width: 96, height: 64, channels: 3, background: { r: 180, g: 60, b: 25 } },
			}).png().toBuffer();
			const result = await embedEvidenceImageWithEmbeddingGemma2OnnxV1({ buffer, modelDir });
			const norm = Math.sqrt(result.embedding.reduce((sum, value) => sum + value * value, 0));
			expect(result.embedding).toHaveLength(768);
			expect(norm).toBeCloseTo(1, 5);
			expect(result.inputSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
			expect(result.outputSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
			expect(result.modelRevision).toBe(EMBEDDINGGEMMA2_ONNX_REVISION_V1);
		}, 120_000);

		it('embeds text into the same 768-D space, with distinct document and query recipes', async () => {
			const { embedEvidenceTextWithEmbeddingGemma2OnnxV1 } = await import('./embeddinggemma2-onnx-image-v1.js');
			const text = 'The witness signed the lease agreement on 4 March.';
			const doc = await embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text, kind: 'document', modelDir });
			const again = await embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text, kind: 'document', modelDir });
			const related = await embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text: 'who signed the lease?', kind: 'query', modelDir });
			const unrelated = await embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text: 'weather forecast for tomorrow', kind: 'query', modelDir });
			const dot = (x: number[], y: number[]) => x.reduce((sum, value, index) => sum + value * y[index], 0);
			expect(doc.embedding).toHaveLength(768);
			expect(dot(doc.embedding, doc.embedding)).toBeCloseTo(1, 4);
			expect(again.outputSha256).toBe(doc.outputSha256);
			expect(doc.preprocessingRevision).not.toBe(related.preprocessingRevision);
			expect(doc.inputSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
			console.log('EG2_TEXT cos(doc, related query)=' + dot(doc.embedding, related.embedding).toFixed(4)
				+ ' cos(doc, unrelated query)=' + dot(doc.embedding, unrelated.embedding).toFixed(4));
			expect(dot(doc.embedding, related.embedding)).toBeGreaterThan(dot(doc.embedding, unrelated.embedding));
		}, 120_000);
	});

	it('rejects empty text and an unconfigured model directory for text embedding', async () => {
		const { embedEvidenceTextWithEmbeddingGemma2OnnxV1 } = await import('./embeddinggemma2-onnx-image-v1.js');
		await expect(embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text: '   ', kind: 'document', modelDir: 'x' }))
			.rejects.toThrow('EMBEDDINGGEMMA2_TEXT_INPUT_INVALID');
		await expect(embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text: 'hello', kind: 'document' }))
			.rejects.toThrow('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	});
});
