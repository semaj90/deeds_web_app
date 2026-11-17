// @vitest-environment node
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
	EMBEDDINGGEMMA2_ONNX_MODEL_ARTIFACT_SHA256_V1,
	EMBEDDINGGEMMA2_ONNX_QUANTIZATION_V1,
	EMBEDDINGGEMMA2_ONNX_REVISION_V1,
	EMBEDDINGGEMMA2_ONNX_EXPECTED_FILES_V1,
	EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1,
	EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1,
	embedEvidenceAudioWithEmbeddingGemma2OnnxV1,
	embedEvidenceImageWithEmbeddingGemma2OnnxV1,
	readPcm16MonoWavWindowV1,
} from './embeddinggemma2-onnx-image-v1.js';

function pcm16MonoWav(samples: number[]): Buffer {
	const dataBytes = samples.length * 2;
	const wav = Buffer.alloc(44 + dataBytes);
	wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8);
	wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(16_000, 24); wav.writeUInt32LE(32_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
	wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
	samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2));
	return wav;
}

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

	it('decodes only bounded PCM16 mono WAV windows and rejects unsupported layouts', () => {
		const wav = pcm16MonoWav([-32768, -16384, 0, 16384, 32767]);
		const { info, pcm } = readPcm16MonoWavWindowV1(wav, 1, 3);
		expect(info).toMatchObject({ sampleRate: 16_000, sampleCount: 5 });
		expect(Array.from(pcm)).toEqual([-0.5, 0, 0.5]);
		expect(() => readPcm16MonoWavWindowV1(wav, 5, 1)).toThrow('EMBEDDINGGEMMA2_AUDIO_WINDOW_INVALID');
		const stereo = Buffer.from(wav);
		stereo.writeUInt16LE(2, 22);
		expect(() => readPcm16MonoWavWindowV1(stereo, 0, 1)).toThrow('EMBEDDINGGEMMA2_AUDIO_WAV_FORMAT_UNSUPPORTED');
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

		it('embeds bounded PCM audio through the audio tower and shared 768-D text encoder', async () => {
			const pcm = Float32Array.from({ length: EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1 }, (_, index) =>
				0.15 * Math.sin((2 * Math.PI * 440 * index) / EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1));
			const result = await embedEvidenceAudioWithEmbeddingGemma2OnnxV1({
				pcm,
				sampleRate: EMBEDDINGGEMMA2_ONNX_AUDIO_SAMPLE_RATE_V1,
				modelDir,
			});
			const norm = Math.sqrt(result.embedding.reduce((sum, value) => sum + value * value, 0));
			expect(result.embedding).toHaveLength(768);
			expect(norm).toBeCloseTo(1, 5);
			expect(result.durationMs).toBe(1000);
			expect(result.preprocessingRevision).toContain('audio-pcm-f32le-16khz-mono');
			expect(result.inputSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
			expect(result.outputSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
		}, 120_000);
	});

	it('rejects empty text and an unconfigured model directory for text embedding', async () => {
		const { embedEvidenceTextWithEmbeddingGemma2OnnxV1 } = await import('./embeddinggemma2-onnx-image-v1.js');
		await expect(embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text: '   ', kind: 'document', modelDir: 'x' }))
			.rejects.toThrow('EMBEDDINGGEMMA2_TEXT_INPUT_INVALID');
		await expect(embedEvidenceTextWithEmbeddingGemma2OnnxV1({ text: 'hello', kind: 'document' }))
			.rejects.toThrow('EMBEDDINGGEMMA2_ONNX_MODEL_DIR_UNCONFIGURED');
	});

	it('rejects wrong-rate, non-finite, and over-budget PCM before model loading', async () => {
		const pcm = new Float32Array([0, 0.1]);
		await expect(embedEvidenceAudioWithEmbeddingGemma2OnnxV1({ pcm, sampleRate: 8_000, modelDir: 'x' }))
			.rejects.toThrow('EMBEDDINGGEMMA2_AUDIO_INPUT_INVALID');
		await expect(embedEvidenceAudioWithEmbeddingGemma2OnnxV1({ pcm: new Float32Array([Number.NaN]), sampleRate: 16_000, modelDir: 'x' }))
			.rejects.toThrow('EMBEDDINGGEMMA2_AUDIO_PCM_SAMPLE_INVALID');
		await expect(embedEvidenceAudioWithEmbeddingGemma2OnnxV1({
			pcm: new Float32Array(EMBEDDINGGEMMA2_ONNX_AUDIO_MAX_SAMPLES_V1 + 1),
			sampleRate: 16_000,
			modelDir: 'x',
		})).rejects.toThrow('EMBEDDINGGEMMA2_AUDIO_INPUT_INVALID');
	});
});
